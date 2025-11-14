/// Mock implementations for testing
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Mock LLM Router for testing
pub struct MockLLMRouter {
    responses: Arc<Mutex<Vec<String>>>,
    call_count: Arc<Mutex<usize>>,
}

impl MockLLMRouter {
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(vec![])),
            call_count: Arc::new(Mutex::new(0)),
        }
    }

    pub fn with_responses(responses: Vec<String>) -> Self {
        Self {
            responses: Arc::new(Mutex::new(responses)),
            call_count: Arc::new(Mutex::new(0)),
        }
    }

    pub async fn complete(&self, _prompt: &str, _max_tokens: usize) -> Result<String, String> {
        let mut count = self.call_count.lock().unwrap();
        *count += 1;

        let responses = self.responses.lock().unwrap();
        if responses.is_empty() {
            Ok("Mock response".to_string())
        } else {
            let index = (*count - 1) % responses.len();
            Ok(responses[index].clone())
        }
    }

    pub fn call_count(&self) -> usize {
        *self.call_count.lock().unwrap()
    }

    pub fn reset(&self) {
        let mut count = self.call_count.lock().unwrap();
        *count = 0;
    }
}

impl Default for MockLLMRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock Tool Executor for testing
pub struct MockToolExecutor {
    results: Arc<Mutex<HashMap<String, Value>>>,
}

impl MockToolExecutor {
    pub fn new() -> Self {
        Self {
            results: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_result(&self, tool_id: &str, result: Value) {
        let mut results = self.results.lock().unwrap();
        results.insert(tool_id.to_string(), result);
    }

    pub async fn execute_tool(&self, tool_id: &str, _params: Value) -> Result<Value, String> {
        let results = self.results.lock().unwrap();
        results
            .get(tool_id)
            .cloned()
            .ok_or_else(|| format!("No mock result for tool: {}", tool_id))
    }
}

impl Default for MockToolExecutor {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock Browser Controller for testing
pub struct MockBrowserController {
    navigation_history: Arc<Mutex<Vec<String>>>,
}

impl MockBrowserController {
    pub fn new() -> Self {
        Self {
            navigation_history: Arc::new(Mutex::new(vec![])),
        }
    }

    pub async fn navigate(&self, url: &str) -> Result<(), String> {
        let mut history = self.navigation_history.lock().unwrap();
        history.push(url.to_string());
        Ok(())
    }

    pub fn get_history(&self) -> Vec<String> {
        self.navigation_history.lock().unwrap().clone()
    }
}

impl Default for MockBrowserController {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock File System for testing
pub struct MockFileSystem {
    files: Arc<Mutex<HashMap<String, String>>>,
}

impl MockFileSystem {
    pub fn new() -> Self {
        Self {
            files: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_file(&self, path: &str, content: &str) {
        let mut files = self.files.lock().unwrap();
        files.insert(path.to_string(), content.to_string());
    }

    pub fn read_file(&self, path: &str) -> Result<String, String> {
        let files = self.files.lock().unwrap();
        files
            .get(path)
            .cloned()
            .ok_or_else(|| format!("File not found: {}", path))
    }

    pub fn write_file(&self, path: &str, content: &str) -> Result<(), String> {
        let mut files = self.files.lock().unwrap();
        files.insert(path.to_string(), content.to_string());
        Ok(())
    }

    pub fn delete_file(&self, path: &str) -> Result<(), String> {
        let mut files = self.files.lock().unwrap();
        files
            .remove(path)
            .ok_or_else(|| format!("File not found: {}", path))?;
        Ok(())
    }

    pub fn file_exists(&self, path: &str) -> bool {
        let files = self.files.lock().unwrap();
        files.contains_key(path)
    }
}

impl Default for MockFileSystem {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock Database for testing
pub struct MockDatabase {
    records: Arc<Mutex<HashMap<String, Vec<HashMap<String, Value>>>>>,
}

impl MockDatabase {
    pub fn new() -> Self {
        Self {
            records: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn insert(&self, table: &str, record: HashMap<String, Value>) -> Result<(), String> {
        let mut records = self.records.lock().unwrap();
        records
            .entry(table.to_string())
            .or_insert_with(Vec::new)
            .push(record);
        Ok(())
    }

    pub fn query(&self, table: &str) -> Result<Vec<HashMap<String, Value>>, String> {
        let records = self.records.lock().unwrap();
        Ok(records.get(table).cloned().unwrap_or_default())
    }

    pub fn clear(&self, table: &str) {
        let mut records = self.records.lock().unwrap();
        records.remove(table);
    }
}

impl Default for MockDatabase {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock API Client for testing
pub struct MockApiClient {
    responses: Arc<Mutex<HashMap<String, Value>>>,
    requests: Arc<Mutex<Vec<(String, String)>>>, // (method, url)
}

impl MockApiClient {
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(HashMap::new())),
            requests: Arc::new(Mutex::new(vec![])),
        }
    }

    pub fn set_response(&self, url: &str, response: Value) {
        let mut responses = self.responses.lock().unwrap();
        responses.insert(url.to_string(), response);
    }

    pub async fn request(&self, method: &str, url: &str) -> Result<Value, String> {
        let mut requests = self.requests.lock().unwrap();
        requests.push((method.to_string(), url.to_string()));

        let responses = self.responses.lock().unwrap();
        responses
            .get(url)
            .cloned()
            .ok_or_else(|| format!("No mock response for URL: {}", url))
    }

    pub fn get_requests(&self) -> Vec<(String, String)> {
        self.requests.lock().unwrap().clone()
    }
}

impl Default for MockApiClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Mock Resource Monitor for testing
pub struct MockResourceMonitor {
    cpu_usage: Arc<Mutex<f64>>,
    memory_usage: Arc<Mutex<u64>>,
}

impl MockResourceMonitor {
    pub fn new() -> Self {
        Self {
            cpu_usage: Arc::new(Mutex::new(50.0)),
            memory_usage: Arc::new(Mutex::new(1024)),
        }
    }

    pub fn set_cpu_usage(&self, usage: f64) {
        let mut cpu = self.cpu_usage.lock().unwrap();
        *cpu = usage;
    }

    pub fn set_memory_usage(&self, usage: u64) {
        let mut memory = self.memory_usage.lock().unwrap();
        *memory = usage;
    }

    pub fn get_cpu_usage(&self) -> f64 {
        *self.cpu_usage.lock().unwrap()
    }

    pub fn get_memory_usage(&self) -> u64 {
        *self.memory_usage.lock().unwrap()
    }
}

impl Default for MockResourceMonitor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_mock_llm_router() {
        let router = MockLLMRouter::new();
        let response = router.complete("test prompt", 100).await.unwrap();

        assert_eq!(response, "Mock response");
        assert_eq!(router.call_count(), 1);
    }

    #[tokio::test]
    async fn test_mock_llm_router_with_responses() {
        let router =
            MockLLMRouter::with_responses(vec!["Response 1".to_string(), "Response 2".to_string()]);

        let resp1 = router.complete("prompt1", 100).await.unwrap();
        let resp2 = router.complete("prompt2", 100).await.unwrap();

        assert_eq!(resp1, "Response 1");
        assert_eq!(resp2, "Response 2");
        assert_eq!(router.call_count(), 2);
    }

    #[tokio::test]
    async fn test_mock_tool_executor() {
        let executor = MockToolExecutor::new();
        executor.set_result("file_read", json!({"content": "test"}));

        let result = executor
            .execute_tool("file_read", json!({"path": "/test"}))
            .await
            .unwrap();

        assert_eq!(result["content"], "test");
    }

    #[tokio::test]
    async fn test_mock_browser_controller() {
        let browser = MockBrowserController::new();

        browser.navigate("https://example.com").await.unwrap();
        browser.navigate("https://test.com").await.unwrap();

        let history = browser.get_history();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0], "https://example.com");
    }

    #[test]
    fn test_mock_file_system() {
        let fs = MockFileSystem::new();

        fs.create_file("/test.txt", "content");
        assert!(fs.file_exists("/test.txt"));

        let content = fs.read_file("/test.txt").unwrap();
        assert_eq!(content, "content");

        fs.write_file("/test.txt", "new content").unwrap();
        let new_content = fs.read_file("/test.txt").unwrap();
        assert_eq!(new_content, "new content");

        fs.delete_file("/test.txt").unwrap();
        assert!(!fs.file_exists("/test.txt"));
    }

    #[test]
    fn test_mock_database() {
        let db = MockDatabase::new();

        let mut record = HashMap::new();
        record.insert("id".to_string(), json!("1"));
        record.insert("name".to_string(), json!("test"));

        db.insert("users", record).unwrap();

        let results = db.query("users").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0]["id"], json!("1"));
    }

    #[tokio::test]
    async fn test_mock_api_client() {
        let client = MockApiClient::new();
        client.set_response("https://api.test.com/data", json!({"status": "ok"}));

        let response = client
            .request("GET", "https://api.test.com/data")
            .await
            .unwrap();
        assert_eq!(response["status"], "ok");

        let requests = client.get_requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].0, "GET");
    }

    #[test]
    fn test_mock_resource_monitor() {
        let monitor = MockResourceMonitor::new();

        monitor.set_cpu_usage(75.5);
        monitor.set_memory_usage(2048);

        assert_eq!(monitor.get_cpu_usage(), 75.5);
        assert_eq!(monitor.get_memory_usage(), 2048);
    }
}
