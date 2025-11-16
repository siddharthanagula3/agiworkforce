/**
 * Code Chunker
 * Intelligent chunking of code files for embedding generation
 */
use anyhow::Result;
use regex::Regex;
use std::path::Path;

/// Chunking strategy
#[derive(Debug, Clone)]
pub enum ChunkStrategy {
    /// Fixed-size chunks (simple but not semantic-aware)
    Fixed { size: usize, overlap: usize },
    /// Semantic chunks (functions, classes, modules)
    Semantic,
    /// Hybrid: semantic with fixed-size fallback
    Hybrid { max_size: usize },
}

/// Code chunk
#[derive(Debug, Clone)]
pub struct CodeChunk {
    pub file_path: String,
    pub index: usize,
    pub content: String,
    pub language: String,
    pub start_line: u32,
    pub end_line: u32,
    pub chunk_type: ChunkType,
}

#[derive(Debug, Clone, Copy)]
pub enum ChunkType {
    Function,
    Class,
    Module,
    Block,
    Full,
}

/// Code chunker
pub struct CodeChunker {
    strategy: ChunkStrategy,
}

impl CodeChunker {
    /// Create a new chunker
    pub fn new(strategy: ChunkStrategy) -> Self {
        Self { strategy }
    }

    /// Chunk a file
    pub fn chunk_file(&self, file_path: &str, content: &str) -> Result<Vec<CodeChunk>> {
        let language = detect_language(file_path);

        match &self.strategy {
            ChunkStrategy::Fixed { size, overlap } => {
                self.chunk_fixed(file_path, content, &language, *size, *overlap)
            }
            ChunkStrategy::Semantic => self.chunk_semantic(file_path, content, &language),
            ChunkStrategy::Hybrid { max_size } => {
                self.chunk_hybrid(file_path, content, &language, *max_size)
            }
        }
    }

    /// Fixed-size chunking
    fn chunk_fixed(
        &self,
        file_path: &str,
        content: &str,
        language: &str,
        size: usize,
        overlap: usize,
    ) -> Result<Vec<CodeChunk>> {
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        let mut index = 0;
        let mut start = 0;

        while start < lines.len() {
            let end = (start + size).min(lines.len());
            let chunk_lines = &lines[start..end];
            let chunk_content = chunk_lines.join("\n");

            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index,
                content: chunk_content,
                language: language.to_string(),
                start_line: (start + 1) as u32,
                end_line: end as u32,
                chunk_type: ChunkType::Block,
            });

            index += 1;
            start += size.saturating_sub(overlap);

            if start >= lines.len() {
                break;
            }
        }

        Ok(chunks)
    }

    /// Semantic chunking (functions, classes, etc.)
    fn chunk_semantic(
        &self,
        file_path: &str,
        content: &str,
        language: &str,
    ) -> Result<Vec<CodeChunk>> {
        let chunks = match language {
            "typescript" | "javascript" | "tsx" | "jsx" => {
                self.chunk_typescript(file_path, content, language)
            }
            "rust" => self.chunk_rust(file_path, content, language),
            "python" => self.chunk_python(file_path, content, language),
            "go" => self.chunk_go(file_path, content, language),
            _ => {
                // Fallback to fixed-size for unknown languages
                self.chunk_fixed(file_path, content, language, 50, 10)?
            }
        };

        Ok(chunks)
    }

    /// Hybrid chunking
    fn chunk_hybrid(
        &self,
        file_path: &str,
        content: &str,
        language: &str,
        max_size: usize,
    ) -> Result<Vec<CodeChunk>> {
        let semantic_chunks = self.chunk_semantic(file_path, content, language)?;

        // Split large semantic chunks
        let mut final_chunks = Vec::new();

        for chunk in semantic_chunks {
            let line_count = chunk.content.lines().count();

            if line_count <= max_size {
                final_chunks.push(chunk);
            } else {
                // Split large chunk into fixed-size pieces
                let sub_chunks =
                    self.chunk_fixed(file_path, &chunk.content, language, max_size, 10)?;
                final_chunks.extend(sub_chunks);
            }
        }

        Ok(final_chunks)
    }

    /// Chunk TypeScript/JavaScript
    fn chunk_typescript(&self, file_path: &str, content: &str, language: &str) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        // Regex patterns for TypeScript/JavaScript
        let function_re = Regex::new(r"^\s*(?:export\s+)?(?:async\s+)?function\s+\w+").unwrap();
        let class_re = Regex::new(r"^\s*(?:export\s+)?class\s+\w+").unwrap();
        let const_fn_re =
            Regex::new(r"^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(").unwrap();
        let arrow_fn_re =
            Regex::new(r"^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?.*=>").unwrap();

        let mut current_chunk: Option<(usize, Vec<&str>, ChunkType)> = None;
        let mut brace_depth = 0;

        for (line_idx, line) in lines.iter().enumerate() {
            // Detect function/class starts
            if current_chunk.is_none() {
                if function_re.is_match(line)
                    || const_fn_re.is_match(line)
                    || arrow_fn_re.is_match(line)
                {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Function));
                    brace_depth = count_braces(line);
                    continue;
                } else if class_re.is_match(line) {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Class));
                    brace_depth = count_braces(line);
                    continue;
                }
            }

            // Add lines to current chunk
            if let Some((start_idx, ref mut chunk_lines, chunk_type)) = current_chunk {
                chunk_lines.push(*line);
                brace_depth += count_braces(line);

                // Check if chunk is complete
                if brace_depth == 0 && chunk_lines.len() > 1 {
                    chunks.push(CodeChunk {
                        file_path: file_path.to_string(),
                        index: chunks.len(),
                        content: chunk_lines.join("\n"),
                        language: language.to_string(),
                        start_line: (start_idx + 1) as u32,
                        end_line: (line_idx + 1) as u32,
                        chunk_type,
                    });

                    current_chunk = None;
                    brace_depth = 0;
                }
            }
        }

        // Add any remaining chunk
        if let Some((start_idx, chunk_lines, chunk_type)) = current_chunk {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: chunks.len(),
                content: chunk_lines.join("\n"),
                language: language.to_string(),
                start_line: (start_idx + 1) as u32,
                end_line: lines.len() as u32,
                chunk_type,
            });
        }

        // If no chunks found, return entire file as one chunk
        if chunks.is_empty() {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: 0,
                content: content.to_string(),
                language: language.to_string(),
                start_line: 1,
                end_line: lines.len() as u32,
                chunk_type: ChunkType::Full,
            });
        }

        chunks
    }

    /// Chunk Rust
    fn chunk_rust(&self, file_path: &str, content: &str, language: &str) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        let fn_re = Regex::new(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+\w+").unwrap();
        let struct_re = Regex::new(r"^\s*(?:pub\s+)?struct\s+\w+").unwrap();
        let impl_re = Regex::new(r"^\s*impl(?:<[^>]+>)?\s+\w+").unwrap();

        let mut current_chunk: Option<(usize, Vec<&str>, ChunkType)> = None;
        let mut brace_depth = 0;

        for (line_idx, line) in lines.iter().enumerate() {
            if current_chunk.is_none() {
                if fn_re.is_match(line) {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Function));
                    brace_depth = count_braces(line);
                    continue;
                } else if struct_re.is_match(line) {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Class));
                    brace_depth = count_braces(line);
                    continue;
                } else if impl_re.is_match(line) {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Module));
                    brace_depth = count_braces(line);
                    continue;
                }
            }

            if let Some((start_idx, ref mut chunk_lines, ref chunk_type)) = current_chunk {
                chunk_lines.push(*line);
                brace_depth += count_braces(line);

                if brace_depth == 0 && chunk_lines.len() > 1 {
                    chunks.push(CodeChunk {
                        file_path: file_path.to_string(),
                        index: chunks.len(),
                        content: chunk_lines.join("\n"),
                        language: language.to_string(),
                        start_line: (start_idx + 1) as u32,
                        end_line: (line_idx + 1) as u32,
                        chunk_type: *chunk_type,
                    });

                    current_chunk = None;
                    brace_depth = 0;
                }
            }
        }

        if let Some((start_idx, chunk_lines, chunk_type)) = current_chunk {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: chunks.len(),
                content: chunk_lines.join("\n"),
                language: language.to_string(),
                start_line: (start_idx + 1) as u32,
                end_line: lines.len() as u32,
                chunk_type,
            });
        }

        if chunks.is_empty() {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: 0,
                content: content.to_string(),
                language: language.to_string(),
                start_line: 1,
                end_line: lines.len() as u32,
                chunk_type: ChunkType::Full,
            });
        }

        chunks
    }

    /// Chunk Python
    fn chunk_python(&self, file_path: &str, content: &str, language: &str) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        let def_re = Regex::new(r"^\s*def\s+\w+").unwrap();
        let class_re = Regex::new(r"^\s*class\s+\w+").unwrap();

        let mut current_chunk: Option<(usize, Vec<&str>, ChunkType, usize)> = None;

        for (line_idx, line) in lines.iter().enumerate() {
            let indent_level = line.chars().take_while(|c| c.is_whitespace()).count();

            if current_chunk.is_none() {
                if def_re.is_match(line) {
                    current_chunk =
                        Some((line_idx, vec![*line], ChunkType::Function, indent_level));
                    continue;
                } else if class_re.is_match(line) {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Class, indent_level));
                    continue;
                }
            }

            if let Some((start_idx, ref mut chunk_lines, ref chunk_type, base_indent)) =
                current_chunk
            {
                // End chunk if we encounter a line at or below the base indentation level
                if !line.trim().is_empty() && indent_level <= base_indent && line_idx > start_idx {
                    chunks.push(CodeChunk {
                        file_path: file_path.to_string(),
                        index: chunks.len(),
                        content: chunk_lines.join("\n"),
                        language: language.to_string(),
                        start_line: (start_idx + 1) as u32,
                        end_line: line_idx as u32,
                        chunk_type: *chunk_type,
                    });

                    current_chunk = None;

                    // Check if current line starts a new chunk
                    if def_re.is_match(line) {
                        current_chunk =
                            Some((line_idx, vec![*line], ChunkType::Function, indent_level));
                    } else if class_re.is_match(line) {
                        current_chunk =
                            Some((line_idx, vec![*line], ChunkType::Class, indent_level));
                    }
                } else {
                    chunk_lines.push(*line);
                }
            }
        }

        if let Some((start_idx, chunk_lines, chunk_type, _)) = current_chunk {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: chunks.len(),
                content: chunk_lines.join("\n"),
                language: language.to_string(),
                start_line: (start_idx + 1) as u32,
                end_line: lines.len() as u32,
                chunk_type,
            });
        }

        if chunks.is_empty() {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: 0,
                content: content.to_string(),
                language: language.to_string(),
                start_line: 1,
                end_line: lines.len() as u32,
                chunk_type: ChunkType::Full,
            });
        }

        chunks
    }

    /// Chunk Go
    fn chunk_go(&self, file_path: &str, content: &str, language: &str) -> Vec<CodeChunk> {
        let mut chunks = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        let func_re = Regex::new(r"^\s*func\s+(?:\([^)]+\)\s+)?\w+").unwrap();
        let type_re = Regex::new(r"^\s*type\s+\w+\s+struct").unwrap();

        let mut current_chunk: Option<(usize, Vec<&str>, ChunkType)> = None;
        let mut brace_depth = 0;

        for (line_idx, line) in lines.iter().enumerate() {
            if current_chunk.is_none() {
                if func_re.is_match(line) {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Function));
                    brace_depth = count_braces(line);
                    continue;
                } else if type_re.is_match(line) {
                    current_chunk = Some((line_idx, vec![*line], ChunkType::Class));
                    brace_depth = count_braces(line);
                    continue;
                }
            }

            if let Some((start_idx, ref mut chunk_lines, ref chunk_type)) = current_chunk {
                chunk_lines.push(*line);
                brace_depth += count_braces(line);

                if brace_depth == 0 && chunk_lines.len() > 1 {
                    chunks.push(CodeChunk {
                        file_path: file_path.to_string(),
                        index: chunks.len(),
                        content: chunk_lines.join("\n"),
                        language: language.to_string(),
                        start_line: (start_idx + 1) as u32,
                        end_line: (line_idx + 1) as u32,
                        chunk_type: *chunk_type,
                    });

                    current_chunk = None;
                    brace_depth = 0;
                }
            }
        }

        if let Some((start_idx, chunk_lines, chunk_type)) = current_chunk {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: chunks.len(),
                content: chunk_lines.join("\n"),
                language: language.to_string(),
                start_line: (start_idx + 1) as u32,
                end_line: lines.len() as u32,
                chunk_type,
            });
        }

        if chunks.is_empty() {
            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                index: 0,
                content: content.to_string(),
                language: language.to_string(),
                start_line: 1,
                end_line: lines.len() as u32,
                chunk_type: ChunkType::Full,
            });
        }

        chunks
    }
}

/// Detect programming language from file extension
fn detect_language(file_path: &str) -> String {
    let path = Path::new(file_path);
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    match extension {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "rs" => "rust",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "cpp" | "cc" | "cxx" => "cpp",
        "c" => "c",
        "cs" => "csharp",
        "rb" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "kt" | "kts" => "kotlin",
        _ => "unknown",
    }
    .to_string()
}

/// Count net braces (opening - closing)
fn count_braces(line: &str) -> i32 {
    let mut count = 0;
    let mut in_string = false;
    let mut escape_next = false;

    for ch in line.chars() {
        if escape_next {
            escape_next = false;
            continue;
        }

        match ch {
            '\\' => escape_next = true,
            '"' | '\'' => in_string = !in_string,
            '{' if !in_string => count += 1,
            '}' if !in_string => count -= 1,
            _ => {}
        }
    }

    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_language() {
        assert_eq!(detect_language("test.ts"), "typescript");
        assert_eq!(detect_language("test.rs"), "rust");
        assert_eq!(detect_language("test.py"), "python");
        assert_eq!(detect_language("test.go"), "go");
    }

    #[test]
    fn test_count_braces() {
        assert_eq!(count_braces("function test() {"), 1);
        assert_eq!(count_braces("}"), -1);
        assert_eq!(count_braces("{ x: 1 }"), 0);
        assert_eq!(count_braces("const x = \"{}\";"), 0);
    }

    #[test]
    fn test_chunk_typescript() {
        let chunker = CodeChunker::new(ChunkStrategy::Semantic);
        let code = r#"
function hello() {
    console.log("Hello");
}

class MyClass {
    method() {
        return 42;
    }
}
"#;

        let chunks = chunker.chunk_typescript("test.ts", code, "typescript");
        assert!(chunks.len() >= 2);
    }
}
