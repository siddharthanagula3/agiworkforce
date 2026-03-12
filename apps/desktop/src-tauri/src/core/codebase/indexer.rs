use rusqlite::{params, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio_rusqlite::Connection;
use tracing::debug;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub signature: Option<String>,
    pub documentation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SymbolKind {
    Function,
    Class,
    Interface,
    Struct,
    Enum,
    Variable,
    Constant,
    Method,
    Property,
    Module,
    Import,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexStats {
    pub total_symbols: usize,
    pub total_files: usize,
}

pub struct CodebaseIndexer {
    conn: Connection,
    workspace_root: PathBuf,
}

impl CodebaseIndexer {
    /// Create a new CodebaseIndexer backed by a tokio-rusqlite connection.
    /// The database file is stored at `<workspace_root>/.agi/codebase.db`.
    pub async fn new(workspace_root: PathBuf) -> Result<Self, String> {
        let db_path = workspace_root.join(".agi").join("codebase.db");

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create .agi directory: {}", e))?;
        }

        let db_path_str = db_path.to_string_lossy().to_string();
        let conn = Connection::open(&db_path_str)
            .await
            .map_err(|e| format!("Failed to open codebase database: {}", e))?;

        let indexer = Self {
            conn,
            workspace_root,
        };
        indexer.init_schema().await?;

        debug!("CodebaseIndexer initialized at {:?}", db_path);
        Ok(indexer)
    }

    async fn init_schema(&self) -> Result<(), String> {
        self.conn
            .call(move |conn| {
                let _ = conn.execute(
                    "CREATE TABLE IF NOT EXISTS symbols (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        kind TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        line INTEGER NOT NULL,
                        column INTEGER NOT NULL,
                        signature TEXT,
                        documentation TEXT,
                        indexed_at INTEGER NOT NULL,
                        UNIQUE(name, file_path, line)
                    )",
                    [],
                )?;

                let _ = conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)",
                    [],
                )?;

                let _ = conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path)",
                    [],
                )?;

                let _ = conn.execute(
                    "CREATE TABLE IF NOT EXISTS files (
                        path TEXT PRIMARY KEY,
                        last_indexed INTEGER NOT NULL,
                        content_hash TEXT NOT NULL
                    )",
                    [],
                )?;

                Ok(())
            })
            .await
            .map_err(|e| format!("Failed to initialize codebase schema: {}", e))
    }

    /// Index a single file: read it, extract symbols, and store them in the database.
    pub async fn index_file(&self, file_path: &Path) -> Result<Vec<Symbol>, String> {
        let content = fs::read_to_string(file_path)
            .await
            .map_err(|e| format!("Failed to read file {:?}: {}", file_path, e))?;

        let symbols = extract_symbols(file_path, &content);

        let file_path_str = file_path
            .strip_prefix(&self.workspace_root)
            .map(|rel| rel.to_string_lossy().to_string())
            .unwrap_or_else(|_| file_path.to_string_lossy().to_string());

        let content_hash = hash_content(&content);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("System time error: {}", e))?
            .as_secs();

        // Clone data for the move closure
        let symbols_for_db = symbols.clone();
        let file_path_for_delete = file_path_str.clone();
        let file_path_for_insert = file_path_str.clone();

        self.conn
            .call(move |conn| {
                let _ = conn.execute(
                    "DELETE FROM symbols WHERE file_path = ?1",
                    params![file_path_for_delete],
                )?;

                for symbol in &symbols_for_db {
                    let kind_str = format!("{:?}", symbol.kind).to_lowercase();
                    let _ = conn.execute(
                        "INSERT INTO symbols (name, kind, file_path, line, column, signature, documentation, indexed_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![
                            symbol.name,
                            kind_str,
                            symbol.file_path,
                            symbol.line,
                            symbol.column,
                            symbol.signature,
                            symbol.documentation,
                            now
                        ],
                    )?;
                }

                let _ = conn.execute(
                    "INSERT OR REPLACE INTO files (path, last_indexed, content_hash)
                     VALUES (?1, ?2, ?3)",
                    params![file_path_for_insert, now, content_hash],
                )?;

                Ok(())
            })
            .await
            .map_err(|e| format!("Failed to index file in database: {}", e))?;

        Ok(symbols)
    }

    /// Search symbols by name pattern (LIKE query).
    pub async fn search_symbols(&self, query: &str, limit: usize) -> Result<Vec<Symbol>, String> {
        let query_pattern = format!("%{}%", query);

        self.conn
            .call(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT name, kind, file_path, line, column, signature, documentation
                     FROM symbols
                     WHERE name LIKE ?1
                     ORDER BY name
                     LIMIT ?2",
                )?;

                let symbols = stmt
                    .query_map(params![query_pattern, limit], |row| {
                        Ok(Symbol {
                            name: row.get(0)?,
                            kind: parse_symbol_kind(&row.get::<_, String>(1)?),
                            file_path: row.get(2)?,
                            line: row.get(3)?,
                            column: row.get(4)?,
                            signature: row.get(5)?,
                            documentation: row.get(6)?,
                        })
                    })?
                    .collect::<SqliteResult<Vec<_>>>()?;

                Ok(symbols)
            })
            .await
            .map_err(|e| format!("Failed to search symbols: {}", e))
    }

    /// Get all symbols for a specific file path.
    pub async fn get_file_symbols(&self, file_path: &str) -> Result<Vec<Symbol>, String> {
        let file_path_owned = file_path.to_string();

        self.conn
            .call(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT name, kind, file_path, line, column, signature, documentation
                     FROM symbols
                     WHERE file_path = ?1
                     ORDER BY line",
                )?;

                let symbols = stmt
                    .query_map(params![file_path_owned], |row| {
                        Ok(Symbol {
                            name: row.get(0)?,
                            kind: parse_symbol_kind(&row.get::<_, String>(1)?),
                            file_path: row.get(2)?,
                            line: row.get(3)?,
                            column: row.get(4)?,
                            signature: row.get(5)?,
                            documentation: row.get(6)?,
                        })
                    })?
                    .collect::<SqliteResult<Vec<_>>>()?;

                Ok(symbols)
            })
            .await
            .map_err(|e| format!("Failed to get file symbols: {}", e))
    }

    /// Get index statistics (total symbols and total files).
    pub async fn get_stats(&self) -> Result<IndexStats, String> {
        self.conn
            .call(move |conn| {
                let symbol_count: i64 =
                    conn.query_row("SELECT COUNT(*) FROM symbols", [], |row| row.get(0))?;

                let file_count: i64 =
                    conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))?;

                Ok(IndexStats {
                    total_symbols: symbol_count as usize,
                    total_files: file_count as usize,
                })
            })
            .await
            .map_err(|e| format!("Failed to get index stats: {}", e))
    }
}

// ---------------------------------------------------------------------------
// Pure helper functions (no &self needed, can be used inside move closures)
// ---------------------------------------------------------------------------

fn extract_symbols(file_path: &Path, content: &str) -> Vec<Symbol> {
    let file_path_str = file_path.to_string_lossy().to_string();
    let extension = file_path.extension().and_then(|e| e.to_str());

    match extension {
        Some("ts") | Some("tsx") | Some("js") | Some("jsx") => {
            extract_typescript_symbols(&file_path_str, content)
        }
        Some("rs") => extract_rust_symbols(&file_path_str, content),
        Some("py") => extract_python_symbols(&file_path_str, content),
        Some("go") => extract_go_symbols(&file_path_str, content),
        _ => Vec::new(),
    }
}

fn extract_typescript_symbols(file_path: &str, content: &str) -> Vec<Symbol> {
    let mut symbols = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let line_num = line_num as u32 + 1;

        if let Some(name) = extract_pattern(line, r"function\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Function,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }

        if let Some(name) = extract_pattern(line, r"class\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Class,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }

        if let Some(name) = extract_pattern(line, r"interface\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Interface,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }

        if let Some(name) = extract_pattern(line, r"(?:const|let|var)\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Variable,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }
    }

    symbols
}

fn extract_rust_symbols(file_path: &str, content: &str) -> Vec<Symbol> {
    let mut symbols = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let line_num = line_num as u32 + 1;

        if let Some(name) = extract_pattern(line, r"fn\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Function,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }

        if let Some(name) = extract_pattern(line, r"struct\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Struct,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }

        if let Some(name) = extract_pattern(line, r"enum\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Enum,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }
    }

    symbols
}

fn extract_python_symbols(file_path: &str, content: &str) -> Vec<Symbol> {
    let mut symbols = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let line_num = line_num as u32 + 1;

        if let Some(name) = extract_pattern(line, r"def\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Function,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }

        if let Some(name) = extract_pattern(line, r"class\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Class,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }
    }

    symbols
}

fn extract_go_symbols(file_path: &str, content: &str) -> Vec<Symbol> {
    let mut symbols = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let line_num = line_num as u32 + 1;

        if let Some(name) = extract_pattern(line, r"func\s+(\w+)") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Function,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }

        if let Some(name) = extract_pattern(line, r"type\s+(\w+)\s+struct") {
            symbols.push(Symbol {
                name,
                kind: SymbolKind::Struct,
                file_path: file_path.to_string(),
                line: line_num,
                column: 0,
                signature: Some(line.trim().to_string()),
                documentation: None,
            });
        }
    }

    symbols
}

/// Pre-compiled regex cache to avoid calling Regex::new() on every line.
/// Each pattern is compiled once and reused for all subsequent calls.
fn extract_pattern(line: &str, pattern: &str) -> Option<String> {
    use std::sync::Mutex;

    static REGEX_CACHE: once_cell::sync::Lazy<
        Mutex<std::collections::HashMap<String, regex::Regex>>,
    > = once_cell::sync::Lazy::new(|| Mutex::new(std::collections::HashMap::new()));

    let cache = REGEX_CACHE.lock().ok()?;
    if let Some(re) = cache.get(pattern) {
        return re
            .captures(line)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string());
    }
    drop(cache);

    // Compile and cache the regex
    let re = regex::Regex::new(pattern).ok()?;
    let result = re
        .captures(line)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string());

    if let Ok(mut cache) = REGEX_CACHE.lock() {
        cache.insert(pattern.to_string(), re);
    }

    result
}

fn parse_symbol_kind(kind_str: &str) -> SymbolKind {
    match kind_str {
        "function" => SymbolKind::Function,
        "class" => SymbolKind::Class,
        "interface" => SymbolKind::Interface,
        "struct" => SymbolKind::Struct,
        "enum" => SymbolKind::Enum,
        "variable" => SymbolKind::Variable,
        "constant" => SymbolKind::Constant,
        "method" => SymbolKind::Method,
        "property" => SymbolKind::Property,
        "module" => SymbolKind::Module,
        "import" => SymbolKind::Import,
        _ => SymbolKind::Variable,
    }
}

fn hash_content(content: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}
