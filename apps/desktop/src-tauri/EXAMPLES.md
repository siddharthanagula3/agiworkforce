# Rust Code Examples

> Practical examples of common patterns used in the AGI Workforce Rust backend

## Table of Contents

- [State Management](#state-management)
- [Async Patterns](#async-patterns)
- [Error Handling](#error-handling)
- [Database Operations](#database-operations)
- [Security Patterns](#security-patterns)
- [Event Emission](#event-emission)
- [Testing Patterns](#testing-patterns)

## State Management

### Creating a New State Type

```rust
// Define the state structure
pub struct MyFeatureState {
    data: HashMap<String, String>,
    counter: i32,
}

impl MyFeatureState {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
            counter: 0,
        }
    }

    pub fn increment(&mut self) -> i32 {
        self.counter += 1;
        self.counter
    }
}

// Create a wrapper for Tauri managed state
pub struct MyFeatureStateWrapper(Arc<Mutex<MyFeatureState>>);

impl MyFeatureStateWrapper {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(MyFeatureState::new())))
    }
}

// Register in lib.rs setup()
app.manage(MyFeatureStateWrapper::new());
```

### Using State in Commands

```rust
use tauri::State;

#[tauri::command]
async fn my_command(
    state: State<'_, MyFeatureStateWrapper>,
    param: String,
) -> Result<i32, String> {
    // Acquire lock
    let mut data = state.0.lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    // Use state
    data.data.insert(param, "value".to_string());
    let count = data.increment();

    // Lock is automatically released when guard goes out of scope
    Ok(count)
}
```

### Async State with Tokio Mutex

```rust
use tokio::sync::Mutex as TokioMutex;
use std::sync::Arc;

pub struct AsyncStateWrapper(Arc<TokioMutex<MyState>>);

#[tauri::command]
async fn async_command(
    state: State<'_, AsyncStateWrapper>,
) -> Result<String, String> {
    // Can hold lock across await points
    let mut data = state.0.lock().await;

    // Async operation
    let result = fetch_data().await?;
    data.update(result);

    // Explicit drop to release lock before return
    drop(data);

    Ok("Success".to_string())
}
```

### Shared State Between Commands

```rust
// State that can be cloned and shared
pub struct SharedService {
    config: Arc<RwLock<Config>>,
    client: Arc<HttpClient>,
}

impl SharedService {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(Config::default())),
            client: Arc::new(HttpClient::new()),
        }
    }

    pub async fn perform_action(&self) -> Result<Response> {
        // Read config
        let config = self.config.read().await;
        let url = &config.endpoint;

        // Use client (multiple threads can use this simultaneously)
        self.client.get(url).await
    }
}

pub struct SharedServiceWrapper(Arc<SharedService>);

impl SharedServiceWrapper {
    pub fn new() -> Self {
        Self(Arc::new(SharedService::new()))
    }
}

#[tauri::command]
async fn use_shared_service(
    service: State<'_, SharedServiceWrapper>,
) -> Result<Response, String> {
    service.0.perform_action()
        .await
        .map_err(|e| e.to_string())
}
```

## Async Patterns

### Spawning Background Tasks

```rust
use tauri::async_runtime;

#[tauri::command]
async fn start_background_task(
    app: tauri::AppHandle,
) -> Result<String, String> {
    let task_id = uuid::Uuid::new_v4().to_string();
    let task_id_clone = task_id.clone();

    // Spawn task that runs independently
    async_runtime::spawn(async move {
        for i in 0..100 {
            // Do work
            sleep(Duration::from_millis(100)).await;

            // Emit progress
            let _ = app.emit("task-progress", json!({
                "task_id": task_id_clone,
                "progress": i,
            }));
        }

        // Emit completion
        let _ = app.emit("task-complete", json!({
            "task_id": task_id_clone,
        }));
    });

    Ok(task_id)
}
```

### Parallel Execution

```rust
use futures::future::join_all;

#[tauri::command]
async fn fetch_multiple_resources() -> Result<Vec<Resource>, String> {
    // Create futures
    let futures = vec![
        fetch_resource("resource1"),
        fetch_resource("resource2"),
        fetch_resource("resource3"),
    ];

    // Execute in parallel
    let results = join_all(futures).await;

    // Collect successful results
    let resources = results
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    Ok(resources)
}

async fn fetch_resource(id: &str) -> Result<Resource> {
    // Fetch from API
    Ok(Resource::new(id))
}
```

### Timeouts

```rust
use tokio::time::timeout;

#[tauri::command]
async fn fetch_with_timeout(url: String) -> Result<String, String> {
    let fetch_future = async {
        // Long-running operation
        reqwest::get(&url)
            .await?
            .text()
            .await
    };

    // Add 10 second timeout
    match timeout(Duration::from_secs(10), fetch_future).await {
        Ok(Ok(text)) => Ok(text),
        Ok(Err(e)) => Err(format!("Fetch error: {}", e)),
        Err(_) => Err("Request timed out".to_string()),
    }
}
```

### Channels for Communication

```rust
use tokio::sync::mpsc;

async fn process_queue() {
    let (tx, mut rx) = mpsc::channel::<Task>(100);

    // Spawn producer
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        for i in 0..10 {
            let task = Task { id: i };
            tx_clone.send(task).await.ok();
        }
    });

    // Consumer
    while let Some(task) = rx.recv().await {
        process_task(task).await;
    }
}

async fn process_task(task: Task) {
    // Process task
}
```

### Retry Logic

```rust
use std::time::Duration;
use tokio::time::sleep;

async fn retry_with_backoff<F, T, E>(
    mut operation: F,
    max_retries: u32,
) -> Result<T, E>
where
    F: FnMut() -> futures::future::BoxFuture<'static, Result<T, E>>,
{
    let mut retries = 0;

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) if retries < max_retries => {
                retries += 1;
                let backoff = Duration::from_millis(100 * 2_u64.pow(retries));
                tracing::warn!("Operation failed, retrying in {:?}", backoff);
                sleep(backoff).await;
            }
            Err(e) => return Err(e),
        }
    }
}

// Usage
let result = retry_with_backoff(
    || Box::pin(async { fetch_data().await }),
    3, // max retries
).await?;
```

## Error Handling

### Custom Error Types

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MyError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Internal error")]
    Internal,
}

// Use in internal functions
fn internal_function() -> Result<Data, MyError> {
    let db_data = fetch_from_db()?; // Auto-converts via From trait
    let api_data = fetch_from_api()?; // Auto-converts via From trait

    if db_data.is_empty() {
        return Err(MyError::NotFound("No data".to_string()));
    }

    Ok(combine(db_data, api_data))
}

// Convert to String for Tauri commands
#[tauri::command]
async fn my_command() -> Result<Data, String> {
    internal_function()
        .map_err(|e| {
            tracing::error!("Command failed: {:#}", e);
            e.to_string() // User-friendly error message
        })
}
```

### Error Context

```rust
use anyhow::{Context, Result};

fn load_config() -> Result<Config> {
    let path = get_config_path()
        .context("Failed to determine config path")?;

    let content = std::fs::read_to_string(&path)
        .context(format!("Failed to read config file: {:?}", path))?;

    let config: Config = serde_json::from_str(&content)
        .context("Failed to parse config JSON")?;

    validate_config(&config)
        .context("Config validation failed")?;

    Ok(config)
}

// Error will include full context chain:
// "Config validation failed: Failed to parse config JSON:
//  Failed to read config file: /path/to/config.json: ..."
```

### Result Mapping

```rust
// Map error types
let result: Result<Value, String> = internal_function()
    .map_err(|e| format!("Operation failed: {}", e));

// Map ok value
let doubled: Result<i32, _> = calculate()
    .map(|n| n * 2);

// Map both
let result = operation()
    .map(|v| v.to_string())
    .map_err(|e| format!("Error: {}", e));
```

### Error Recovery

```rust
fn operation_with_fallback() -> Result<String> {
    match risky_operation() {
        Ok(value) => Ok(value),
        Err(e) => {
            tracing::warn!("Primary operation failed: {}, using fallback", e);
            fallback_operation()
        }
    }
}

// Or with closures
let result = risky_operation()
    .or_else(|_| fallback_operation())
    .unwrap_or_else(|_| "default".to_string());
```

## Database Operations

### Basic Query

```rust
use rusqlite::{Connection, params};

fn get_user(conn: &Connection, user_id: &str) -> Result<User> {
    conn.query_row(
        "SELECT id, name, email FROM users WHERE id = ?1",
        params![user_id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                name: row.get(1)?,
                email: row.get(2)?,
            })
        },
    )
    .map_err(|e| anyhow!("Failed to get user: {}", e))
}
```

### Multiple Results

```rust
fn get_all_users(conn: &Connection) -> Result<Vec<User>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, email FROM users ORDER BY name"
    )?;

    let users = stmt.query_map([], |row| {
        Ok(User {
            id: row.get(0)?,
            name: row.get(1)?,
            email: row.get(2)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;

    Ok(users)
}
```

### Transactions

```rust
fn transfer_funds(
    conn: &Connection,
    from: &str,
    to: &str,
    amount: f64,
) -> Result<()> {
    let tx = conn.transaction()?;

    // Debit from account
    tx.execute(
        "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
        params![amount, from],
    )?;

    // Credit to account
    tx.execute(
        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
        params![amount, to],
    )?;

    // Verify both accounts have positive balance
    let from_balance: f64 = tx.query_row(
        "SELECT balance FROM accounts WHERE id = ?1",
        params![from],
        |row| row.get(0),
    )?;

    if from_balance < 0.0 {
        return Err(anyhow!("Insufficient funds"));
    }

    // Commit transaction
    tx.commit()?;

    Ok(())
}
```

### Prepared Statements

```rust
fn batch_insert(conn: &Connection, items: &[Item]) -> Result<()> {
    // Prepare once, execute many times
    let mut stmt = conn.prepare(
        "INSERT INTO items (id, name, value) VALUES (?1, ?2, ?3)"
    )?;

    for item in items {
        stmt.execute(params![item.id, item.name, item.value])?;
    }

    Ok(())
}
```

### Async Database Access

```rust
use tokio_rusqlite::Connection;

async fn async_query(conn: &Connection) -> Result<Vec<Item>> {
    conn.call(|conn| {
        let mut stmt = conn.prepare("SELECT * FROM items")?;

        let items = stmt.query_map([], |row| {
            Ok(Item {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(items)
    })
    .await
}
```

## Security Patterns

### Input Validation

```rust
use std::path::{Path, PathBuf};

fn validate_file_path(
    path: &str,
    workspace: &Path,
) -> Result<PathBuf, String> {
    // Canonicalize path
    let path = Path::new(path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    // Ensure within workspace
    if !path.starts_with(workspace) {
        return Err("Path outside workspace".to_string());
    }

    // Additional checks
    if path.extension().map_or(false, |ext| ext == "exe") {
        return Err("Executable files not allowed".to_string());
    }

    Ok(path)
}

#[tauri::command]
async fn read_file(
    path: String,
    workspace: String,
) -> Result<String, String> {
    // Validate first
    let safe_path = validate_file_path(&path, Path::new(&workspace))?;

    // Now safe to read
    tokio::fs::read_to_string(safe_path)
        .await
        .map_err(|e| format!("Read error: {}", e))
}
```

### Policy Check Example

```rust
use crate::sys::security::{PolicyEngine, PolicyContext, ActionCategory, PolicyDecision};

async fn perform_sensitive_operation(
    user_id: &str,
    file_path: &str,
    workspace: Option<String>,
) -> Result<()> {
    let engine = PolicyEngine::new();

    let context = PolicyContext {
        action: ActionCategory::FileDelete,
        target: file_path.to_string(),
        user: user_id.to_string(),
        workspace,
        request_origin: "user_command".to_string(),
    };

    match engine.evaluate(&context) {
        PolicyDecision::Allow => {
            // Proceed with operation
            delete_file(file_path).await?;
        }
        PolicyDecision::Deny { reason } => {
            return Err(anyhow!("Access denied: {}", reason));
        }
        PolicyDecision::RequestApproval { risk_level } => {
            // Request approval from user
            let approved = request_approval(&context, risk_level).await?;

            if !approved {
                return Err(anyhow!("Operation not approved"));
            }

            // Proceed after approval
            delete_file(file_path).await?;
        }
    }

    Ok(())
}
```

### Audit Logging

```rust
use crate::sys::security::{EnhancedAuditLogger, AuditEventType, AuditStatus};

async fn logged_operation(
    logger: &EnhancedAuditLogger,
    user_id: &str,
) -> Result<()> {
    let operation_result = perform_operation().await;

    // Log the operation
    logger.log_event(
        user_id,
        AuditEventType::DataModification,
        "user_profile",
        "update",
        json!({
            "fields_updated": ["email", "name"],
        }),
        if operation_result.is_ok() {
            AuditStatus::Success
        } else {
            AuditStatus::Failure
        },
    ).await?;

    operation_result
}
```

## Event Emission

### Emit Events from Commands

```rust
use tauri::Manager;

#[tauri::command]
async fn process_data(
    app: tauri::AppHandle,
    data: Vec<String>,
) -> Result<(), String> {
    let total = data.len();

    for (i, item) in data.iter().enumerate() {
        // Process item
        process_item(item).await?;

        // Emit progress
        app.emit("progress", json!({
            "current": i + 1,
            "total": total,
            "percent": ((i + 1) as f64 / total as f64) * 100.0,
        })).map_err(|e| e.to_string())?;
    }

    // Emit completion
    app.emit("complete", json!({
        "processed": total,
    })).map_err(|e| e.to_string())?;

    Ok(())
}
```

### Streaming Responses

```rust
#[tauri::command]
async fn stream_llm_response(
    app: tauri::AppHandle,
    prompt: String,
) -> Result<String, String> {
    let mut response = String::new();

    // Stream chunks
    let mut stream = llm_client.stream(prompt).await?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        response.push_str(&chunk);

        // Emit each chunk
        app.emit("llm-chunk", json!({
            "content": chunk,
        })).ok();
    }

    // Emit final response
    app.emit("llm-complete", json!({
        "content": response,
    })).ok();

    Ok(response)
}
```

### Custom Event Payloads

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
struct TaskUpdateEvent {
    task_id: String,
    status: String,
    progress: f64,
    message: Option<String>,
}

#[tauri::command]
async fn execute_task(
    app: tauri::AppHandle,
    task_id: String,
) -> Result<(), String> {
    // Emit started
    app.emit("task-update", TaskUpdateEvent {
        task_id: task_id.clone(),
        status: "started".to_string(),
        progress: 0.0,
        message: None,
    }).ok();

    // Do work...

    // Emit progress
    app.emit("task-update", TaskUpdateEvent {
        task_id: task_id.clone(),
        status: "running".to_string(),
        progress: 0.5,
        message: Some("Halfway done".to_string()),
    }).ok();

    // Emit completed
    app.emit("task-update", TaskUpdateEvent {
        task_id: task_id.clone(),
        status: "completed".to_string(),
        progress: 1.0,
        message: None,
    }).ok();

    Ok(())
}
```

## Testing Patterns

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_function() {
        let result = my_function("input");
        assert_eq!(result, "expected");
    }

    #[test]
    fn test_error_case() {
        let result = my_function("");
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_async_function() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

### Testing with Temporary Database

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use rusqlite::Connection;

    fn setup_test_db() -> (TempDir, Connection) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let conn = Connection::open(&db_path).unwrap();

        // Run migrations
        migrations::run_migrations(&conn).unwrap();

        (temp_dir, conn)
    }

    #[test]
    fn test_database_operation() {
        let (_temp_dir, conn) = setup_test_db();

        // Insert test data
        conn.execute(
            "INSERT INTO users (id, name) VALUES (?1, ?2)",
            params!["test-id", "Test User"],
        ).unwrap();

        // Test query
        let name: String = conn.query_row(
            "SELECT name FROM users WHERE id = ?1",
            params!["test-id"],
            |row| row.get(0),
        ).unwrap();

        assert_eq!(name, "Test User");

        // _temp_dir is dropped, database is cleaned up
    }
}
```

### Mocking with Mockall

```rust
#[cfg(test)]
use mockall::automock;

#[automock]
trait DataProvider {
    fn fetch_data(&self, id: &str) -> Result<String>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_with_mock() {
        let mut mock = MockDataProvider::new();

        // Set expectations
        mock.expect_fetch_data()
            .with(mockall::predicate::eq("test-id"))
            .times(1)
            .returning(|_| Ok("test data".to_string()));

        // Use mock
        let result = mock.fetch_data("test-id").unwrap();
        assert_eq!(result, "test data");
    }
}
```

### Property-Based Testing

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_reversal_is_involution(s: String) {
            let reversed = reverse(&s);
            let double_reversed = reverse(&reversed);
            prop_assert_eq!(&double_reversed, &s);
        }

        #[test]
        fn test_addition_commutative(a: i32, b: i32) {
            prop_assert_eq!(add(a, b), add(b, a));
        }
    }
}
```

### Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;
    use serial_test::serial;

    // Serial attribute ensures tests don't run in parallel
    #[tokio::test]
    #[serial]
    async fn test_full_workflow() {
        // Setup
        let app = setup_test_app().await;

        // Execute workflow
        let result = execute_workflow(&app, "test-workflow").await;

        // Verify
        assert!(result.is_ok());

        // Cleanup
        cleanup(&app).await;
    }
}
```

## Performance Patterns

### Rayon for CPU-Bound Work

```rust
use rayon::prelude::*;

fn process_large_dataset(items: Vec<Item>) -> Vec<Result> {
    items
        .par_iter()              // Parallel iterator
        .map(|item| {
            expensive_computation(item)
        })
        .collect()
}
```

### Lazy Initialization

```rust
use std::sync::LazyLock;

static EXPENSIVE_RESOURCE: LazyLock<Resource> = LazyLock::new(|| {
    // Only initialized once, on first access
    Resource::initialize()
});

fn use_resource() {
    EXPENSIVE_RESOURCE.do_something();
}
```

### Caching Pattern

```rust
use std::collections::HashMap;
use std::sync::Mutex;

struct Cache {
    data: Mutex<HashMap<String, (String, Instant)>>,
    ttl: Duration,
}

impl Cache {
    fn get(&self, key: &str) -> Option<String> {
        let data = self.data.lock().unwrap();

        data.get(key).and_then(|(value, timestamp)| {
            if timestamp.elapsed() < self.ttl {
                Some(value.clone())
            } else {
                None
            }
        })
    }

    fn set(&self, key: String, value: String) {
        let mut data = self.data.lock().unwrap();
        data.insert(key, (value, Instant::now()));
    }
}
```

## Further Examples

For more examples, see:
- [Tauri Examples](https://github.com/tauri-apps/tauri/tree/dev/examples)
- [Tokio Examples](https://github.com/tokio-rs/tokio/tree/master/examples)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
