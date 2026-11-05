use tauri::menu::MenuItem;
use tauri::Manager;

pub struct TrayLocaleItems {
    pub show: MenuItem<tauri::Wry>,
    pub hide: MenuItem<tauri::Wry>,
    pub quit: MenuItem<tauri::Wry>,
}

pub fn catalog(locale: &str) -> Result<serde_json::Value, String> {
    let json = match locale {
        "zh-CN" => include_str!("../../src/locales/zh-CN.json"),
        "zh-TW" => include_str!("../../src/locales/zh-TW.json"),
        "en" => include_str!("../../src/locales/en.json"),
        "fr" => include_str!("../../src/locales/fr.json"),
        "ru" => include_str!("../../src/locales/ru.json"),
        "ja" => include_str!("../../src/locales/ja.json"),
        "vi" => include_str!("../../src/locales/vi.json"),
        _ => return Err("Unsupported locale".into()),
    };
    serde_json::from_str(json).map_err(|error| error.to_string())
}

pub fn text<'a>(catalog: &'a serde_json::Value, key: &str) -> Result<&'a str, String> {
    catalog
        .get(key)
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Missing locale key: {key}"))
}

pub fn window_title(locale: Option<&str>, key: &str) -> String {
    let labels = catalog(locale.unwrap_or("en")).or_else(|_| catalog("en"));
    labels
        .ok()
        .and_then(|labels| labels.get(key)?.as_str().map(str::to_owned))
        .unwrap_or_else(|| "Uocode Client".into())
}

#[tauri::command]
pub fn set_native_locale(app: tauri::AppHandle, locale: String) -> Result<(), String> {
    let labels = catalog(&locale)?;
    let items = app.state::<TrayLocaleItems>();
    items
        .show
        .set_text(text(&labels, "tray.show")?)
        .map_err(|e| e.to_string())?;
    items
        .hide
        .set_text(text(&labels, "tray.hide")?)
        .map_err(|e| e.to_string())?;
    items
        .quit
        .set_text(text(&labels, "tray.quit")?)
        .map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_tooltip(Some(text(&labels, "tray.tooltip")?))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
