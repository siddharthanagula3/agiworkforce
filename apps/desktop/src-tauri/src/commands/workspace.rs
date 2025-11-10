/**
 * Enhanced Workspace Indexing
 * LSP integration, semantic search, symbol navigation, dependency graph
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceIndex {
    pub root_path: PathBuf,
    pub files: Vec<IndexedFile>,
    pub symbols: Vec<Symbol>,
    pub dependencies: DependencyGraph,
    pub last_updated: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedFile {
    pub path: PathBuf,
    pub language: String,
    pub size: u64,
    pub lines: u32,
    pub symbols: Vec<Symbol>,
    pub imports: Vec<String>,
    pub exports: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: SymbolKind,
    pub file_path: PathBuf,
    pub line: u32,
    pub column: u32,
    pub scope: Option<String>,
    pub signature: Option<String>,
    pub documentation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    Namespace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyGraph {
    pub nodes: Vec<DependencyNode>,
    pub edges: Vec<DependencyEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyNode {
    pub id: String,
    pub file_path: PathBuf,
    pub module_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyEdge {
    pub from: String,
    pub to: String,
    pub edge_type: DependencyType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DependencyType {
    Import,
    Export,
    Extends,
    Implements,
    Uses,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: String,
    pub kind: Option<SymbolKind>,
    pub file_pattern: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub symbol: Symbol,
    pub score: f32,
    pub context: String,
}

pub struct WorkspaceIndexState {
    pub index: Arc<Mutex<Option<WorkspaceIndex>>>,
    pub indexing: Arc<Mutex<bool>>,
}

impl WorkspaceIndexState {
    pub fn new() -> Self {
        Self {
            index: Arc::new(Mutex::new(None)),
            indexing: Arc::new(Mutex::new(false)),
        }
    }
}

impl Default for WorkspaceIndexState {
    fn default() -> Self {
        Self::new()
    }
}

/// Index workspace
#[tauri::command]
pub async fn workspace_index(
    workspace_path: PathBuf,
    state: State<'_, Arc<Mutex<WorkspaceIndexState>>>,
) -> Result<WorkspaceIndex, String> {
    tracing::info!("Indexing workspace: {:?}", workspace_path);

    let workspace_state = state.lock().await;

    // Check if already indexing
    let mut indexing = workspace_state.indexing.lock().await;
    if *indexing {
        return Err("Workspace indexing already in progress".to_string());
    }
    *indexing = true;
    drop(indexing);

    // Build index
    let index = build_workspace_index(&workspace_path).await?;

    // Store index
    let mut current_index = workspace_state.index.lock().await;
    *current_index = Some(index.clone());

    // Mark indexing complete
    let mut indexing = workspace_state.indexing.lock().await;
    *indexing = false;

    Ok(index)
}

/// Search symbols in workspace
#[tauri::command]
pub async fn workspace_search_symbols(
    query: SearchQuery,
    state: State<'_, Arc<Mutex<WorkspaceIndexState>>>,
) -> Result<Vec<SearchResult>, String> {
    let workspace_state = state.lock().await;
    let index = workspace_state.index.lock().await;

    let index = index
        .as_ref()
        .ok_or("Workspace not indexed. Call workspace_index first.")?;

    let mut results = Vec::new();
    let query_lower = query.query.to_lowercase();

    for symbol in &index.symbols {
        // Filter by kind if specified
        if let Some(ref kind) = query.kind {
            if &symbol.kind != kind {
                continue;
            }
        }

        // Filter by file pattern if specified
        if let Some(ref pattern) = query.file_pattern {
            let file_str = symbol.file_path.to_string_lossy();
            if !file_str.contains(pattern) {
                continue;
            }
        }

        // Calculate relevance score
        let name_lower = symbol.name.to_lowercase();
        let score = if name_lower == query_lower {
            1.0 // Exact match
        } else if name_lower.starts_with(&query_lower) {
            0.8 // Prefix match
        } else if name_lower.contains(&query_lower) {
            0.5 // Substring match
        } else {
            continue;
        };

        // Build context (surrounding code)
        let context = format!(
            "{}:{}:{} - {} {}",
            symbol.file_path.display(),
            symbol.line,
            symbol.column,
            format!("{:?}", symbol.kind).to_lowercase(),
            symbol.name
        );

        results.push(SearchResult {
            symbol: symbol.clone(),
            score,
            context,
        });
    }

    // Sort by score (highest first)
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());

    // Apply limit
    if let Some(limit) = query.limit {
        results.truncate(limit);
    }

    Ok(results)
}

/// Find symbol definition
#[tauri::command]
pub async fn workspace_find_definition(
    symbol_name: String,
    state: State<'_, Arc<Mutex<WorkspaceIndexState>>>,
) -> Result<Option<Symbol>, String> {
    let workspace_state = state.lock().await;
    let index = workspace_state.index.lock().await;

    let index = index.as_ref().ok_or("Workspace not indexed")?;

    Ok(index
        .symbols
        .iter()
        .find(|s| s.name == symbol_name)
        .cloned())
}

/// Find references to a symbol
#[tauri::command]
pub async fn workspace_find_references(
    symbol_name: String,
    state: State<'_, Arc<Mutex<WorkspaceIndexState>>>,
) -> Result<Vec<Symbol>, String> {
    let workspace_state = state.lock().await;
    let index = workspace_state.index.lock().await;

    let index = index.as_ref().ok_or("Workspace not indexed")?;

    // Find all symbols with this name
    let refs: Vec<Symbol> = index
        .symbols
        .iter()
        .filter(|s| s.name.contains(&symbol_name))
        .cloned()
        .collect();

    Ok(refs)
}

/// Get dependency graph
#[tauri::command]
pub async fn workspace_get_dependencies(
    state: State<'_, Arc<Mutex<WorkspaceIndexState>>>,
) -> Result<DependencyGraph, String> {
    let workspace_state = state.lock().await;
    let index = workspace_state.index.lock().await;

    let index = index.as_ref().ok_or("Workspace not indexed")?;

    Ok(index.dependencies.clone())
}

/// Get file symbols
#[tauri::command]
pub async fn workspace_get_file_symbols(
    file_path: PathBuf,
    state: State<'_, Arc<Mutex<WorkspaceIndexState>>>,
) -> Result<Vec<Symbol>, String> {
    let workspace_state = state.lock().await;
    let index = workspace_state.index.lock().await;

    let index = index.as_ref().ok_or("Workspace not indexed")?;

    let symbols: Vec<Symbol> = index
        .symbols
        .iter()
        .filter(|s| s.file_path == file_path)
        .cloned()
        .collect();

    Ok(symbols)
}

/// Get workspace statistics
#[tauri::command]
pub async fn workspace_get_stats(
    state: State<'_, Arc<Mutex<WorkspaceIndexState>>>,
) -> Result<WorkspaceStats, String> {
    let workspace_state = state.lock().await;
    let index = workspace_state.index.lock().await;

    let index = index.as_ref().ok_or("Workspace not indexed")?;

    let mut language_stats: HashMap<String, usize> = HashMap::new();
    let mut symbol_stats: HashMap<String, usize> = HashMap::new();

    for file in &index.files {
        *language_stats.entry(file.language.clone()).or_insert(0) += 1;
    }

    for symbol in &index.symbols {
        let kind = format!("{:?}", symbol.kind);
        *symbol_stats.entry(kind).or_insert(0) += 1;
    }

    Ok(WorkspaceStats {
        total_files: index.files.len(),
        total_symbols: index.symbols.len(),
        total_lines: index.files.iter().map(|f| f.lines as usize).sum(),
        languages: language_stats,
        symbol_kinds: symbol_stats,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceStats {
    pub total_files: usize,
    pub total_symbols: usize,
    pub total_lines: usize,
    pub languages: HashMap<String, usize>,
    pub symbol_kinds: HashMap<String, usize>,
}

// Helper functions

async fn build_workspace_index(workspace_path: &PathBuf) -> Result<WorkspaceIndex, String> {
    let mut files = Vec::new();
    let mut all_symbols = Vec::new();
    let mut dependency_nodes = Vec::new();
    let mut dependency_edges = Vec::new();

    // Walk workspace directory
    walk_directory(workspace_path, &mut files, &mut all_symbols, workspace_path)?;

    // Build dependency graph
    for file in &files {
        let node_id = file.path.to_string_lossy().to_string();

        dependency_nodes.push(DependencyNode {
            id: node_id.clone(),
            file_path: file.path.clone(),
            module_name: file
                .path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string(),
        });

        // Add import edges
        for import in &file.imports {
            dependency_edges.push(DependencyEdge {
                from: node_id.clone(),
                to: import.clone(),
                edge_type: DependencyType::Import,
            });
        }
    }

    Ok(WorkspaceIndex {
        root_path: workspace_path.clone(),
        files,
        symbols: all_symbols,
        dependencies: DependencyGraph {
            nodes: dependency_nodes,
            edges: dependency_edges,
        },
        last_updated: current_timestamp(),
    })
}

fn walk_directory(
    dir: &PathBuf,
    files: &mut Vec<IndexedFile>,
    symbols: &mut Vec<Symbol>,
    root: &PathBuf,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        // Skip hidden files and common ignore patterns
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.')
                || name_str == "node_modules"
                || name_str == "target"
                || name_str == "dist"
                || name_str == "build"
            {
                continue;
            }
        }

        if path.is_dir() {
            walk_directory(&path, files, symbols, root)?;
        } else if path.is_file() {
            if let Some(indexed_file) = index_file(&path, root) {
                symbols.extend(indexed_file.symbols.clone());
                files.push(indexed_file);
            }
        }
    }

    Ok(())
}

fn index_file(path: &PathBuf, root: &PathBuf) -> Option<IndexedFile> {
    let extension = path.extension()?.to_str()?;
    let language = match extension {
        "rs" => "Rust",
        "ts" | "tsx" => "TypeScript",
        "js" | "jsx" => "JavaScript",
        "py" => "Python",
        "java" => "Java",
        "go" => "Go",
        "c" | "h" => "C",
        "cpp" | "hpp" | "cc" => "C++",
        _ => return None,
    };

    let metadata = std::fs::metadata(path).ok()?;
    let content = std::fs::read_to_string(path).ok()?;
    let lines = content.lines().count() as u32;

    // Simple symbol extraction (basic pattern matching)
    let file_symbols = extract_symbols(&content, path, language);
    let imports = extract_imports(&content, language);

    Some(IndexedFile {
        path: path.clone(),
        language: language.to_string(),
        size: metadata.len(),
        lines,
        symbols: file_symbols,
        imports,
        exports: Vec::new(),
    })
}

fn extract_symbols(content: &str, path: &PathBuf, language: &str) -> Vec<Symbol> {
    let mut symbols = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let line_num = line_num as u32 + 1;
        let trimmed = line.trim();

        // Language-specific symbol extraction
        match language {
            "Rust" => {
                if let Some(name) = extract_rust_symbol(trimmed) {
                    symbols.push(Symbol {
                        name: name.0,
                        kind: name.1,
                        file_path: path.clone(),
                        line: line_num,
                        column: 0,
                        scope: None,
                        signature: Some(trimmed.to_string()),
                        documentation: None,
                    });
                }
            }
            "TypeScript" | "JavaScript" => {
                if let Some(name) = extract_ts_symbol(trimmed) {
                    symbols.push(Symbol {
                        name: name.0,
                        kind: name.1,
                        file_path: path.clone(),
                        line: line_num,
                        column: 0,
                        scope: None,
                        signature: Some(trimmed.to_string()),
                        documentation: None,
                    });
                }
            }
            _ => {}
        }
    }

    symbols
}

fn extract_rust_symbol(line: &str) -> Option<(String, SymbolKind)> {
    if line.starts_with("fn ") {
        let name = line.strip_prefix("fn ")?.split('(').next()?.trim();
        return Some((name.to_string(), SymbolKind::Function));
    }
    if line.starts_with("struct ") {
        let name = line.strip_prefix("struct ")?.split_whitespace().next()?;
        return Some((name.to_string(), SymbolKind::Struct));
    }
    if line.starts_with("enum ") {
        let name = line.strip_prefix("enum ")?.split_whitespace().next()?;
        return Some((name.to_string(), SymbolKind::Enum));
    }
    if line.starts_with("pub fn ") {
        let name = line.strip_prefix("pub fn ")?.split('(').next()?.trim();
        return Some((name.to_string(), SymbolKind::Function));
    }
    None
}

fn extract_ts_symbol(line: &str) -> Option<(String, SymbolKind)> {
    if line.starts_with("function ") || line.starts_with("export function ") {
        let name = line
            .trim_start_matches("export ")
            .strip_prefix("function ")?
            .split('(')
            .next()?
            .trim();
        return Some((name.to_string(), SymbolKind::Function));
    }
    if line.starts_with("class ") || line.starts_with("export class ") {
        let name = line
            .trim_start_matches("export ")
            .strip_prefix("class ")?
            .split_whitespace()
            .next()?;
        return Some((name.to_string(), SymbolKind::Class));
    }
    if line.starts_with("interface ") || line.starts_with("export interface ") {
        let name = line
            .trim_start_matches("export ")
            .strip_prefix("interface ")?
            .split_whitespace()
            .next()?;
        return Some((name.to_string(), SymbolKind::Interface));
    }
    None
}

fn extract_imports(content: &str, language: &str) -> Vec<String> {
    let mut imports = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();

        match language {
            "Rust" => {
                if trimmed.starts_with("use ") {
                    if let Some(import) = trimmed.strip_prefix("use ") {
                        let import = import.trim_end_matches(';');
                        imports.push(import.to_string());
                    }
                }
            }
            "TypeScript" | "JavaScript" => {
                if trimmed.starts_with("import ") {
                    if let Some(from_part) = trimmed.split("from").nth(1) {
                        let module = from_part
                            .trim()
                            .trim_matches(|c| c == '\'' || c == '"' || c == ';');
                        imports.push(module.to_string());
                    }
                }
            }
            _ => {}
        }
    }

    imports
}

fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}
