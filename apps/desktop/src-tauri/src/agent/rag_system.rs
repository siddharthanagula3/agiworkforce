use chrono::{DateTime, Utc};
/// RAG (Retrieval-Augmented Generation) System
///
/// Enables AI to retrieve relevant context from codebase, documentation,
/// and past experiences to generate better code.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Code chunk with metadata for semantic search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChunk {
    pub id: String,
    pub file_path: PathBuf,
    pub content: String,
    pub start_line: usize,
    pub end_line: usize,
    pub language: String,
    pub function_name: Option<String>,
    pub class_name: Option<String>,
    pub doc_comment: Option<String>,
    pub dependencies: Vec<String>,   // Imports, uses, etc.
    pub embedding: Option<Vec<f32>>, // Vector embedding for semantic search
    pub metadata: HashMap<String, String>,
}

/// Documentation chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocChunk {
    pub id: String,
    pub source: String, // File path or URL
    pub title: String,
    pub content: String,
    pub section: Option<String>,
    pub embedding: Option<Vec<f32>>,
    pub metadata: HashMap<String, String>,
}

/// Past experience/pattern from previous tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experience {
    pub id: String,
    pub task_description: String,
    pub solution: String,
    pub code_examples: Vec<CodeChunk>,
    pub success: bool,
    pub timestamp: DateTime<Utc>,
    pub tags: Vec<String>,
    pub embedding: Option<Vec<f32>>,
}

/// RAG System for context retrieval
pub struct RAGSystem {
    code_index: HashMap<String, CodeChunk>,
    doc_index: HashMap<String, DocChunk>,
    experience_index: HashMap<String, Experience>,
    // In production, would use a proper vector database (Qdrant, Pinecone, etc.)
    // For now, using simple in-memory storage
}

impl RAGSystem {
    pub fn new() -> Self {
        Self {
            code_index: HashMap::new(),
            doc_index: HashMap::new(),
            experience_index: HashMap::new(),
        }
    }

    /// Index a code file
    pub async fn index_code_file(
        &mut self,
        file_path: PathBuf,
        content: String,
    ) -> Result<(), String> {
        // Parse file into chunks (functions, classes, etc.)
        let chunks = self.parse_code_file(&file_path, &content).await?;

        for chunk in chunks {
            self.code_index.insert(chunk.id.clone(), chunk);
        }

        Ok(())
    }

    /// Parse code file into semantic chunks
    async fn parse_code_file(
        &self,
        file_path: &PathBuf,
        content: &str,
    ) -> Result<Vec<CodeChunk>, String> {
        let mut chunks = Vec::new();
        let language = self.detect_language(file_path);

        // Simple parsing - in production, would use proper AST parsers
        let lines: Vec<&str> = content.lines().collect();
        let mut current_chunk_start = 0;
        let mut current_function: Option<String> = None;
        let mut current_class: Option<String> = None;
        let mut doc_comment: Option<String> = None;

        for (i, line) in lines.iter().enumerate() {
            let line = line.trim();

            // Detect doc comments
            if line.starts_with("///") || line.starts_with("/**") || line.starts_with("*") {
                doc_comment = Some(line.to_string());
            }

            // Detect function definitions
            if line.contains("fn ") || line.contains("function ") || line.contains("async fn ") {
                if let Some(name) = self.extract_function_name(line) {
                    current_function = Some(name);
                    current_chunk_start = i;
                }
            }

            // Detect class definitions
            if line.contains("class ") || line.contains("struct ") || line.contains("impl ") {
                if let Some(name) = self.extract_class_name(line) {
                    current_class = Some(name);
                }
            }

            // Detect end of function/block
            if line == "}" || line == "};" {
                if current_function.is_some() {
                    let chunk = CodeChunk {
                        id: uuid::Uuid::new_v4().to_string(),
                        file_path: file_path.clone(),
                        content: lines[current_chunk_start..=i].join("\n"),
                        start_line: current_chunk_start,
                        end_line: i,
                        language: language.clone(),
                        function_name: current_function.clone(),
                        class_name: current_class.clone(),
                        doc_comment: doc_comment.clone(),
                        dependencies: self
                            .extract_dependencies(&lines[current_chunk_start..=i].join("\n")),
                        embedding: None, // Would generate embedding here
                        metadata: HashMap::new(),
                    };
                    chunks.push(chunk);
                    current_function = None;
                    doc_comment = None;
                }
            }
        }

        // If no functions found, create one chunk for entire file
        if chunks.is_empty() {
            chunks.push(CodeChunk {
                id: uuid::Uuid::new_v4().to_string(),
                file_path: file_path.clone(),
                content: content.to_string(),
                start_line: 0,
                end_line: lines.len(),
                language,
                function_name: None,
                class_name: None,
                doc_comment: None,
                dependencies: self.extract_dependencies(content),
                embedding: None,
                metadata: HashMap::new(),
            });
        }

        Ok(chunks)
    }

    /// Detect programming language from file extension
    fn detect_language(&self, path: &PathBuf) -> String {
        if let Some(ext) = path.extension() {
            match ext.to_string_lossy().as_ref() {
                "rs" => "rust".to_string(),
                "ts" | "tsx" => "typescript".to_string(),
                "js" | "jsx" => "javascript".to_string(),
                "py" => "python".to_string(),
                "go" => "go".to_string(),
                "java" => "java".to_string(),
                "cpp" | "cc" => "cpp".to_string(),
                "c" => "c".to_string(),
                _ => "unknown".to_string(),
            }
        } else {
            "unknown".to_string()
        }
    }

    /// Extract function name from line
    fn extract_function_name(&self, line: &str) -> Option<String> {
        // Simple extraction - in production, use proper AST
        if let Some(start) = line.find("fn ") {
            let after_fn = &line[start + 3..];
            if let Some(end) = after_fn.find('(') {
                return Some(after_fn[..end].trim().to_string());
            }
        }
        if let Some(start) = line.find("function ") {
            let after_fn = &line[start + 9..];
            if let Some(end) = after_fn.find('(') {
                return Some(after_fn[..end].trim().to_string());
            }
        }
        None
    }

    /// Extract class/struct name from line
    fn extract_class_name(&self, line: &str) -> Option<String> {
        if let Some(start) = line.find("class ") {
            let after_class = &line[start + 6..];
            if let Some(end) = after_class.find(' ') {
                return Some(after_class[..end].trim().to_string());
            }
        }
        if let Some(start) = line.find("struct ") {
            let after_struct = &line[start + 7..];
            if let Some(end) = after_struct.find(' ') {
                return Some(after_struct[..end].trim().to_string());
            }
        }
        None
    }

    /// Extract dependencies (imports, uses, etc.)
    fn extract_dependencies(&self, content: &str) -> Vec<String> {
        let mut deps = Vec::new();

        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("use ") || line.starts_with("import ") || line.starts_with("from ")
            {
                deps.push(line.to_string());
            }
        }

        deps
    }

    /// Search for relevant code chunks
    pub fn search_code(&self, query: &str, limit: usize) -> Vec<&CodeChunk> {
        // Simple keyword matching - in production, would use semantic search with embeddings
        let query_lower = query.to_lowercase();
        let mut results: Vec<(&String, &CodeChunk)> = self
            .code_index
            .iter()
            .filter(|(_, chunk)| {
                chunk.content.to_lowercase().contains(&query_lower)
                    || chunk
                        .function_name
                        .as_ref()
                        .map(|n| n.to_lowercase().contains(&query_lower))
                        .unwrap_or(false)
                    || chunk
                        .doc_comment
                        .as_ref()
                        .map(|d| d.to_lowercase().contains(&query_lower))
                        .unwrap_or(false)
            })
            .collect();

        // Sort by relevance (simple scoring)
        results.sort_by(|a, b| {
            let score_a = self.score_relevance(a.1, &query_lower);
            let score_b = self.score_relevance(b.1, &query_lower);
            score_b.cmp(&score_a)
        });

        results
            .into_iter()
            .take(limit)
            .map(|(_, chunk)| chunk)
            .collect()
    }

    /// Score relevance of chunk to query
    fn score_relevance(&self, chunk: &CodeChunk, query: &str) -> usize {
        let mut score = 0;
        let content_lower = chunk.content.to_lowercase();

        // Exact matches
        if content_lower.contains(query) {
            score += 10;
        }

        // Function name matches
        if let Some(ref func_name) = chunk.function_name {
            if func_name.to_lowercase().contains(query) {
                score += 5;
            }
        }

        // Doc comment matches
        if let Some(ref doc) = chunk.doc_comment {
            if doc.to_lowercase().contains(query) {
                score += 3;
            }
        }

        score
    }

    /// Retrieve relevant context for a task
    pub fn retrieve_context(&self, task_description: &str, limit: usize) -> RAGContext {
        // Search code
        let code_chunks = self.search_code(task_description, limit);

        // Search experiences
        let experiences: Vec<&Experience> = self
            .experience_index
            .values()
            .filter(|exp| {
                exp.task_description
                    .to_lowercase()
                    .contains(&task_description.to_lowercase())
                    || exp.tags.iter().any(|tag| {
                        task_description
                            .to_lowercase()
                            .contains(&tag.to_lowercase())
                    })
            })
            .take(limit)
            .collect();

        // Search documentation
        let doc_chunks: Vec<&DocChunk> = self
            .doc_index
            .values()
            .filter(|doc| {
                doc.content
                    .to_lowercase()
                    .contains(&task_description.to_lowercase())
                    || doc
                        .title
                        .to_lowercase()
                        .contains(&task_description.to_lowercase())
            })
            .take(limit)
            .collect();

        RAGContext {
            code_chunks: code_chunks.into_iter().cloned().collect(),
            experiences: experiences.into_iter().cloned().collect(),
            doc_chunks: doc_chunks.into_iter().cloned().collect(),
        }
    }

    /// Store an experience/pattern
    pub fn store_experience(&mut self, experience: Experience) {
        self.experience_index
            .insert(experience.id.clone(), experience);
    }

    /// Index documentation
    pub fn index_documentation(&mut self, doc: DocChunk) {
        self.doc_index.insert(doc.id.clone(), doc);
    }
}

/// Retrieved context for RAG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RAGContext {
    pub code_chunks: Vec<CodeChunk>,
    pub experiences: Vec<Experience>,
    pub doc_chunks: Vec<DocChunk>,
}

impl RAGContext {
    /// Format context as prompt for LLM
    pub fn to_prompt(&self) -> String {
        let mut prompt = String::new();

        if !self.code_chunks.is_empty() {
            prompt.push_str("## Relevant Code Examples\n\n");
            for chunk in &self.code_chunks {
                prompt.push_str(&format!(
                    "### {} ({}:{})\n",
                    chunk.file_path.display(),
                    chunk.start_line,
                    chunk.end_line
                ));
                if let Some(ref func_name) = chunk.function_name {
                    prompt.push_str(&format!("Function: {}\n", func_name));
                }
                if let Some(ref doc) = chunk.doc_comment {
                    prompt.push_str(&format!("Documentation: {}\n", doc));
                }
                prompt.push_str("```\n");
                prompt.push_str(&chunk.content);
                prompt.push_str("\n```\n\n");
            }
        }

        if !self.experiences.is_empty() {
            prompt.push_str("## Similar Past Experiences\n\n");
            for exp in &self.experiences {
                prompt.push_str(&format!("### {}\n", exp.task_description));
                prompt.push_str(&format!("Solution: {}\n\n", exp.solution));
            }
        }

        if !self.doc_chunks.is_empty() {
            prompt.push_str("## Relevant Documentation\n\n");
            for doc in &self.doc_chunks {
                prompt.push_str(&format!("### {}\n", doc.title));
                prompt.push_str(&doc.content);
                prompt.push_str("\n\n");
            }
        }

        prompt
    }
}

impl Default for RAGSystem {
    fn default() -> Self {
        Self::new()
    }
}
