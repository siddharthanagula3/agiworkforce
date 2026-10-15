use crate::sys::security::machine_key;

/// Return a stable install-scoped user ID for local-only users.
///
/// The ID is derived from `machine_key::get_manager().get_install_id()` with a
/// `local-` prefix so callers can distinguish it from a cloud account ID. It is
/// stable across app restarts and unique per installation.
#[tauri::command]
pub async fn get_local_user_id() -> Result<String, String> {
    let raw_install_id = machine_key::get_manager().get_install_id();
    Ok(format!("local-{raw_install_id}"))
}
