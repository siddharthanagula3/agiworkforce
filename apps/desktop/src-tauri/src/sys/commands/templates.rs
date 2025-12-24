use crate::core::agi::templates::{
    get_builtin_templates, AgentTemplate, TemplateCategory, TemplateManager,
};
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct TemplateManagerState {
    pub manager: Arc<Mutex<TemplateManager>>,
}

pub fn initialize_template_manager(db: Arc<Mutex<Connection>>) -> TemplateManager {
    let manager = TemplateManager::new(db).expect("Failed to create TemplateManager");

    let builtin_templates = get_builtin_templates();
    manager
        .initialize_builtin_templates(builtin_templates)
        .expect("Failed to initialize built-in templates");

    manager
}

#[tauri::command]
pub async fn get_all_templates(
    manager: State<'_, TemplateManagerState>,
) -> Result<Vec<AgentTemplate>, String> {
    let mgr = manager.manager.lock().unwrap();
    mgr.get_all_templates().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_template_by_id(
    id: String,
    manager: State<'_, TemplateManagerState>,
) -> Result<Option<AgentTemplate>, String> {
    let mgr = manager.manager.lock().unwrap();
    mgr.get_template_by_id(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_templates_by_category(
    category: String,
    manager: State<'_, TemplateManagerState>,
) -> Result<Vec<AgentTemplate>, String> {
    let mgr = manager.manager.lock().unwrap();
    let cat = TemplateCategory::from_str(&category)
        .ok_or_else(|| format!("Invalid category: {}", category))?;
    mgr.get_templates_by_category(cat)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_template(
    template_id: String,
    manager: State<'_, TemplateManagerState>,
) -> Result<(), String> {
    let mgr = manager.manager.lock().unwrap();

    let user_id = "default_user";
    mgr.install_template(user_id, &template_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_installed_templates(
    manager: State<'_, TemplateManagerState>,
) -> Result<Vec<AgentTemplate>, String> {
    let mgr = manager.manager.lock().unwrap();

    let user_id = "default_user";
    mgr.get_installed_templates(user_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_templates(
    query: String,
    manager: State<'_, TemplateManagerState>,
) -> Result<Vec<AgentTemplate>, String> {
    let mgr = manager.manager.lock().unwrap();
    mgr.search_templates(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_template(
    template_id: String,
    _params: HashMap<String, String>,
    manager: State<'_, TemplateManagerState>,
) -> Result<String, String> {
    let mgr = manager.manager.lock().unwrap();
    let template = mgr
        .get_template_by_id(&template_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Template not found: {}", template_id))?;

    let workflow_json = serde_json::to_string_pretty(&template.workflow)
        .map_err(|e| format!("Failed to serialize workflow: {}", e))?;

    Ok(format!(
        "Template '{}' execution started.\nWorkflow:\n{}",
        template.name, workflow_json
    ))
}

#[tauri::command]
pub async fn uninstall_template(
    template_id: String,
    manager: State<'_, TemplateManagerState>,
) -> Result<(), String> {
    let mgr = manager.manager.lock().unwrap();
    let user_id = "default_user";

    mgr.uninstall_template(user_id, &template_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_template_categories() -> Result<Vec<String>, String> {
    Ok(vec![
        "finance".to_string(),
        "customer_service".to_string(),
        "development".to_string(),
        "marketing".to_string(),
        "hr".to_string(),
        "operations".to_string(),
        "data_entry".to_string(),
        "research".to_string(),
        "content".to_string(),
        "deployment".to_string(),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_initialize_template_manager() {
        let conn = Connection::open_in_memory().unwrap();
        crate::data::db::migrations::run_migrations(&conn).unwrap();

        let db = Arc::new(Mutex::new(conn));
        let manager = initialize_template_manager(db);

        let templates = manager.get_all_templates().unwrap();
        assert!(
            !templates.is_empty(),
            "Should have loaded builtin templates"
        );
    }
}
