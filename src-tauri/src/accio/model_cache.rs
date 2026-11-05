use super::config::AccioConfig;
use once_cell::sync::Lazy;
use sha2::{Digest, Sha256};
use std::{
    future::Future,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::watch;

const TTL: Duration = Duration::from_secs(300);
const RETRY_DELAY: Duration = Duration::from_secs(10);
static CACHE: Lazy<Arc<ModelCache>> = Lazy::new(|| Arc::new(ModelCache::default()));

#[derive(Default)]
struct CacheState {
    fingerprint: String,
    generation: u64,
    models: Vec<String>,
    fetched_at: Option<Instant>,
    retry_at: Option<Instant>,
    pending: Option<watch::Receiver<bool>>,
}

impl CacheState {
    fn select(&mut self, fingerprint: &str) {
        if self.fingerprint != fingerprint {
            self.fingerprint = fingerprint.to_owned();
            self.generation = self.generation.wrapping_add(1);
            self.models.clear();
            self.fetched_at = None;
            self.retry_at = None;
            self.pending = None;
        }
    }
}

#[derive(Default)]
struct ModelCache {
    state: Mutex<CacheState>,
}

fn fingerprint(config: &AccioConfig) -> String {
    let mut hash = Sha256::new();
    hash.update(super::bridge::clean_base_url(&config.base_url).as_bytes());
    hash.update([0]);
    hash.update(config.api_key.trim().as_bytes());
    format!("{:x}", hash.finalize())
}

impl ModelCache {
    async fn models_with<F, Fut>(self: &Arc<Self>, config: AccioConfig, fetch: F) -> Vec<String>
    where
        F: FnOnce(AccioConfig) -> Fut + Send + 'static,
        Fut: Future<Output = Result<Vec<String>, String>> + Send + 'static,
    {
        let key = fingerprint(&config);
        let (mut receiver, stale) = {
            let mut state = self.state.lock().unwrap();
            state.select(&key);
            if config.api_key.trim().is_empty() || config.base_url.trim().is_empty() {
                return Vec::new();
            }
            let now = Instant::now();
            if state
                .fetched_at
                .is_some_and(|time| now.duration_since(time) < TTL)
                || state.retry_at.is_some_and(|time| now < time)
            {
                return state.models.clone();
            }
            let stale = state.fetched_at.map(|_| state.models.clone());
            let receiver = if let Some(receiver) = &state.pending {
                receiver.clone()
            } else {
                let (sender, receiver) = watch::channel(false);
                state.pending = Some(receiver.clone());
                let generation = state.generation;
                let cache = self.clone();
                let task_key = key.clone();
                tokio::spawn(async move {
                    let result = fetch(config).await;
                    let mut state = cache.state.lock().unwrap();
                    // A slow request for a previous credential must never replace the new list.
                    if state.fingerprint == task_key && state.generation == generation {
                        state.pending = None;
                        match result {
                            Ok(models) => {
                                let mut seen = std::collections::HashSet::new();
                                state.models = models
                                    .into_iter()
                                    .map(|model| model.trim().to_owned())
                                    .filter(|model| !model.is_empty() && seen.insert(model.clone()))
                                    .collect();
                                state.fetched_at = Some(Instant::now());
                                state.retry_at = None;
                            }
                            Err(_) => {
                                // Do not keep advertising models after access is revoked.
                                state.models.clear();
                                state.fetched_at = None;
                                state.retry_at = Some(Instant::now() + RETRY_DELAY);
                                log::warn!(
                                    "Accio model discovery failed; list cleared, retry scheduled"
                                );
                            }
                        }
                    }
                    let _ = sender.send(true);
                });
                receiver
            };
            (receiver, stale)
        };
        if let Some(models) = stale {
            return models;
        }
        if !*receiver.borrow() {
            let _ = receiver.changed().await;
        }
        let state = self.state.lock().unwrap();
        if state.fingerprint == key {
            state.models.clone()
        } else {
            Vec::new()
        }
    }
}

pub async fn models(config: &AccioConfig) -> Vec<String> {
    CACHE
        .models_with(config.clone(), |config| async move {
            crate::model_fetch::fetch_models_for(
                "acciowork",
                &config.base_url,
                config.api_key.trim(),
            )
            .await
            .map(|models| models.into_iter().map(|model| model.id).collect())
        })
        .await
}

pub fn configuration_saved(config: &AccioConfig) {
    CACHE.state.lock().unwrap().select(&fingerprint(config));
    if super::is_bridge_running() {
        prewarm(config.clone());
    }
}

pub fn prewarm(config: AccioConfig) {
    if let Ok(runtime) = tokio::runtime::Handle::try_current() {
        runtime.spawn(async move {
            models(&config).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn config(key: &str) -> AccioConfig {
        AccioConfig {
            base_url: "https://node.example".into(),
            api_key: key.into(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn concurrent_cold_requests_share_discovery_and_empty_success_is_cached() {
        let cache = Arc::new(ModelCache::default());
        let calls = Arc::new(AtomicUsize::new(0));
        let mut jobs = Vec::new();
        for _ in 0..8 {
            let cache = cache.clone();
            let calls = calls.clone();
            jobs.push(tokio::spawn(async move {
                cache
                    .models_with(config("key-a"), move |_| async move {
                        calls.fetch_add(1, Ordering::SeqCst);
                        tokio::task::yield_now().await;
                        Ok(vec![])
                    })
                    .await
            }));
        }
        for job in jobs {
            assert!(job.await.unwrap().is_empty());
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        cache
            .models_with(config("key-a"), |_| async {
                panic!("fresh empty result was fetched again")
            })
            .await;
    }

    #[tokio::test]
    async fn switching_key_or_node_does_not_wait_for_or_accept_old_inflight_results() {
        let cache = Arc::new(ModelCache::default());
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = tokio::sync::oneshot::channel();
        let old_cache = cache.clone();
        let old = tokio::spawn(async move {
            old_cache
                .models_with(config("key-a"), |_| async move {
                    started_tx.send(()).unwrap();
                    release_rx.await.unwrap();
                    Ok(vec!["old-model".into()])
                })
                .await
        });
        started_rx.await.unwrap();
        let current = tokio::time::timeout(
            Duration::from_secs(2),
            cache.models_with(config("key-b"), |_| async {
                Ok(vec!["new-model".into(), "new-model".into(), " ".into()])
            }),
        )
        .await
        .unwrap();
        assert_eq!(current, vec!["new-model"]);
        release_tx.send(()).unwrap();
        assert!(old.await.unwrap().is_empty());
        assert_eq!(cache.state.lock().unwrap().models, vec!["new-model"]);
        let mut other_node = config("key-b");
        other_node.base_url = "https://other-node.example".into();
        assert_eq!(
            cache
                .models_with(other_node, |_| async { Ok(vec!["other-model".into()]) })
                .await,
            vec!["other-model"]
        );
    }

    #[tokio::test]
    async fn stale_models_refresh_in_background_and_failure_removes_revoked_access() {
        let cache = Arc::new(ModelCache::default());
        cache
            .models_with(config("key-a"), |_| async { Ok(vec!["old-model".into()]) })
            .await;
        cache.state.lock().unwrap().fetched_at = Some(Instant::now() - TTL);
        let (release_tx, release_rx) = tokio::sync::oneshot::channel();
        let stale = cache
            .models_with(config("key-a"), |_| async move {
                release_rx.await.unwrap();
                Err("HTTP 403".into())
            })
            .await;
        assert_eq!(stale, vec!["old-model"]);
        let mut pending = cache.state.lock().unwrap().pending.clone().unwrap();
        release_tx.send(()).unwrap();
        pending.changed().await.unwrap();
        assert!(cache
            .models_with(config("key-a"), |_| async {
                panic!("retry backoff ignored")
            })
            .await
            .is_empty());
    }

    #[test]
    fn fingerprint_normalizes_root_and_never_contains_credentials() {
        let original = config("secret-fixture");
        let mut alternate = original.clone();
        alternate.base_url += "/v1/";
        assert_eq!(fingerprint(&original), fingerprint(&alternate));
        assert_eq!(fingerprint(&original).len(), 64);
        assert!(!fingerprint(&original).contains("secret-fixture"));
    }
}
