use super::*;

/// Maximum number of results to return from code search.
const CODE_SEARCH_MAX_RESULTS: usize = 50;

impl ToolExecutor {
    /// Execute an AST-aware code symbol search using ripgrep with language-specific patterns.
    ///
    /// Builds a regex pattern based on the requested symbol type (function, class, import,
    /// type, variable, or any) and optional language hint. Delegates to ripgrep for fast,
    /// gitignore-aware searching.
    ///
    /// # Parameters
    /// - `query` (required) — The symbol name or pattern to search for.
    /// - `type` (optional) — Symbol type filter: "function", "class", "import", "type",
    ///   "variable", or "any" (default: "any").
    /// - `language` (optional) — Language hint for pattern specialization (e.g. "rust", "typescript").
    /// - `root` (optional) — Root directory to search in. Falls back to project folder or cwd.
    pub(crate) async fn execute_code_search_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'query' parameter"))?;

        let symbol_type = args
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("any");

        let language = args.get("language").and_then(|v| v.as_str());

        let raw_root = args
            .get("root")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| self.project_folder.clone());

        let root = match raw_root {
            Some(r) => self.resolve_path(&r),
            None => std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string()),
        };

        let pattern = build_search_pattern(query, symbol_type, language);

        let mut cmd = Command::new("rg");
        cmd.arg("--json")
            .arg("--max-count")
            .arg(CODE_SEARCH_MAX_RESULTS.to_string())
            .arg("--no-heading")
            .arg(&pattern)
            .arg(&root);

        // Add language type filter if specified
        if let Some(lang) = language {
            if let Some(rg_type) = map_language_to_rg_type(lang) {
                cmd.arg("--type").arg(rg_type);
            }
        }

        let output = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| anyhow!("Failed to run ripgrep: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut results = Vec::new();

        for line in stdout.lines() {
            if results.len() >= CODE_SEARCH_MAX_RESULTS {
                break;
            }

            let parsed = match serde_json::from_str::<Value>(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if parsed.get("type").and_then(|t| t.as_str()) != Some("match") {
                continue;
            }

            if let Some(data) = parsed.get("data") {
                let path = data
                    .get("path")
                    .and_then(|p| p.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                let line_num = data
                    .get("line_number")
                    .and_then(|n| n.as_u64())
                    .unwrap_or(0);
                let text = data
                    .get("lines")
                    .and_then(|l| l.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");

                results.push(json!({
                    "path": path,
                    "line": line_num,
                    "text": text.trim(),
                }));
            }
        }

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "query": query,
                "type": symbol_type,
                "count": results.len(),
                "results": results,
            }),
            error: None,
            metadata: HashMap::from([
                ("query".to_string(), json!(query)),
                ("type".to_string(), json!(symbol_type)),
                ("root".to_string(), json!(&root)),
            ]),
        })
    }
}

/// Build a regex search pattern specialized for a given symbol type and language.
///
/// Uses `regex::escape` for the query to prevent regex injection, then wraps it
/// in language-specific structural patterns (e.g. `fn <query>` for Rust functions).
fn build_search_pattern(query: &str, symbol_type: &str, language: Option<&str>) -> String {
    let escaped = regex::escape(query);

    match (symbol_type, language) {
        // ── Function definitions ──────────────────────────────────────────
        ("function", Some("rust" | "rs")) => {
            format!(r"(pub\s+)?(async\s+)?fn\s+{}", escaped)
        }
        ("function", Some("typescript" | "javascript" | "ts" | "js" | "tsx" | "jsx")) => {
            format!(
                r"(export\s+)?(async\s+)?function\s+{}|const\s+{}\s*=\s*(async\s+)?\(",
                escaped, escaped
            )
        }
        ("function", Some("python" | "py")) => format!(r"def\s+{}", escaped),
        ("function", Some("go")) => format!(r"func\s+(\(.*?\)\s+)?{}", escaped),
        ("function", _) => format!(r"(function|fn|def|func)\s+{}", escaped),

        // ── Class / struct / impl definitions ─────────────────────────────
        ("class", Some("rust" | "rs")) => {
            format!(r"(pub\s+)?struct\s+{}|impl\s+{}", escaped, escaped)
        }
        ("class", Some("python" | "py")) => format!(r"class\s+{}", escaped),
        ("class", _) => format!(r"(class|struct|interface|enum)\s+{}", escaped),

        // ── Import / use statements ───────────────────────────────────────
        ("import", _) => format!(r"(import|use|require|from)\s+.*{}", escaped),

        // ── Type definitions ──────────────────────────────────────────────
        ("type", _) => format!(r"(type|interface|struct|enum)\s+{}", escaped),

        // ── Variable declarations ─────────────────────────────────────────
        ("variable", _) => {
            format!(
                r"(let|const|var|static|pub\s+static)\s+(mut\s+)?{}",
                escaped
            )
        }

        // ── "any" or unknown — literal search ─────────────────────────────
        _ => escaped,
    }
}

/// Map a human-readable language name to a ripgrep `--type` value.
fn map_language_to_rg_type(lang: &str) -> Option<&'static str> {
    match lang {
        "rust" | "rs" => Some("rust"),
        "typescript" | "ts" | "tsx" => Some("ts"),
        "javascript" | "js" | "jsx" => Some("js"),
        "python" | "py" => Some("py"),
        "go" => Some("go"),
        "java" => Some("java"),
        "cpp" | "c++" => Some("cpp"),
        "c" => Some("c"),
        "ruby" | "rb" => Some("ruby"),
        "swift" => Some("swift"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_pattern_rust_function() {
        let pat = build_search_pattern("execute", "function", Some("rust"));
        assert!(pat.contains("fn\\s+execute"));
    }

    #[test]
    fn test_build_pattern_typescript_function() {
        let pat = build_search_pattern("handleClick", "function", Some("typescript"));
        assert!(pat.contains("function\\s+handleClick"));
        assert!(pat.contains("const\\s+handleClick"));
    }

    #[test]
    fn test_build_pattern_python_function() {
        let pat = build_search_pattern("process", "function", Some("python"));
        assert!(pat.contains("def\\s+process"));
    }

    #[test]
    fn test_build_pattern_class_rust() {
        let pat = build_search_pattern("AppState", "class", Some("rust"));
        assert!(pat.contains("struct\\s+AppState"));
        assert!(pat.contains("impl\\s+AppState"));
    }

    #[test]
    fn test_build_pattern_any_type_returns_escaped() {
        let pat = build_search_pattern("my.func", "any", None);
        // Dot should be escaped
        assert!(pat.contains(r"my\.func"));
    }

    #[test]
    fn test_build_pattern_import() {
        let pat = build_search_pattern("serde", "import", None);
        assert!(pat.contains("(import|use|require|from)"));
        assert!(pat.contains("serde"));
    }

    #[test]
    fn test_build_pattern_variable() {
        let pat = build_search_pattern("counter", "variable", None);
        assert!(pat.contains("(let|const|var|static|pub\\s+static)"));
        assert!(pat.contains("counter"));
    }

    #[test]
    fn test_map_language_to_rg_type_known() {
        assert_eq!(map_language_to_rg_type("rust"), Some("rust"));
        assert_eq!(map_language_to_rg_type("ts"), Some("ts"));
        assert_eq!(map_language_to_rg_type("python"), Some("py"));
        assert_eq!(map_language_to_rg_type("go"), Some("go"));
    }

    #[test]
    fn test_map_language_to_rg_type_unknown() {
        assert_eq!(map_language_to_rg_type("brainfuck"), None);
    }

    #[test]
    fn test_build_pattern_go_function() {
        let pat = build_search_pattern("main", "function", Some("go"));
        assert!(pat.contains("func"));
        assert!(pat.contains("main"));
    }

    #[test]
    fn test_build_pattern_class_generic() {
        let pat = build_search_pattern("Widget", "class", None);
        assert!(pat.contains("(class|struct|interface|enum)"));
        assert!(pat.contains("Widget"));
    }

    #[test]
    fn test_build_pattern_type() {
        let pat = build_search_pattern("Config", "type", None);
        assert!(pat.contains("(type|interface|struct|enum)"));
        assert!(pat.contains("Config"));
    }

    #[test]
    fn test_regex_escape_special_chars() {
        // regex::escape does NOT escape colons (not a regex metacharacter)
        let pat = build_search_pattern("std::io::Result", "any", None);
        assert!(pat.contains("std::io::Result"));
        // But it does escape actual metacharacters
        let pat2 = build_search_pattern("foo.bar()", "any", None);
        assert!(pat2.contains(r"foo\.bar\(\)"));
    }
}
