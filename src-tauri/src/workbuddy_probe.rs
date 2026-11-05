use crate::api_test::{ApiTestResult, TestStreamEvent};
use futures_util::StreamExt;
use reqwest::{header, Client};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
pub const MODEL_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_BODY: usize = 256 * 1024;
const MAX_PREVIEW: usize = 4096;

fn log(emit: &impl Fn(TestStreamEvent), key: &str, level: &str) {
    emit(TestStreamEvent::Log {
        text: key.into(),
        level: level.into(),
    });
}

fn payload(model: &str) -> Value {
    let name = model.to_ascii_lowercase();
    let reasoning = name.starts_with("gpt-5")
        || name.starts_with("gpt-6")
        || ["o1", "o3", "o4"]
            .iter()
            .any(|prefix| name == *prefix || name.starts_with(&format!("{prefix}-")));
    let mut body = json!({
        "model": model,
        "stream": true,
        "messages": [{"role":"user","content":"Reply only with OK."}]
    });
    // Reasoning tokens share the completion budget; 16 tokens can end before any visible reply.
    body[if reasoning {
        "max_completion_tokens"
    } else {
        "max_tokens"
    }] = json!(if reasoning { 1024 } else { 32 });
    body
}

#[derive(Default)]
struct Reply {
    text: String,
    has_output: bool,
    complete: bool,
}

impl Reply {
    fn consume(
        &mut self,
        value: Value,
        streaming: bool,
        emit: &impl Fn(TestStreamEvent),
    ) -> Result<(), String> {
        if value.get("error").is_some() {
            return Err("probe.upstreamError".into());
        }
        let Some(choices) = value.get("choices").and_then(Value::as_array) else {
            // Streaming usage trailers contain no choices.
            if streaming && value.get("usage").is_some() {
                return Ok(());
            }
            return Err("probe.invalidResponse".into());
        };
        for choice in choices {
            let message = if streaming {
                &choice["delta"]
            } else {
                &choice["message"]
            };
            for field in ["content", "reasoning_content", "reasoning"] {
                if let Some(text) = message
                    .get(field)
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                {
                    self.has_output |= !text.trim().is_empty();
                    let remaining = MAX_PREVIEW.saturating_sub(self.text.chars().count());
                    let delta: String = text.chars().take(remaining).collect();
                    if !delta.is_empty() {
                        self.text.push_str(&delta);
                        emit(TestStreamEvent::Chunk { delta });
                    }
                }
            }
            if choice.get("finish_reason").is_some_and(|v| !v.is_null()) {
                self.complete = true;
            }
        }
        Ok(())
    }

    fn line(&mut self, line: &[u8], emit: &impl Fn(TestStreamEvent)) -> Result<(), String> {
        let line = std::str::from_utf8(line)
            .map_err(|_| "probe.invalidResponse")?
            .trim_end_matches('\r');
        if let Some(data) = line.strip_prefix("data:").map(str::trim) {
            if data == "[DONE]" {
                self.complete = true;
            } else if !data.is_empty() {
                self.consume(
                    serde_json::from_str(data).map_err(|_| "probe.invalidResponse")?,
                    true,
                    emit,
                )?;
            }
        }
        Ok(())
    }

    fn validate(&self) -> Result<(), String> {
        if !self.has_output {
            Err("probe.emptyResponse".into())
        } else if !self.complete {
            Err("probe.interrupted".into())
        } else {
            Ok(())
        }
    }
}

pub async fn run(
    client: &Client,
    endpoint: &str,
    api_key: &str,
    model: &str,
    timeout: Duration,
    emit: impl Fn(TestStreamEvent),
) -> ApiTestResult {
    let started = Instant::now();
    let deadline = tokio::time::Instant::now() + timeout;
    let mut status_code = None;
    let mut first_output_ms = None;
    log(&emit, "probe.start", "info");
    let attempt = async {
        let request = client
            .post(endpoint)
            .bearer_auth(api_key)
            .header(header::ACCEPT, "text/event-stream, application/json")
            .json(&payload(model))
            .timeout(timeout)
            .send();
        tokio::pin!(request);
        let response = loop {
            tokio::select! {
                response = &mut request => break response.map_err(|error| {
                    if error.is_connect() { "probe.connectFailed" } else if error.is_timeout() { "probe.timeout" } else { "probe.requestFailed" }.to_owned()
                })?,
                _ = tokio::time::sleep(Duration::from_secs(10)) => log(&emit, "probe.waiting", "info"),
            }
        };
        status_code = Some(response.status().as_u16());
        let successful = response.status().is_success();
        let is_sse = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|s| s.to_str().ok())
            .is_some_and(|s| s.to_ascii_lowercase().starts_with("text/event-stream"));
        if successful {
            log(&emit, "probe.headersReceived", "info");
        }
        let mut body = response.bytes_stream();
        let mut bytes = Vec::new();
        let mut received = 0;
        let mut reply = Reply::default();
        loop {
            let chunk = tokio::select! {
                item = body.next() => item,
                _ = tokio::time::sleep(Duration::from_secs(10)) => {log(&emit,"probe.waiting","info");continue;},
            };
            let Some(chunk) = chunk else {
                break;
            };
            let chunk = chunk.map_err(|error| {
                if error.is_timeout() {
                    "probe.timeout"
                } else {
                    "probe.interrupted"
                }
            })?;
            received += chunk.len();
            if received > MAX_BODY {
                return Err("probe.responseTooLarge".into());
            }
            bytes.extend_from_slice(&chunk);
            if successful && is_sse {
                while let Some(end) = bytes.iter().position(|b| *b == b'\n') {
                    reply.line(&bytes[..end], &emit)?;
                    bytes.drain(..=end);
                    if reply.has_output && first_output_ms.is_none() {
                        first_output_ms = Some(started.elapsed().as_millis() as u64);
                    }
                    if reply.complete {
                        break;
                    }
                }
                if reply.complete {
                    break;
                }
            }
        }
        if !successful {
            let raw = String::from_utf8_lossy(&bytes).replace(api_key, "[REDACTED]");
            emit(TestStreamEvent::Log {
                text: format!(
                    "HTTP {}: {}",
                    status_code.unwrap_or_default(),
                    raw.chars().take(300).collect::<String>()
                ),
                level: "error".into(),
            });
            return Err("probe.httpError".into());
        }
        if is_sse {
            if !reply.complete && !bytes.is_empty() {
                reply.line(&bytes, &emit)?;
            }
        } else {
            reply.consume(
                serde_json::from_slice(&bytes).map_err(|_| "probe.invalidResponse")?,
                false,
                &emit,
            )?;
        }
        reply.validate()?;
        Ok::<_, String>(reply.text)
    };
    let outcome = tokio::time::timeout_at(deadline, attempt)
        .await
        .unwrap_or_else(|_| Err("probe.timeout".into()));
    let success = outcome.is_ok();
    let message = if success {
        "probe.success".to_owned()
    } else {
        outcome.as_ref().unwrap_err().clone()
    };
    let latency = first_output_ms.unwrap_or(started.elapsed().as_millis() as u64);
    log(&emit, &message, if success { "success" } else { "error" });
    if !success {
        log(
            &emit,
            if message == "probe.timeout" {
                "probe.timeoutHint"
            } else {
                "probe.failureHint"
            },
            "warn",
        );
    }
    emit(TestStreamEvent::Finish {
        success,
        message: message.clone(),
        latency_ms: latency,
        status_code,
    });
    ApiTestResult {
        success,
        message,
        status_code,
        latency_ms: Some(latency),
        response_preview: outcome.ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::Mutex,
        thread,
    };

    fn server(
        status: u16,
        content_type: &str,
        body: Vec<(Duration, Vec<u8>)>,
        header_delay: Duration,
    ) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!(
            "http://{}/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let content_type = content_type.to_owned();
        let handle = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            loop {
                let mut buf = [0; 1024];
                let size = socket.read(&mut buf).unwrap();
                assert_ne!(size, 0);
                request.extend_from_slice(&buf[..size]);
                if let Some(end) = request.windows(4).position(|s| s == b"\r\n\r\n") {
                    let length: usize = String::from_utf8_lossy(&request[..end])
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|n| n.trim().parse().unwrap())
                        })
                        .unwrap();
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            thread::sleep(header_delay);
            let length: usize = body.iter().map(|(_, chunk)| chunk.len()).sum();
            if write!(socket,"HTTP/1.1 {status} Response\r\nContent-Type: {content_type}\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n").is_ok() {
                for (delay,chunk) in body {
                    thread::sleep(delay);
                    if socket.write_all(&chunk).is_err() {break;}
                }
            }
            String::from_utf8(request).unwrap()
        });
        (endpoint, handle)
    }

    async fn probe(
        status: u16,
        content_type: &str,
        body: Vec<(Duration, Vec<u8>)>,
        header_delay: Duration,
        timeout: Duration,
    ) -> (ApiTestResult, String, Vec<TestStreamEvent>) {
        let (endpoint, server) = server(status, content_type, body, header_delay);
        let events = Mutex::new(Vec::new());
        let result = run(
            &Client::builder().no_proxy().build().unwrap(),
            &endpoint,
            "fixture-test-key",
            "gpt-6-astra",
            timeout,
            |event| events.lock().unwrap().push(event),
        )
        .await;
        (result, server.join().unwrap(), events.into_inner().unwrap())
    }

    #[tokio::test]
    async fn fragmented_utf8_sse_waits_for_model_and_sends_streaming_payload() {
        let bytes = "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"},\"finish_reason\":null}]}\r\n\r\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n".as_bytes();
        let split = bytes.iter().position(|b| *b >= 128).unwrap() + 1;
        let (result, request, events) = probe(
            200,
            "text/event-stream",
            vec![
                (Duration::from_millis(40), bytes[..split].to_vec()),
                (Duration::from_millis(40), bytes[split..].to_vec()),
            ],
            Duration::from_millis(30),
            Duration::from_secs(2),
        )
        .await;
        assert!(result.success, "{}", result.message);
        assert_eq!(result.response_preview.as_deref(), Some("你好"));
        let payload: Value =
            serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(payload["stream"], true);
        assert_eq!(payload["max_completion_tokens"], 1024);
        assert!(payload.get("max_tokens").is_none());
        assert!(events
            .iter()
            .any(|event| matches!(event,TestStreamEvent::Chunk {delta} if delta=="你好")));
        assert!(matches!(
            events.last(),
            Some(TestStreamEvent::Finish { success: true, .. })
        ));
    }

    #[tokio::test]
    async fn headers_or_keepalives_are_not_a_success_and_timeout_covers_body() {
        let (result, _, events) = probe(
            200,
            "text/event-stream",
            vec![
                (Duration::ZERO, b": ping\n\n".to_vec()),
                (Duration::from_millis(150), b": ping\n\n".to_vec()),
            ],
            Duration::ZERO,
            Duration::from_millis(50),
        )
        .await;
        assert!(!result.success);
        assert_eq!(result.message, "probe.timeout");
        assert_eq!(result.status_code, Some(200));
        assert!(matches!(
            events.last(),
            Some(TestStreamEvent::Finish { success: false, .. })
        ));
    }

    #[tokio::test]
    async fn truncated_stream_and_empty_completion_fail() {
        for (body, message) in [
            (
                "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
                "probe.interrupted",
            ),
            (
                "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
                "probe.emptyResponse",
            ),
            (
                "data: {\"error\":{\"message\":\"fixture-test-key\"}}\n\n",
                "probe.upstreamError",
            ),
        ] {
            let (result, _, _) = probe(
                200,
                "text/event-stream",
                vec![(Duration::ZERO, body.as_bytes().to_vec())],
                Duration::ZERO,
                Duration::from_secs(2),
            )
            .await;
            assert!(!result.success);
            assert_eq!(result.message, message);
        }
    }

    #[tokio::test]
    async fn supports_valid_json_fallback_but_rejects_html_and_error_bodies() {
        for (body, success) in [
            (
                r#"{"choices":[{"message":{"content":"OK"},"finish_reason":"stop"}]}"#,
                true,
            ),
            ("<html>Gateway</html>", false),
            (r#"{"error":{"message":"failed"}}"#, false),
            (r#"{"choices":[]}"#, false),
        ] {
            let (result, _, _) = probe(
                200,
                "application/json",
                vec![(Duration::ZERO, body.as_bytes().to_vec())],
                Duration::ZERO,
                Duration::from_secs(2),
            )
            .await;
            assert_eq!(result.success, success, "{body}");
        }
    }

    #[tokio::test]
    async fn http_error_keeps_status_redacts_key_and_does_not_retry() {
        let (result, _, events) = probe(
            401,
            "application/json",
            vec![(
                Duration::ZERO,
                "fixture-test-key错误".repeat(100).into_bytes(),
            )],
            Duration::ZERO,
            Duration::from_secs(2),
        )
        .await;
        assert!(!result.success);
        assert_eq!(result.status_code, Some(401));
        assert!(!format!("{events:?}").contains("fixture-test-key"));
        assert!(format!("{events:?}").contains("[REDACTED]"));
    }
}
