use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::PathBuf,
};

#[derive(Serialize)]
pub struct Fingerprint {
    pub agent: String,
    pub path: String,
    pub version: String,
    pub exists: bool,
}
#[tauri::command]
pub fn config_fingerprints() -> Vec<Fingerprint> {
    let mut paths: Vec<(&str, PathBuf)> = Vec::new();
    if let Ok(path) = crate::codex::codex_config_path() {
        paths.push(("codex", path.clone()));
        paths.push(("codex", path.with_file_name("auth.json")));
    }
    if let Ok(path) = crate::claude::claude_config_path() {
        paths.push(("claude", path));
    }
    if let Ok(path) = crate::workbuddy::workbuddy_config_path() {
        paths.push(("workbuddy", path));
    }
    if let Ok(path) = crate::accio::config::get_accio_config_path() {
        paths.push(("acciowork", path));
    }
    paths
        .into_iter()
        .map(|(agent, path)| {
            let mut hash = DefaultHasher::new();
            let data = std::fs::read(&path).ok();
            data.hash(&mut hash);
            Fingerprint {
                agent: agent.into(),
                path: path.to_string_lossy().into_owned(),
                version: format!("{:016x}", hash.finish()),
                exists: data.is_some(),
            }
        })
        .collect()
}
