use crate::error::Result;
use crate::productivity::{ProductivityManager, Provider, Task};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// State wrapper for ProductivityManager
pub struct ProductivityState {
    manager: Arc<Mutex<ProductivityManager>>,
}

impl ProductivityState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(Mutex::new(ProductivityManager::new())),
        }
    }
}

impl Default for ProductivityState {
    fn default() -> Self {
        Self::new()
    }
}

/// Request to connect to a productivity provider
#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectRequest {
    pub provider: Provider,
    pub credentials: serde_json::Value,
}

/// Response from connecting to a provider
#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectResponse {
    pub account_id: String,
    pub success: bool,
}

/// Request to list tasks
#[derive(Debug, Serialize, Deserialize)]
pub struct ListTasksRequest {
    pub provider: Provider,
}

/// Request to create a task
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    pub provider: Provider,
    pub task: Task,
}

/// Response from creating a task
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskResponse {
    pub task_id: String,
    pub success: bool,
}

/// Connect to a productivity provider
///
/// # Examples
///
/// ## Notion
/// ```javascript
/// const result = await invoke('productivity_connect', {
///   provider: 'notion',
///   credentials: {
///     token: 'secret_xxxxxxxxxxxx'
///   }
/// });
/// ```
///
/// ## Trello
/// ```javascript
/// const result = await invoke('productivity_connect', {
///   provider: 'trello',
///   credentials: {
///     api_key: 'your_api_key',
///     token: 'your_token'
///   }
/// });
/// ```
///
/// ## Asana
/// ```javascript
/// const result = await invoke('productivity_connect', {
///   provider: 'asana',
///   credentials: {
///     token: 'your_personal_access_token'
///   }
/// });
/// ```
#[tauri::command]
pub async fn productivity_connect(
    state: State<'_, ProductivityState>,
    provider: Provider,
    credentials: serde_json::Value,
) -> Result<ConnectResponse> {
    tracing::info!("Connecting to {:?} provider", provider);

    let mut manager = state.manager.lock().await;
    let account_id = manager.connect(provider, credentials).await?;

    tracing::info!("Successfully connected, account_id: {}", account_id);

    Ok(ConnectResponse {
        account_id,
        success: true,
    })
}

/// List all tasks from a productivity provider
///
/// # Examples
///
/// ```javascript
/// const tasks = await invoke('productivity_list_tasks', {
///   provider: 'notion'
/// });
/// ```
#[tauri::command]
pub async fn productivity_list_tasks(
    state: State<'_, ProductivityState>,
    provider: Provider,
) -> Result<Vec<Task>> {
    tracing::info!("Listing tasks from {:?} provider", provider);

    let manager = state.manager.lock().await;
    let tasks = manager.list_tasks(provider).await?;

    tracing::info!("Retrieved {} tasks", tasks.len());

    Ok(tasks)
}

/// Create a new task in a productivity provider
///
/// # Examples
///
/// ```javascript
/// const result = await invoke('productivity_create_task', {
///   provider: 'trello',
///   task: {
///     title: 'New Task',
///     description: 'Task description',
///     status: 'todo',
///     project_id: 'board_id_here'
///   }
/// });
/// ```
#[tauri::command]
pub async fn productivity_create_task(
    state: State<'_, ProductivityState>,
    provider: Provider,
    task: Task,
) -> Result<CreateTaskResponse> {
    tracing::info!("Creating task in {:?} provider: {}", provider, task.title);

    let manager = state.manager.lock().await;
    let task_id = manager.create_task(provider, task).await?;

    tracing::info!("Successfully created task, id: {}", task_id);

    Ok(CreateTaskResponse {
        task_id,
        success: true,
    })
}

/// List Notion pages
///
/// # Examples
///
/// ```javascript
/// const pages = await invoke('productivity_notion_list_pages');
/// ```
#[tauri::command]
pub async fn productivity_notion_list_pages(
    state: State<'_, ProductivityState>,
) -> Result<Vec<serde_json::Value>> {
    tracing::info!("Listing Notion pages");

    let manager = state.manager.lock().await;

    // Access the Notion client directly
    if let Some(notion_client) = manager.notion_client() {
        let client = notion_client.lock().await;
        let pages = client.list_pages().await?;
        let pages_json: Vec<serde_json::Value> = pages
            .iter()
            .map(|p| serde_json::to_value(p).unwrap_or(serde_json::Value::Null))
            .collect();
        Ok(pages_json)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Notion client not connected".to_string(),
        ))
    }
}

/// Query a Notion database
///
/// # Examples
///
/// ```javascript
/// const results = await invoke('productivity_notion_query_database', {
///   databaseId: 'database_id_here',
///   filter: {
///     property: 'Status',
///     select: { equals: 'In Progress' }
///   }
/// });
/// ```
#[tauri::command]
pub async fn productivity_notion_query_database(
    state: State<'_, ProductivityState>,
    database_id: String,
    filter: Option<serde_json::Value>,
    sorts: Option<Vec<serde_json::Value>>,
) -> Result<Vec<serde_json::Value>> {
    tracing::info!("Querying Notion database: {}", database_id);

    let manager = state.manager.lock().await;

    if let Some(notion_client) = manager.notion_client() {
        let client = notion_client.lock().await;
        let results = client.query_database(&database_id, filter, sorts).await?;
        Ok(results)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Notion client not connected".to_string(),
        ))
    }
}

/// Create a row in a Notion database
///
/// # Examples
///
/// ```javascript
/// const pageId = await invoke('productivity_notion_create_database_row', {
///   databaseId: 'database_id_here',
///   properties: {
///     Name: {
///       title: [{ text: { content: 'New Task' } }]
///     },
///     Status: {
///       select: { name: 'In Progress' }
///     }
///   }
/// });
/// ```
#[tauri::command]
pub async fn productivity_notion_create_database_row(
    state: State<'_, ProductivityState>,
    database_id: String,
    properties: serde_json::Value,
) -> Result<String> {
    tracing::info!("Creating row in Notion database: {}", database_id);

    let manager = state.manager.lock().await;

    if let Some(notion_client) = manager.notion_client() {
        let client = notion_client.lock().await;
        let page_id = client.create_database_row(&database_id, properties).await?;
        Ok(page_id)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Notion client not connected".to_string(),
        ))
    }
}

/// List Trello boards
///
/// # Examples
///
/// ```javascript
/// const boards = await invoke('productivity_trello_list_boards');
/// ```
#[tauri::command]
pub async fn productivity_trello_list_boards(
    state: State<'_, ProductivityState>,
) -> Result<Vec<serde_json::Value>> {
    tracing::info!("Listing Trello boards");

    let manager = state.manager.lock().await;

    if let Some(trello_client) = manager.trello_client() {
        let client = trello_client.lock().await;
        let boards = client.list_boards().await?;
        let boards_json: Vec<serde_json::Value> = boards
            .iter()
            .map(|b| serde_json::to_value(b).unwrap_or(serde_json::Value::Null))
            .collect();
        Ok(boards_json)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Trello client not connected".to_string(),
        ))
    }
}

/// List cards in a Trello board
///
/// # Examples
///
/// ```javascript
/// const cards = await invoke('productivity_trello_list_cards', {
///   boardId: 'board_id_here'
/// });
/// ```
#[tauri::command]
pub async fn productivity_trello_list_cards(
    state: State<'_, ProductivityState>,
    board_id: String,
) -> Result<Vec<Task>> {
    tracing::info!("Listing cards in Trello board: {}", board_id);

    let manager = state.manager.lock().await;

    if let Some(trello_client) = manager.trello_client() {
        let client = trello_client.lock().await;
        let cards = client.list_board_cards(&board_id).await?;

        let mut tasks = Vec::new();
        for card in cards {
            let task = client.card_to_task(&card).await;
            tasks.push(task);
        }

        Ok(tasks)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Trello client not connected".to_string(),
        ))
    }
}

/// Create a card in Trello
///
/// # Examples
///
/// ```javascript
/// const cardId = await invoke('productivity_trello_create_card', {
///   listId: 'list_id_here',
///   name: 'New Card',
///   description: 'Card description'
/// });
/// ```
#[tauri::command]
pub async fn productivity_trello_create_card(
    state: State<'_, ProductivityState>,
    list_id: String,
    name: String,
    description: Option<String>,
) -> Result<String> {
    tracing::info!("Creating Trello card: {}", name);

    let manager = state.manager.lock().await;

    if let Some(trello_client) = manager.trello_client() {
        let client = trello_client.lock().await;
        let card_id = client
            .create_card(&list_id, &name, description.as_deref(), None)
            .await?;
        Ok(card_id)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Trello client not connected".to_string(),
        ))
    }
}

/// Move a Trello card to a different list
///
/// # Examples
///
/// ```javascript
/// await invoke('productivity_trello_move_card', {
///   cardId: 'card_id_here',
///   listId: 'target_list_id_here'
/// });
/// ```
#[tauri::command]
pub async fn productivity_trello_move_card(
    state: State<'_, ProductivityState>,
    card_id: String,
    list_id: String,
) -> Result<()> {
    tracing::info!("Moving Trello card {} to list {}", card_id, list_id);

    let manager = state.manager.lock().await;

    if let Some(trello_client) = manager.trello_client() {
        let client = trello_client.lock().await;
        client.move_card(&card_id, &list_id).await?;
        Ok(())
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Trello client not connected".to_string(),
        ))
    }
}

/// Add a comment to a Trello card
///
/// # Examples
///
/// ```javascript
/// await invoke('productivity_trello_add_comment', {
///   cardId: 'card_id_here',
///   text: 'This is a comment'
/// });
/// ```
#[tauri::command]
pub async fn productivity_trello_add_comment(
    state: State<'_, ProductivityState>,
    card_id: String,
    text: String,
) -> Result<String> {
    tracing::info!("Adding comment to Trello card: {}", card_id);

    let manager = state.manager.lock().await;

    if let Some(trello_client) = manager.trello_client() {
        let client = trello_client.lock().await;
        let comment_id = client.add_comment(&card_id, &text).await?;
        Ok(comment_id)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Trello client not connected".to_string(),
        ))
    }
}

/// List Asana projects
///
/// # Examples
///
/// ```javascript
/// const projects = await invoke('productivity_asana_list_projects', {
///   workspaceId: 'workspace_id_here'
/// });
/// ```
#[tauri::command]
pub async fn productivity_asana_list_projects(
    state: State<'_, ProductivityState>,
    workspace_id: String,
) -> Result<Vec<serde_json::Value>> {
    tracing::info!("Listing Asana projects in workspace: {}", workspace_id);

    let manager = state.manager.lock().await;

    if let Some(asana_client) = manager.asana_client() {
        let client = asana_client.lock().await;
        let projects = client.list_projects(&workspace_id).await?;
        let projects_json: Vec<serde_json::Value> = projects
            .iter()
            .map(|p| serde_json::to_value(p).unwrap_or(serde_json::Value::Null))
            .collect();
        Ok(projects_json)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Asana client not connected".to_string(),
        ))
    }
}

/// List tasks in an Asana project
///
/// # Examples
///
/// ```javascript
/// const tasks = await invoke('productivity_asana_list_project_tasks', {
///   projectId: 'project_id_here'
/// });
/// ```
#[tauri::command]
pub async fn productivity_asana_list_project_tasks(
    state: State<'_, ProductivityState>,
    project_id: String,
) -> Result<Vec<Task>> {
    tracing::info!("Listing tasks in Asana project: {}", project_id);

    let manager = state.manager.lock().await;

    if let Some(asana_client) = manager.asana_client() {
        let client = asana_client.lock().await;
        let asana_tasks = client.list_project_tasks(&project_id).await?;

        let tasks: Vec<Task> = asana_tasks
            .iter()
            .map(|t| client.asana_task_to_task(t))
            .collect();

        Ok(tasks)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Asana client not connected".to_string(),
        ))
    }
}

/// Create a task in Asana
///
/// # Examples
///
/// ```javascript
/// const taskId = await invoke('productivity_asana_create_task', {
///   name: 'New Task',
///   notes: 'Task description',
///   workspaceId: 'workspace_id_here',
///   projectId: 'project_id_here'
/// });
/// ```
#[tauri::command]
pub async fn productivity_asana_create_task(
    state: State<'_, ProductivityState>,
    name: String,
    notes: Option<String>,
    workspace_id: Option<String>,
    project_id: Option<String>,
    assignee_id: Option<String>,
) -> Result<String> {
    tracing::info!("Creating Asana task: {}", name);

    let manager = state.manager.lock().await;

    if let Some(asana_client) = manager.asana_client() {
        let client = asana_client.lock().await;
        let task_id = client
            .create_task_raw(
                &name,
                notes.as_deref(),
                workspace_id.as_deref(),
                project_id.as_deref(),
                assignee_id.as_deref(),
                None,
            )
            .await?;
        Ok(task_id)
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Asana client not connected".to_string(),
        ))
    }
}

/// Assign an Asana task to a user
///
/// # Examples
///
/// ```javascript
/// await invoke('productivity_asana_assign_task', {
///   taskId: 'task_id_here',
///   assigneeId: 'user_id_here'
/// });
/// ```
#[tauri::command]
pub async fn productivity_asana_assign_task(
    state: State<'_, ProductivityState>,
    task_id: String,
    assignee_id: String,
) -> Result<()> {
    tracing::info!("Assigning Asana task {} to {}", task_id, assignee_id);

    let manager = state.manager.lock().await;

    if let Some(asana_client) = manager.asana_client() {
        let client = asana_client.lock().await;
        client.assign_task(&task_id, &assignee_id).await?;
        Ok(())
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Asana client not connected".to_string(),
        ))
    }
}

/// Mark an Asana task as complete
///
/// # Examples
///
/// ```javascript
/// await invoke('productivity_asana_mark_complete', {
///   taskId: 'task_id_here',
///   completed: true
/// });
/// ```
#[tauri::command]
pub async fn productivity_asana_mark_complete(
    state: State<'_, ProductivityState>,
    task_id: String,
    completed: bool,
) -> Result<()> {
    tracing::info!("Marking Asana task {} as complete: {}", task_id, completed);

    let manager = state.manager.lock().await;

    if let Some(asana_client) = manager.asana_client() {
        let client = asana_client.lock().await;
        client.mark_task_complete(&task_id, completed).await?;
        Ok(())
    } else {
        Err(crate::error::AGIError::ConfigurationError(
            "Asana client not connected".to_string(),
        ))
    }
}
