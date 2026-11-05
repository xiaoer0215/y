// A dedicated Edge profile keeps provider authorization in a normal browser.
// Only this process/profile is observed; the user's other browser windows are untouched.
#[cfg(target_os = "windows")]
pub async fn authorize(
    app: &tauri::AppHandle,
    url: &reqwest::Url,
    provider: &str,
    state: &str,
) -> Result<Option<String>, String> {
    use futures_util::{SinkExt, StreamExt};
    use std::os::windows::process::CommandExt;
    use std::{
        path::PathBuf,
        process::{Command, Stdio},
        time::Duration,
    };
    use tauri::Manager;
    use tokio_tungstenite::tungstenite::Message;

    let executable = ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(|base| PathBuf::from(base).join("Microsoft/Edge/Application/msedge.exe"))
        .find(|path| path.is_file());
    let Some(executable) = executable else {
        return Ok(None);
    };
    let listener =
        std::net::TcpListener::bind("127.0.0.1:0").map_err(|_| "无法分配授权窗口端口")?;
    let port = listener
        .local_addr()
        .map_err(|_| "无法读取授权窗口端口")?
        .port();
    drop(listener);
    let profile = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "无法定位授权窗口目录")?
        .join("oauth-browser");
    std::fs::create_dir_all(&profile).map_err(|_| "无法创建授权窗口目录")?;
    let mut child = Command::new(executable)
        .args([
            "--app=about:blank",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-mode",
            "--remote-debugging-address=127.0.0.1",
        ])
        .arg(format!("--remote-debugging-port={port}"))
        .arg(format!("--user-data-dir={}", profile.display()))
        .arg("--window-size=560,780")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|_| "无法启动快捷登录授权窗口")?;
    let result = async {
        let http = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(2)).build().map_err(|_| "初始化授权窗口失败")?;
        let mut socket_url = None;
        for _ in 0..80 {
            if child.try_wait().map_err(|_| "检查授权窗口失败")?.is_some() { return Err("已取消快捷登录".to_string()); }
            if let Ok(response) = http.get(format!("http://127.0.0.1:{port}/json/list")).send().await {
                if let Ok(pages) = response.json::<Vec<serde_json::Value>>().await {
                    socket_url = pages.iter().find(|p| p["type"] == "page").and_then(|p| p["webSocketDebuggerUrl"].as_str()).map(str::to_owned);
                    if socket_url.is_some() { break; }
                }
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
        let socket_url = socket_url.ok_or("授权窗口未就绪，请关闭窗口后重试")?;
        let (mut socket, _) = tokio_tungstenite::connect_async(socket_url).await.map_err(|_| "无法连接授权窗口")?;
        let pattern = format!("{}/oauth/{}*", crate::auth::BASE_URL, provider);
        // Wait for Fetch.enable to be acknowledged before navigating. This prevents
        // the website callback from exchanging the code before the desktop can.
        socket.send(Message::Text(serde_json::json!({"id":1,"method":"Fetch.enable","params":{"patterns":[{"urlPattern":pattern,"requestStage":"Request"}]}}).to_string().into())).await.map_err(|_| "初始化授权回调失败")?;
        loop {
            let frame = tokio::time::timeout(Duration::from_secs(10), socket.next()).await.map_err(|_| "授权窗口初始化超时")?.ok_or("授权窗口已关闭")?.map_err(|_| "授权窗口连接中断")?;
            if let Message::Text(text) = frame {
                if let Ok(message) = serde_json::from_str::<serde_json::Value>(&text) {
                    if message["id"] == 1 { if message.get("error").is_some() { return Err("授权回调初始化失败".into()); } break; }
                }
            }
        }
        socket.send(Message::Text(serde_json::json!({"id":2,"method":"Page.enable"}).to_string().into())).await.map_err(|_| "初始化授权窗口失败")?;
        socket.send(Message::Text(serde_json::json!({"id":3,"method":"Page.navigate","params":{"url":url.as_str()}}).to_string().into())).await.map_err(|_| "打开授权页面失败")?;
        let mut serial = 4;
        let authorization = tokio::time::timeout(Duration::from_secs(300), async {
            loop {
                let frame = tokio::select! {
                    frame = socket.next() => frame.ok_or("已取消快捷登录")?.map_err(|_| "授权窗口已关闭")?,
                    _ = tokio::time::sleep(Duration::from_millis(500)) => { if child.try_wait().map_err(|_| "检查授权窗口失败")?.is_some() { return Err("已取消快捷登录".to_string()); } continue; }
                };
                if let Message::Text(text) = frame {
                    let Ok(message) = serde_json::from_str::<serde_json::Value>(&text) else { continue; };
                    if message["id"] == 3 && message["result"]["errorText"].is_string() { return Err("授权页面无法加载，请检查网络后重试".into()); }
                    if message["method"] == "Page.frameNavigated" && message["params"]["frame"]["url"].as_str().is_some_and(|url| url.starts_with("chrome-error:") || url.starts_with("chromewebdata:")) { return Err("授权页面无法加载，请检查网络后重试".into()); }
                    if message["method"] == "Inspector.detached" { return Err("已取消快捷登录".to_string()); }
                    if message["method"] != "Fetch.requestPaused" { continue; }
                    let params = &message["params"];
                    let callback = params["request"]["url"].as_str().and_then(|s| reqwest::Url::parse(s).ok()).and_then(|url| crate::auth::oauth_callback_query(&url, provider, state));
                    if let Some(callback) = callback {
                        socket.send(Message::Text(serde_json::json!({"id":serial,"method":"Fetch.failRequest","params":{"requestId":params["requestId"],"errorReason":"Aborted"}}).to_string().into())).await.map_err(|_| "接收授权结果失败")?;
                        return callback;
                    }
                    socket.send(Message::Text(serde_json::json!({"id":serial,"method":"Fetch.continueRequest","params":{"requestId":params["requestId"]}}).to_string().into())).await.map_err(|_| "授权窗口连接中断")?;
                    serial += 1;
                }
            }
        }).await.map_err(|_| "授权已超时，请重试")?;
        let _ = socket.send(Message::Text(serde_json::json!({"id":serial+1,"method":"Browser.close"}).to_string().into())).await;
        authorization
    }.await;
    // This is always the dedicated browser child, never a pre-existing Edge process.
    let _ = child.kill();
    let _ = child.wait();
    result.map(Some)
}

#[cfg(not(target_os = "windows"))]
pub async fn authorize(
    _app: &tauri::AppHandle,
    _url: &reqwest::Url,
    _provider: &str,
    _state: &str,
) -> Result<Option<String>, String> {
    Ok(None)
}
