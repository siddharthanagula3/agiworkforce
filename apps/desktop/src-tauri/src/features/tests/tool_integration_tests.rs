use std::fs;
use tempfile::tempdir;

#[test]
fn test_file_operations_integration() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("integration_test.txt");

    let content = "Integration test content\nLine 2\nLine 3";
    fs::write(&file_path, content).unwrap();

    let read_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(read_content, content);

    assert!(file_path.exists());

    let metadata = fs::metadata(&file_path).unwrap();
    assert!(metadata.is_file());
    assert_eq!(metadata.len(), content.len() as u64);
}

#[tokio::test]
async fn test_command_execution_integration() {
    use tokio::process::Command;

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(["/C", "echo", "test"]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("echo");
    #[cfg(not(target_os = "windows"))]
    cmd.arg("test");

    let output = cmd.output().await.unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("test"));
}

#[test]
fn test_json_serialization_integration() {
    use serde_json::json;

    let tool_call = json!({
        "id": "call_123",
        "name": "file_read",
        "arguments": {
            "path": "/tmp/test.txt"
        }
    });

    assert_eq!(tool_call["id"], "call_123");
    assert_eq!(tool_call["name"], "file_read");
    assert_eq!(tool_call["arguments"]["path"], "/tmp/test.txt");

    let json_str = serde_json::to_string(&tool_call).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
    assert_eq!(tool_call, parsed);
}

#[test]
fn test_error_handling_integration() {
    let result = fs::read_to_string("/nonexistent/path/file.txt");
    assert!(result.is_err());

    let result = fs::write("/\0invalid/path.txt", "content");
    assert!(result.is_err());
}

#[test]
fn test_concurrent_file_operations() {
    use std::sync::Arc;
    use std::thread;

    let dir = Arc::new(tempdir().unwrap());
    let mut handles = vec![];

    for i in 0..10 {
        let dir_clone = Arc::clone(&dir);
        let handle = thread::spawn(move || {
            let file_path = dir_clone.path().join(format!("concurrent_{}.txt", i));
            fs::write(&file_path, format!("Thread {}", i)).unwrap();
            assert!(file_path.exists());
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    for i in 0..10 {
        let file_path = dir.path().join(format!("concurrent_{}.txt", i));
        assert!(file_path.exists());
        let content = fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, format!("Thread {}", i));
    }
}

#[test]
fn test_large_file_operations() {
    let dir = tempdir().unwrap();
    let file_path = dir.path().join("large_file.txt");

    let content = "A".repeat(1024 * 1024);

    fs::write(&file_path, &content).unwrap();

    let read_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(read_content.len(), 1024 * 1024);
    assert_eq!(read_content, content);

    let metadata = fs::metadata(&file_path).unwrap();
    assert_eq!(metadata.len(), 1024 * 1024);
}

#[test]
fn test_directory_operations() {
    let dir = tempdir().unwrap();

    let nested_path = dir.path().join("level1").join("level2").join("level3");
    fs::create_dir_all(&nested_path).unwrap();
    assert!(nested_path.exists());
    assert!(nested_path.is_dir());

    let file_path = nested_path.join("nested_file.txt");
    fs::write(&file_path, "nested content").unwrap();
    assert!(file_path.exists());

    let entries: Vec<_> = fs::read_dir(dir.path().join("level1").join("level2").join("level3"))
        .unwrap()
        .collect();
    assert_eq!(entries.len(), 1);
}

#[cfg(test)]
mod benchmarks {
    use super::*;

    #[test]
    fn bench_file_read_write() {
        use std::time::Instant;

        let dir = tempdir().unwrap();
        let iterations = 1000;

        let start = Instant::now();
        for i in 0..iterations {
            let file_path = dir.path().join(format!("bench_{}.txt", i));
            fs::write(&file_path, format!("Iteration {}", i)).unwrap();
            let _ = fs::read_to_string(&file_path).unwrap();
        }
        let elapsed = start.elapsed();

        println!(
            "File operations: {} iterations in {:?} ({:.2} ops/sec)",
            iterations,
            elapsed,
            iterations as f64 / elapsed.as_secs_f64()
        );

        assert!(elapsed.as_secs_f64() < (iterations as f64 / 100.0));
    }
}
