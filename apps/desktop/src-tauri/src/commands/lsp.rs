/*!
 * LSP (Language Server Protocol) Integration
 * Provides full code intelligence via language servers
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LSPServer {
    pub language: String,
    pub command: String,
    pub args: Vec<String>,
    pub root_uri: String,
    pub initialized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub uri: String,
    pub range: Range,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionItem {
    pub label: String,
    pub kind: u32,
    pub detail: Option<String>,
    pub documentation: Option<String>,
    pub insert_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hover {
    pub contents: String,
    pub range: Option<Range>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub range: Range,
    pub severity: u32, // 1=Error, 2=Warning, 3=Info, 4=Hint
    pub message: String,
    pub source: Option<String>,
}

pub struct LSPClient {
    process: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    request_id: u32,
    server_info: LSPServer,
}

impl LSPClient {
    pub async fn new(language: &str, root_uri: &str) -> Result<Self, String> {
        let (command, args) = get_lsp_command(language)?;

        let mut process = Command::new(&command)
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start LSP server: {}", e))?;

        let stdin = process
            .stdin
            .take()
            .ok_or("Failed to get stdin")?;
        let stdout = process
            .stdout
            .take()
            .ok_or("Failed to get stdout")?;

        let mut client = LSPClient {
            process,
            stdin,
            stdout: BufReader::new(stdout),
            request_id: 1,
            server_info: LSPServer {
                language: language.to_string(),
                command: command.clone(),
                args: args.clone(),
                root_uri: root_uri.to_string(),
                initialized: false,
            },
        };

        // Initialize LSP server
        client.initialize(root_uri).await?;

        Ok(client)
    }

    async fn initialize(&mut self, root_uri: &str) -> Result<(), String> {
        let init_request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "initialize",
            "params": {
                "processId": std::process::id(),
                "rootUri": root_uri,
                "capabilities": {
                    "textDocument": {
                        "completion": {
                            "completionItem": {
                                "snippetSupport": true
                            }
                        },
                        "hover": {
                            "contentFormat": ["markdown", "plaintext"]
                        },
                        "definition": {
                            "linkSupport": true
                        },
                        "references": {},
                        "documentSymbol": {},
                        "publishDiagnostics": {}
                    }
                }
            }
        });

        self.send_request(&init_request).await?;
        let _response = self.read_response().await?;

        // Send initialized notification
        let initialized = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "initialized",
            "params": {}
        });

        self.send_notification(&initialized).await?;
        self.server_info.initialized = true;
        self.request_id += 1;

        Ok(())
    }

    async fn send_request(&mut self, request: &serde_json::Value) -> Result<(), String> {
        let content = request.to_string();
        let message = format!(
            "Content-Length: {}\r\n\r\n{}",
            content.len(),
            content
        );

        self.stdin
            .write_all(message.as_bytes())
            .await
            .map_err(|e| format!("Failed to send request: {}", e))?;

        self.stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        Ok(())
    }

    async fn send_notification(&mut self, notification: &serde_json::Value) -> Result<(), String> {
        let content = notification.to_string();
        let message = format!(
            "Content-Length: {}\r\n\r\n{}",
            content.len(),
            content
        );

        self.stdin
            .write_all(message.as_bytes())
            .await
            .map_err(|e| format!("Failed to send notification: {}", e))?;

        self.stdin
            .flush()
            .await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        Ok(())
    }

    async fn read_response(&mut self) -> Result<serde_json::Value, String> {
        // Read Content-Length header
        let mut header = String::new();
        self.stdout
            .read_line(&mut header)
            .await
            .map_err(|e| format!("Failed to read header: {}", e))?;

        let content_length = header
            .trim()
            .strip_prefix("Content-Length: ")
            .ok_or("Invalid header")?
            .parse::<usize>()
            .map_err(|e| format!("Invalid content length: {}", e))?;

        // Read empty line
        let mut empty = String::new();
        self.stdout
            .read_line(&mut empty)
            .await
            .map_err(|e| format!("Failed to read empty line: {}", e))?;

        // Read content
        let mut buffer = vec![0u8; content_length];
        tokio::io::AsyncReadExt::read_exact(&mut self.stdout, &mut buffer)
            .await
            .map_err(|e| format!("Failed to read content: {}", e))?;

        let content = String::from_utf8(buffer)
            .map_err(|e| format!("Invalid UTF-8: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Invalid JSON: {}", e))
    }

    pub async fn shutdown(&mut self) -> Result<(), String> {
        let shutdown_request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "shutdown",
            "params": null
        });

        self.send_request(&shutdown_request).await?;
        let _response = self.read_response().await?;

        let exit_notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "exit"
        });

        self.send_notification(&exit_notification).await?;

        self.process
            .kill()
            .await
            .map_err(|e| format!("Failed to kill process: {}", e))?;

        Ok(())
    }

    pub async fn text_document_did_open(
        &mut self,
        uri: &str,
        language_id: &str,
        content: &str,
    ) -> Result<(), String> {
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "textDocument/didOpen",
            "params": {
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": content
                }
            }
        });

        self.send_notification(&notification).await
    }

    pub async fn text_document_completion(
        &mut self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<CompletionItem>, String> {
        self.request_id += 1;
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "textDocument/completion",
            "params": {
                "textDocument": {
                    "uri": uri
                },
                "position": {
                    "line": line,
                    "character": character
                }
            }
        });

        self.send_request(&request).await?;
        let response = self.read_response().await?;

        if let Some(result) = response.get("result") {
            if let Some(items) = result.get("items") {
                let completion_items: Vec<CompletionItem> = serde_json::from_value(items.clone())
                    .unwrap_or_default();
                return Ok(completion_items);
            }
        }

        Ok(Vec::new())
    }

    pub async fn text_document_hover(
        &mut self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Option<Hover>, String> {
        self.request_id += 1;
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "textDocument/hover",
            "params": {
                "textDocument": {
                    "uri": uri
                },
                "position": {
                    "line": line,
                    "character": character
                }
            }
        });

        self.send_request(&request).await?;
        let response = self.read_response().await?;

        if let Some(result) = response.get("result") {
            if !result.is_null() {
                let hover: Hover = serde_json::from_value(result.clone())
                    .unwrap_or_else(|_| Hover {
                        contents: String::new(),
                        range: None,
                    });
                return Ok(Some(hover));
            }
        }

        Ok(None)
    }

    pub async fn text_document_definition(
        &mut self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<Location>, String> {
        self.request_id += 1;
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "textDocument/definition",
            "params": {
                "textDocument": {
                    "uri": uri
                },
                "position": {
                    "line": line,
                    "character": character
                }
            }
        });

        self.send_request(&request).await?;
        let response = self.read_response().await?;

        if let Some(result) = response.get("result") {
            if result.is_array() {
                let locations: Vec<Location> = serde_json::from_value(result.clone())
                    .unwrap_or_default();
                return Ok(locations);
            } else if !result.is_null() {
                let location: Location = serde_json::from_value(result.clone())
                    .unwrap_or_else(|_| Location {
                        uri: String::new(),
                        range: Range {
                            start: Position { line: 0, character: 0 },
                            end: Position { line: 0, character: 0 },
                        },
                    });
                return Ok(vec![location]);
            }
        }

        Ok(Vec::new())
    }

    pub async fn text_document_references(
        &mut self,
        uri: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<Location>, String> {
        self.request_id += 1;
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "textDocument/references",
            "params": {
                "textDocument": {
                    "uri": uri
                },
                "position": {
                    "line": line,
                    "character": character
                },
                "context": {
                    "includeDeclaration": true
                }
            }
        });

        self.send_request(&request).await?;
        let response = self.read_response().await?;

        if let Some(result) = response.get("result") {
            if result.is_array() {
                let locations: Vec<Location> = serde_json::from_value(result.clone())
                    .unwrap_or_default();
                return Ok(locations);
            }
        }

        Ok(Vec::new())
    }
}

pub struct LSPState {
    clients: Mutex<HashMap<String, Arc<Mutex<LSPClient>>>>,
}

impl LSPState {
    pub fn new() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
        }
    }
}

fn get_lsp_command(language: &str) -> Result<(String, Vec<String>), String> {
    match language {
        "rust" => Ok(("rust-analyzer".to_string(), vec![])),
        "typescript" | "javascript" => Ok((
            "typescript-language-server".to_string(),
            vec!["--stdio".to_string()],
        )),
        "python" => Ok(("pylsp".to_string(), vec![])),
        "go" => Ok(("gopls".to_string(), vec![])),
        "java" => Ok((
            "jdtls".to_string(),
            vec![],
        )),
        "cpp" | "c" => Ok(("clangd".to_string(), vec![])),
        _ => Err(format!("Unsupported language: {}", language)),
    }
}

// Tauri commands

#[tauri::command]
pub async fn lsp_start_server(
    language: String,
    root_path: PathBuf,
    state: tauri::State<'_, Arc<LSPState>>,
) -> Result<LSPServer, String> {
    let root_uri = format!("file://{}", root_path.display());
    let client = LSPClient::new(&language, &root_uri).await?;
    let server_info = client.server_info.clone();

    let mut clients = state.clients.lock().await;
    clients.insert(language.clone(), Arc::new(Mutex::new(client)));

    Ok(server_info)
}

#[tauri::command]
pub async fn lsp_stop_server(
    language: String,
    state: tauri::State<'_, Arc<LSPState>>,
) -> Result<(), String> {
    let mut clients = state.clients.lock().await;
    if let Some(client_arc) = clients.remove(&language) {
        let mut client = client_arc.lock().await;
        client.shutdown().await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn lsp_did_open(
    language: String,
    uri: String,
    language_id: String,
    content: String,
    state: tauri::State<'_, Arc<LSPState>>,
) -> Result<(), String> {
    let clients = state.clients.lock().await;
    let client_arc = clients
        .get(&language)
        .ok_or("LSP server not started")?;
    let mut client = client_arc.lock().await;

    client
        .text_document_did_open(&uri, &language_id, &content)
        .await
}

#[tauri::command]
pub async fn lsp_completion(
    language: String,
    uri: String,
    line: u32,
    character: u32,
    state: tauri::State<'_, Arc<LSPState>>,
) -> Result<Vec<CompletionItem>, String> {
    let clients = state.clients.lock().await;
    let client_arc = clients
        .get(&language)
        .ok_or("LSP server not started")?;
    let mut client = client_arc.lock().await;

    client.text_document_completion(&uri, line, character).await
}

#[tauri::command]
pub async fn lsp_hover(
    language: String,
    uri: String,
    line: u32,
    character: u32,
    state: tauri::State<'_, Arc<LSPState>>,
) -> Result<Option<Hover>, String> {
    let clients = state.clients.lock().await;
    let client_arc = clients
        .get(&language)
        .ok_or("LSP server not started")?;
    let mut client = client_arc.lock().await;

    client.text_document_hover(&uri, line, character).await
}

#[tauri::command]
pub async fn lsp_definition(
    language: String,
    uri: String,
    line: u32,
    character: u32,
    state: tauri::State<'_, Arc<LSPState>>,
) -> Result<Vec<Location>, String> {
    let clients = state.clients.lock().await;
    let client_arc = clients
        .get(&language)
        .ok_or("LSP server not started")?;
    let mut client = client_arc.lock().await;

    client.text_document_definition(&uri, line, character).await
}

#[tauri::command]
pub async fn lsp_references(
    language: String,
    uri: String,
    line: u32,
    character: u32,
    state: tauri::State<'_, Arc<LSPState>>,
) -> Result<Vec<Location>, String> {
    let clients = state.clients.lock().await;
    let client_arc = clients
        .get(&language)
        .ok_or("LSP server not started")?;
    let mut client = client_arc.lock().await;

    client.text_document_references(&uri, line, character).await
}
