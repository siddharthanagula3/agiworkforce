/**
 * Codebase Indexer
 * Fast AST-based indexing of workspace files for semantic search
 */
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

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

pub struct CodebaseIndexer {
    db: Connection,
    workspace_root: PathBuf,
}

impl CodebaseIndexer {
    /// Create a new indexer
    pub fn new(workspace_root: PathBuf) -> Result<Self> {
        let db_path = workspace_root.join(".agi").join("codebase.db");
        std::fs::create_dir_all(db_path.parent().unwrap())?;

        let db = Connection::open(db_path)?;
        let indexer = Self { db, workspace_root };

        indexer.init_schema()?;
        Ok(indexer)
    }

    /// Initialize database schema
    fn init_schema(&self) -> Result<()> {
        self.db.execute(
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

        self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)",
            [],
        )?;

        self.db.execute(
            "CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path)",
            [],
        )?;

        self.db.execute(
            "CREATE TABLE IF NOT EXISTS files (
                path TEXT PRIMARY KEY,
                last_indexed INTEGER NOT NULL,
                content_hash TEXT NOT NULL
            )",
            [],
        )?;

        Ok(())
    }

    /// Index a single file
    pub async fn index_file(&self, file_path: &Path) -> Result<Vec<Symbol>> {
        let content = fs::read_to_string(file_path)
            .await
            .context("Failed to read file")?;

        let symbols = self.extract_symbols(file_path, &content)?;

        // Store in database
        let file_path_str = file_path.to_string_lossy().to_string();
        let content_hash = self.hash_content(&content);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();

        // Clear existing symbols for this file
        self.db.execute(
            "DELETE FROM symbols WHERE file_path = ?1",
            params![file_path_str],
        )?;

        // Insert new symbols
        for symbol in &symbols {
            self.db.execute(
                "INSERT INTO symbols (name, kind, file_path, line, column, signature, documentation, indexed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    symbol.name,
                    format!("{:?}", symbol.kind).to_lowercase(),
                    symbol.file_path,
                    symbol.line,
                    symbol.column,
                    symbol.signature,
                    symbol.documentation,
                    now
                ],
            )?;
        }

        // Update file index
        self.db.execute(
            "INSERT OR REPLACE INTO files (path, last_indexed, content_hash)
             VALUES (?1, ?2, ?3)",
            params![file_path_str, now, content_hash],
        )?;

        Ok(symbols)
    }

    /// Extract symbols from file content using regex patterns
    /// TODO: Replace with tree-sitter for accurate AST parsing
    fn extract_symbols(&self, file_path: &Path, content: &str) -> Result<Vec<Symbol>> {
        let mut symbols = Vec::new();
        let file_path_str = file_path.to_string_lossy().to_string();

        let extension = file_path.extension().and_then(|e| e.to_str());

        match extension {
            Some("ts") | Some("tsx") | Some("js") | Some("jsx") => {
                symbols.extend(self.extract_typescript_symbols(&file_path_str, content));
            }
            Some("rs") => {
                symbols.extend(self.extract_rust_symbols(&file_path_str, content));
            }
            Some("py") => {
                symbols.extend(self.extract_python_symbols(&file_path_str, content));
            }
            Some("go") => {
                symbols.extend(self.extract_go_symbols(&file_path_str, content));
            }
            _ => {}
        }

        Ok(symbols)
    }

    /// Extract TypeScript/JavaScript symbols
    fn extract_typescript_symbols(&self, file_path: &str, content: &str) -> Vec<Symbol> {
        let mut symbols = Vec::new();

        for (line_num, line) in content.lines().enumerate() {
            let line_num = line_num as u32 + 1;

            // Function declarations
            if let Some(name) = self.extract_pattern(line, r"function\s+(\w+)") {
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

            // Class declarations
            if let Some(name) = self.extract_pattern(line, r"class\s+(\w+)") {
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

            // Interface declarations
            if let Some(name) = self.extract_pattern(line, r"interface\s+(\w+)") {
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

            // Const/let declarations
            if let Some(name) = self.extract_pattern(line, r"(?:const|let|var)\s+(\w+)") {
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

    /// Extract Rust symbols
    fn extract_rust_symbols(&self, file_path: &str, content: &str) -> Vec<Symbol> {
        let mut symbols = Vec::new();

        for (line_num, line) in content.lines().enumerate() {
            let line_num = line_num as u32 + 1;

            // Function declarations
            if let Some(name) = self.extract_pattern(line, r"fn\s+(\w+)") {
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

            // Struct declarations
            if let Some(name) = self.extract_pattern(line, r"struct\s+(\w+)") {
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

            // Enum declarations
            if let Some(name) = self.extract_pattern(line, r"enum\s+(\w+)") {
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

    /// Extract Python symbols
    fn extract_python_symbols(&self, file_path: &str, content: &str) -> Vec<Symbol> {
        let mut symbols = Vec::new();

        for (line_num, line) in content.lines().enumerate() {
            let line_num = line_num as u32 + 1;

            // Function/method declarations
            if let Some(name) = self.extract_pattern(line, r"def\s+(\w+)") {
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

            // Class declarations
            if let Some(name) = self.extract_pattern(line, r"class\s+(\w+)") {
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

    /// Extract Go symbols
    fn extract_go_symbols(&self, file_path: &str, content: &str) -> Vec<Symbol> {
        let mut symbols = Vec::new();

        for (line_num, line) in content.lines().enumerate() {
            let line_num = line_num as u32 + 1;

            // Function declarations
            if let Some(name) = self.extract_pattern(line, r"func\s+(\w+)") {
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

            // Type declarations
            if let Some(name) = self.extract_pattern(line, r"type\s+(\w+)\s+struct") {
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

    /// Helper: Extract pattern from line
    fn extract_pattern(&self, line: &str, pattern: &str) -> Option<String> {
        let re = regex::Regex::new(pattern).ok()?;
        re.captures(line)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
    }

    /// Hash file content
    fn hash_content(&self, content: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Search symbols by name (fuzzy)
    pub fn search_symbols(&self, query: &str, limit: usize) -> Result<Vec<Symbol>> {
        let mut stmt = self.db.prepare(
            "SELECT name, kind, file_path, line, column, signature, documentation
             FROM symbols
             WHERE name LIKE ?1
             ORDER BY name
             LIMIT ?2",
        )?;

        let query_pattern = format!("%{}%", query);
        let symbols = stmt
            .query_map(params![query_pattern, limit], |row| {
                Ok(Symbol {
                    name: row.get(0)?,
                    kind: self.parse_symbol_kind(&row.get::<_, String>(1)?),
                    file_path: row.get(2)?,
                    line: row.get(3)?,
                    column: row.get(4)?,
                    signature: row.get(5)?,
                    documentation: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(symbols)
    }

    /// Parse symbol kind from string
    fn parse_symbol_kind(&self, kind_str: &str) -> SymbolKind {
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

    /// Get symbols in file
    pub fn get_file_symbols(&self, file_path: &str) -> Result<Vec<Symbol>> {
        let mut stmt = self.db.prepare(
            "SELECT name, kind, file_path, line, column, signature, documentation
             FROM symbols
             WHERE file_path = ?1
             ORDER BY line",
        )?;

        let symbols = stmt
            .query_map(params![file_path], |row| {
                Ok(Symbol {
                    name: row.get(0)?,
                    kind: self.parse_symbol_kind(&row.get::<_, String>(1)?),
                    file_path: row.get(2)?,
                    line: row.get(3)?,
                    column: row.get(4)?,
                    signature: row.get(5)?,
                    documentation: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(symbols)
    }

    /// Get indexing statistics
    pub fn get_stats(&self) -> Result<IndexStats> {
        let symbol_count: i64 = self
            .db
            .query_row("SELECT COUNT(*) FROM symbols", [], |row| row.get(0))?;

        let file_count: i64 = self
            .db
            .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))?;

        Ok(IndexStats {
            total_symbols: symbol_count as usize,
            total_files: file_count as usize,
        })
    }
}

#[derive(Debug, Serialize)]
pub struct IndexStats {
    pub total_symbols: usize,
    pub total_files: usize,
}
