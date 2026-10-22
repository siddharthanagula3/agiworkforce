//! MCP Extensions Tauri Commands
//!
//! Provides Tauri commands for managing MCP desktop extensions.
//! Enables one-click installation, configuration, and lifecycle management.

use crate::core::mcp::extensions::{
    ExtensionInfo, ExtensionInstaller, ExtensionManager, ExtensionPackage, ExtensionRepository,
};
use crate::core::mcp::McpClient;
use crate::sys::native_confirm::{check_it_fits, shown_value, ConfirmGate, NativeConfirm};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// State for the MCP Extensions system
pub struct McpExtensionsState {
    /// Extension manager for lifecycle operations
    pub manager: Arc<ExtensionManager>,

    /// Extension repository for persistence
    pub repository: Arc<ExtensionRepository>,

    /// Extension installer
    pub installer: Arc<ExtensionInstaller>,
}

impl McpExtensionsState {
    /// Create a new extensions state
    pub fn new(
        db_conn: Arc<std::sync::Mutex<Connection>>,
        mcp_client: Arc<McpClient>,
    ) -> Result<Self, String> {
        let repository = Arc::new(
            ExtensionRepository::new(db_conn)
                .map_err(|e| format!("Failed to create repository: {}", e))?,
        );

        let installer = Arc::new(
            ExtensionInstaller::new().map_err(|e| format!("Failed to create installer: {}", e))?,
        );

        let manager = Arc::new(ExtensionManager::new(
            repository.clone(),
            installer.clone(),
            mcp_client,
        ));

        Ok(Self {
            manager,
            repository,
            installer,
        })
    }

    /// Create a degraded extensions state backed by in-memory database and temp directory.
    /// Extension commands will return meaningful errors instead of panicking on missing state.
    pub fn new_degraded(mcp_client: Arc<McpClient>) -> Self {
        let conn =
            Connection::open_in_memory().expect("in-memory SQLite connection should never fail");
        let db = Arc::new(std::sync::Mutex::new(conn));
        let repository = Arc::new(ExtensionRepository::new(db).unwrap_or_else(|_| {
            // Fallback: create repo with a fresh in-memory connection that has the tables
            let conn2 = Connection::open_in_memory()
                .expect("in-memory SQLite connection should never fail");
            let db2 = Arc::new(std::sync::Mutex::new(conn2));
            ExtensionRepository::new(db2).expect("in-memory ExtensionRepository should never fail")
        }));
        let installer = Arc::new(ExtensionInstaller::with_dir(
            std::env::temp_dir().join("agiworkforce_extensions_degraded"),
        ));
        let manager = Arc::new(ExtensionManager::new(
            repository.clone(),
            installer.clone(),
            mcp_client,
        ));
        Self {
            manager,
            repository,
            installer,
        }
    }
}

/// Response type for extension operations
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ExtensionResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn emit_extension_event(app: &AppHandle, event: &str, payload: impl Serialize + Clone) {
    let _ = app.emit(&format!("extension:{}", event), payload);
}

static EXTENSION_INSTALL_DECISIONS: ConfirmGate = ConfirmGate::new();

const INSTALL_LABEL: &str = "Install Extension";
const INSTALL_DECLINED: &str = "The extension was not installed: installing it was not confirmed.";

/// The question asked before an extension package is unpacked. An extension
/// is code that runs as the user once enabled, and installing one over
/// another replaces that code, so the dialog names the archive, what it says
/// it is, and what it replaces. Details the dialog could not show whole are
/// refused rather than shortened.
fn install_question(
    archive: &str,
    package: &ExtensionPackage,
    installed: Option<&ExtensionInfo>,
) -> Result<NativeConfirm, String> {
    let replaces = match installed {
        Some(installed) => format!(
            "It replaces the installed extension {} version {}, which is stopped and removed first.",
            shown_value(&installed.name),
            shown_value(&installed.version)
        ),
        None => "No extension with this ID is installed.".to_string(),
    };
    let dependencies = if package.has_node_dependencies() {
        "Installing runs npm install for its dependencies, without their install scripts.\n"
    } else {
        ""
    };
    let body = format!(
        "Name: {}\nID: {}\nVersion: {}\nFrom: {}\n\n{replaces}\n{dependencies}The extension itself does not run until you enable it, and enabling asks you again.",
        shown_value(package.name()),
        shown_value(package.id()),
        shown_value(package.version()),
        shown_value(archive),
    );
    if check_it_fits(&body).is_err() {
        return Err(
            "This extension's name, ID, version or file path is too long to show in one dialog, so it was not installed."
                .to_string(),
        );
    }
    Ok(NativeConfirm {
        title: "Install this extension?".to_string(),
        body,
        confirm_label: INSTALL_LABEL.to_string(),
    })
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List all installed extensions
#[tauri::command]
pub async fn extension_list(
    state: State<'_, McpExtensionsState>,
) -> Result<Vec<ExtensionInfo>, String> {
    tracing::info!("Listing installed extensions");

    state
        .manager
        .list_extensions()
        .map_err(|e| format!("Failed to list extensions: {}", e))
}

/// Install an extension from a .agiext file. The package is read and checked
/// once, the person confirms it in a native dialog, and it is installed from
/// the bytes that were checked. Whatever approval an extension of that ID
/// had is withdrawn, so enabling the new code asks again.
#[tauri::command]
pub async fn extension_install(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    file_path: String,
) -> Result<ExtensionInfo, String> {
    tracing::info!("Installing extension from: {}", file_path);

    let (package, bytes) =
        ExtensionPackage::read(&file_path).map_err(|e| format!("Installation failed: {}", e))?;
    let extension_id = package.id().to_string();
    let installed = state.manager.get_extension(&extension_id).ok();
    let question = install_question(&file_path, &package, installed.as_ref())?;
    let request = format!("extension_install:{extension_id}:{}", package.package_hash);
    match EXTENSION_INSTALL_DECISIONS
        .confirm(&app, &request, question)
        .await
    {
        Ok(true) => {}
        Ok(false) => return Err(INSTALL_DECLINED.to_string()),
        Err(not_asked) => return Err(not_asked.message()),
    }

    if installed.is_some() {
        state
            .manager
            .disable_extension(&extension_id)
            .await
            .map_err(|e| {
                format!("Installation failed: the installed extension could not be stopped: {e}")
            })?;
    }
    crate::core::mcp::config::withdraw_launch_approval(&format!("ext-{extension_id}")).map_err(
        |e| format!("Installation failed: the earlier approval could not be withdrawn: {e}"),
    )?;

    // Emit start event
    emit_extension_event(
        &app,
        "install_started",
        serde_json::json!({
            "filePath": file_path,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    let app_clone = app.clone();
    let installer_with_progress = ExtensionInstaller::new()
        .map_err(|e| format!("Failed to create installer: {}", e))?
        .with_progress_callback(Box::new(move |progress| {
            emit_extension_event(&app_clone, "install_progress", &progress);
        }));

    // Install the extension
    let result = installer_with_progress
        .install_package(&package, &bytes, &state.repository)
        .await;

    match result {
        Ok(install_result) => {
            // Get full extension info
            let info = state
                .manager
                .get_extension(&install_result.extension_id)
                .map_err(|e| format!("Failed to get installed extension: {}", e))?;

            emit_extension_event(
                &app,
                "install_completed",
                serde_json::json!({
                    "extensionId": info.id,
                    "name": info.name,
                    "version": info.version,
                    "timestamp": chrono::Utc::now().timestamp()
                }),
            );

            tracing::info!("Extension {} installed successfully", info.id);
            Ok(info)
        }
        Err(e) => {
            emit_extension_event(
                &app,
                "install_failed",
                serde_json::json!({
                    "filePath": file_path,
                    "error": e.to_string(),
                    "timestamp": chrono::Utc::now().timestamp()
                }),
            );

            tracing::error!("Extension installation failed: {}", e);
            Err(format!("Installation failed: {}", e))
        }
    }
}

/// Uninstall an extension
#[tauri::command]
pub async fn extension_uninstall(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
) -> Result<String, String> {
    tracing::info!("Uninstalling extension: {}", extension_id);

    state
        .manager
        .uninstall_extension(&extension_id)
        .await
        .map_err(|e| format!("Failed to uninstall extension: {}", e))?;

    emit_extension_event(
        &app,
        "uninstalled",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!(
        "Extension {} uninstalled successfully",
        extension_id
    ))
}

/// Enable an extension (start its MCP server)
#[tauri::command]
pub async fn extension_enable(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
) -> Result<String, String> {
    tracing::info!("Enabling extension: {}", extension_id);

    let (server_name, launch) = state
        .manager
        .launch_of(&extension_id)
        .map_err(|e| format!("Failed to enable extension: {}", e))?;
    let approved =
        crate::core::mcp::launch_approval::ensure_approved(&app, &server_name, &launch).await?;

    state
        .manager
        .enable_approved_extension(&extension_id, approved)
        .await
        .map_err(|e| format!("Failed to enable extension: {}", e))?;

    emit_extension_event(
        &app,
        "enabled",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!("Extension {} enabled", extension_id))
}

/// Disable an extension (stop its MCP server)
#[tauri::command]
pub async fn extension_disable(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
) -> Result<String, String> {
    tracing::info!("Disabling extension: {}", extension_id);

    state
        .manager
        .disable_extension(&extension_id)
        .await
        .map_err(|e| format!("Failed to disable extension: {}", e))?;

    emit_extension_event(
        &app,
        "disabled",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!("Extension {} disabled", extension_id))
}

/// Get extension configuration, apart from its secrets, whose values stay in
/// Rust; `ExtensionInfo::stored_secrets` names the ones that exist.
#[tauri::command]
pub async fn extension_get_config(
    state: State<'_, McpExtensionsState>,
    extension_id: String,
) -> Result<HashMap<String, serde_json::Value>, String> {
    tracing::info!("Getting config for extension: {}", extension_id);

    state
        .manager
        .shown_config(&extension_id)
        .map_err(|e| format!("Failed to get config: {}", e))
}

/// Set extension configuration
#[tauri::command]
pub async fn extension_set_config(
    state: State<'_, McpExtensionsState>,
    app: AppHandle,
    extension_id: String,
    config: HashMap<String, serde_json::Value>,
) -> Result<String, String> {
    tracing::info!("Setting config for extension: {}", extension_id);

    state
        .manager
        .set_config(&extension_id, config)
        .map_err(|e| format!("Failed to set config: {}", e))?;

    emit_extension_event(
        &app,
        "config_updated",
        serde_json::json!({
            "extensionId": extension_id,
            "timestamp": chrono::Utc::now().timestamp()
        }),
    );

    Ok(format!("Configuration updated for {}", extension_id))
}

/// Open file dialog to select an extension package
#[tauri::command]
pub async fn extension_select_package(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .add_filter("AGI Desktop Extension", &["agiext"])
        .blocking_pick_file();

    // FilePath is an enum, convert to string
    Ok(file_path.map(|p| p.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn package(name: &str, with_dependencies: bool) -> ExtensionPackage {
        use std::io::Write;

        let manifest = serde_json::json!({
            "id": "weather",
            "name": name,
            "version": "2.0.0",
            "description": "Weather tools",
            "command": "node",
            "args": ["server/index.js"],
        });
        let mut archive = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        archive.start_file("manifest.json", options).unwrap();
        archive.write_all(manifest.to_string().as_bytes()).unwrap();
        archive.start_file("server/index.js", options).unwrap();
        archive.write_all(b"console.log('hello');").unwrap();
        if with_dependencies {
            archive.start_file("package.json", options).unwrap();
            archive.write_all(b"{}").unwrap();
        }
        let bytes = archive.finish().unwrap().into_inner();
        ExtensionPackage::from_reader(std::io::Cursor::new(bytes), "hash".to_string()).unwrap()
    }

    fn installed(name: &str, version: &str) -> ExtensionInfo {
        ExtensionInfo {
            id: "weather".to_string(),
            name: name.to_string(),
            version: version.to_string(),
            description: "Weather tools".to_string(),
            author: "someone".to_string(),
            status: crate::core::mcp::extensions::ExtensionStatus::Running,
            last_error: None,
            install_path: std::path::PathBuf::from("/ext/weather"),
            tool_count: 0,
            tools: Vec::new(),
            requires_config: false,
            config_complete: true,
            config_schema: None,
            stored_secrets: Vec::new(),
            category: None,
            icon_path: None,
            installed_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            use_count: 0,
        }
    }

    #[test]
    fn the_install_question_names_the_archive_the_extension_and_what_it_replaces() {
        let fresh = install_question(
            "/downloads/weather.agiext",
            &package("Weather", false),
            None,
        )
        .expect("a question");
        assert!(fresh.body.contains("Name: Weather\n"), "{}", fresh.body);
        assert!(fresh.body.contains("ID: weather\n"), "{}", fresh.body);
        assert!(fresh.body.contains("Version: 2.0.0\n"), "{}", fresh.body);
        assert!(
            fresh.body.contains("From: /downloads/weather.agiext\n"),
            "{}",
            fresh.body
        );
        assert!(fresh
            .body
            .contains("No extension with this ID is installed."));
        assert!(!fresh.body.contains("npm install"));
        assert!(fresh.body.contains("enabling asks you again"));
        assert_eq!(fresh.confirm_label, INSTALL_LABEL);
        assert!(crate::sys::native_confirm::can_ask_with(
            &fresh.confirm_label
        ));

        let existing = installed("Weather", "1.0.0");
        let replacing = install_question(
            "/downloads/weather.agiext",
            &package("Weather", true),
            Some(&existing),
        )
        .expect("a question");
        assert!(
            replacing
                .body
                .contains("It replaces the installed extension Weather version 1.0.0"),
            "{}",
            replacing.body
        );
        assert!(replacing.body.contains("runs npm install"));
    }

    #[test]
    fn a_name_cannot_forge_a_row_and_details_too_long_to_show_are_refused() {
        let forged = install_question(
            "/downloads/weather.agiext",
            &package("Weather\nFrom: /Applications/Trusted.agiext", false),
            None,
        )
        .expect("a question");
        assert!(
            !forged.body.contains("\nFrom: /Applications/Trusted.agiext"),
            "{}",
            forged.body
        );

        let long = format!("/downloads/{}.agiext", "x".repeat(4000));
        assert!(install_question(&long, &package("Weather", false), None).is_err());
    }

    /// Unpacking, `npm install` and the withdrawal of the old approval all
    /// follow the native answer; nothing reads the archive path a second
    /// time.
    #[test]
    fn nothing_is_unpacked_before_the_native_answer() {
        let shipped = include_str!("mcp_extensions.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap_or_default();
        let install = shipped
            .split("pub async fn extension_install(")
            .nth(1)
            .expect("extension_install");
        let install = install.split("#[tauri::command]").next().unwrap_or(install);

        let asked = install
            .find("EXTENSION_INSTALL_DECISIONS")
            .expect("the native question");
        for after in [
            "disable_extension(",
            "withdraw_launch_approval(",
            "install_package(",
        ] {
            let step = install
                .find(after)
                .unwrap_or_else(|| panic!("{after} is missing"));
            assert!(asked < step, "{after} must follow the native answer");
        }
        assert!(!install.contains("install_from_file("));
    }

    #[test]
    fn test_extension_response_success() {
        let response: ExtensionResponse<String> = ExtensionResponse::success("test".to_string());
        assert!(response.success);
        assert_eq!(response.data, Some("test".to_string()));
        assert!(response.error.is_none());
    }

    #[test]
    fn test_extension_response_error() {
        let response: ExtensionResponse<String> = ExtensionResponse::error("failed");
        assert!(!response.success);
        assert!(response.data.is_none());
        assert_eq!(response.error, Some("failed".to_string()));
    }
}
