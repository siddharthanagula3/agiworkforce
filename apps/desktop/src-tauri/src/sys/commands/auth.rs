use keyring::Entry;
use tauri::command;

const SERVICE_NAME: &str = "AGI Workforce";
const SESSION_KEY: &str = "supabase_session";

#[command]
pub async fn auth_store_session(session: String) -> Result<(), String> {
    #[cfg(test)]
    return Ok(());

    #[cfg(not(test))]
    {
        let entry = Entry::new(SERVICE_NAME, SESSION_KEY).map_err(|e| e.to_string())?;
        entry.set_password(&session).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[command]
pub async fn auth_retrieve_session() -> Result<String, String> {
    #[cfg(test)]
    return Ok("".to_string());

    #[cfg(not(test))]
    {
        let entry = Entry::new(SERVICE_NAME, SESSION_KEY).map_err(|e| e.to_string())?;
        entry.get_password().map_err(|e| e.to_string())
    }
}

#[command]
pub async fn auth_remove_session() -> Result<(), String> {
    #[cfg(test)]
    return Ok(());

    #[cfg(not(test))]
    {
        let entry = Entry::new(SERVICE_NAME, SESSION_KEY).map_err(|e| e.to_string())?;
        entry.delete_password().map_err(|e| e.to_string())
    }
}
