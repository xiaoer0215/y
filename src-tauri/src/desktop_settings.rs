use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
pub struct DesktopSettings {
    #[serde(default)]
    pub autostart: bool,
    #[serde(default = "enabled")]
    pub close_to_tray: bool,
}
fn enabled() -> bool {
    true
}
impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            autostart: false,
            close_to_tray: true,
        }
    }
}
pub struct SettingsState(pub Mutex<DesktopSettings>);

pub fn load(app: &tauri::AppHandle) -> DesktopSettings {
    app.path()
        .app_config_dir()
        .ok()
        .and_then(|dir| std::fs::read(dir.join("desktop-settings.json")).ok())
        .and_then(|data| serde_json::from_slice(&data).ok())
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn autostart_enabled() -> Result<bool, String> {
    use winreg::{enums::*, RegKey};
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_READ,
    );
    match key {
        Ok(key) => Ok(key.get_value::<String, _>("AIHelperCustom").is_ok()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
#[cfg(target_os = "windows")]
fn set_autostart(enabled: bool) -> Result<(), String> {
    use winreg::{enums::*, RegKey};
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .map_err(|e| e.to_string())?;
    if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value("AIHelperCustom", &format!("\"{}\"", exe.display()))
            .map_err(|e| e.to_string())
    } else {
        match key.delete_value("AIHelperCustom") {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
#[cfg(not(target_os = "windows"))]
fn autostart_enabled() -> Result<bool, String> {
    Ok(false)
}
#[cfg(not(target_os = "windows"))]
fn set_autostart(enabled: bool) -> Result<(), String> {
    if enabled {
        Err("当前平台暂不支持开机自启".into())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn get_desktop_settings(state: tauri::State<SettingsState>) -> Result<DesktopSettings, String> {
    let mut result = state.0.lock().map_err(|e| e.to_string())?.clone();
    result.autostart = autostart_enabled()?;
    Ok(result)
}
#[tauri::command]
pub fn save_desktop_settings(
    app: tauri::AppHandle,
    state: tauri::State<SettingsState>,
    settings: DesktopSettings,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    let previous_autostart = autostart_enabled()?;
    if settings.autostart != previous_autostart {
        set_autostart(settings.autostart)?;
    }
    let persist = || -> Result<(), String> {
        let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(
            dir.join("desktop-settings.json"),
            serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
    };
    if let Err(error) = persist() {
        if settings.autostart != previous_autostart {
            let _ = set_autostart(previous_autostart);
        }
        return Err(error);
    }
    *current = settings;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_settings_default_to_no_autostart_and_close_to_tray() {
        let settings: DesktopSettings = serde_json::from_str("{}").unwrap();
        assert!(!settings.autostart);
        assert!(settings.close_to_tray);
        let settings: DesktopSettings =
            serde_json::from_str(r#"{"autostart":true,"close_to_tray":false}"#).unwrap();
        assert!(settings.autostart);
        assert!(!settings.close_to_tray);
    }
}
