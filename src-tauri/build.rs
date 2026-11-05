fn main() {
    configure_brand_identity();
    tauri_build::build();

    // Windows: Embed Common Controls v6 manifest for test binaries
    //
    // When running `cargo test`, the generated test executables don't include
    // the standard Tauri application manifest. Without Common Controls v6,
    // `tauri::test` calls fail with STATUS_ENTRYPOINT_NOT_FOUND.
    //
    // This workaround:
    // 1. Embeds the manifest into test binaries via /MANIFEST:EMBED
    // 2. Uses /MANIFEST:NO for the main binary to avoid duplicate resources
    //    (Tauri already handles manifest embedding for the app binary)
    #[cfg(target_os = "windows")]
    {
        let manifest_path = std::path::PathBuf::from(
            std::env::var("CARGO_MANIFEST_DIR").expect("missing CARGO_MANIFEST_DIR"),
        )
        .join("common-controls.manifest");
        let manifest_arg = format!("/MANIFESTINPUT:{}", manifest_path.display());

        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg={}", manifest_arg);
        // Avoid duplicate manifest resources in binary builds.
        println!("cargo:rustc-link-arg-bins=/MANIFEST:NO");
        println!("cargo:rerun-if-changed={}", manifest_path.display());
    }
}

fn configure_brand_identity() {
    let manifest_dir = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("missing CARGO_MANIFEST_DIR"),
    );
    let brand_file = manifest_dir.join("../brands/versions.json");
    println!("cargo:rerun-if-changed={}", brand_file.display());
    println!("cargo:rerun-if-env-changed=AI_HELPER_BRAND_ID");

    let content = std::fs::read_to_string(&brand_file).unwrap_or_else(|error| {
        panic!(
            "cannot read brand configuration {}: {error}",
            brand_file.display()
        )
    });
    let document: serde_json::Value = serde_json::from_str(&content)
        .unwrap_or_else(|error| panic!("invalid brand configuration: {error}"));
    let requested = std::env::var("AI_HELPER_BRAND_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            let repo = std::env::var("GITHUB_REPOSITORY").ok()?;
            match repo.rsplit('/').next()? {
                "u" => Some("uocode".into()),
                "n" => Some("nez-api".into()),
                "y" => Some("yusr".into()),
                _ => None,
            }
        })
        .or_else(|| {
            document
                .get("default")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .expect("brand configuration has no default id");
    let brand = document
        .get("versions")
        .and_then(serde_json::Value::as_array)
        .and_then(|versions| {
            versions.iter().find(|item| {
                item.get("id").and_then(serde_json::Value::as_str) == Some(requested.as_str())
                    && item.get("enabled").and_then(serde_json::Value::as_bool) == Some(true)
            })
        })
        .unwrap_or_else(|| panic!("brand is missing or disabled: {requested}"));
    let name = brand
        .get("productName")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| panic!("brand has no productName: {requested}"));
    let user_agent_name = brand
        .get("userAgentName")
        .and_then(serde_json::Value::as_str)
        .filter(|value| {
            !value.trim().is_empty()
                && value.is_ascii()
                && value
                    .bytes()
                    .all(|byte| byte.is_ascii_graphic() || byte == b' ')
        })
        .unwrap_or_else(|| panic!("brand has no ASCII-safe userAgentName: {requested}"));
    println!("cargo:rustc-env=AI_HELPER_BRAND_ID={requested}");
    println!("cargo:rustc-env=AI_HELPER_BRAND_NAME={name}");
    println!("cargo:rustc-env=AI_HELPER_BRAND_USER_AGENT_NAME={user_agent_name}");
    for (field, variable) in [
        ("siteUrl", "AI_HELPER_BRAND_SITE_URL"),
        ("repository", "AI_HELPER_BRAND_REPOSITORY"),
        ("updateManifestUrl", "AI_HELPER_BRAND_UPDATE_URL"),
    ] {
        let value = brand
            .get(field)
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| panic!("brand is missing {field}: {requested}"));
        println!("cargo:rustc-env={variable}={value}");
    }
    println!("cargo:rerun-if-env-changed=GITHUB_REPOSITORY");
}
