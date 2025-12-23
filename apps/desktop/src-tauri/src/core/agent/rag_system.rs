use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

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
    pub dependencies: Vec<String>,
    pub embedding: Option<Vec<f32>>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocChunk {
    pub id: String,
    pub source: String,
    pub title: String,
    pub content: String,
    pub section: Option<String>,
    pub embedding: Option<Vec<f32>>,
    pub metadata: HashMap<String, String>,
}

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

pub struct RAGSystem {
    code_index: HashMap<String, CodeChunk>,
    doc_index: HashMap<String, DocChunk>,
    experience_index: HashMap<String, Experience>,
}

impl RAGSystem {
    pub fn new() -> Self {
        Self {
            code_index: HashMap::new(),
            doc_index: HashMap::new(),
            experience_index: HashMap::new(),
        }
    }

    pub async fn index_code_file(
        &mut self,
        file_path: PathBuf,
        content: String,
    ) -> Result<(), String> {
        let chunks = self.parse_code_file(&file_path, &content).await?;
        for chunk in chunks {
            self.code_index.insert(chunk.id.clone(), chunk);
        }
        Ok(())
    }

    async fn parse_code_file(
        &self,
        file_path: &std::path::Path,
        content: &str,
    ) -> Result<Vec<CodeChunk>, String> {
        let mut chunks = Vec::new();
        let language = self.detect_language(file_path);
        let lines: Vec<&str> = content.lines().collect();
        let mut current_chunk_start = 0;
        let mut current_function: Option<String> = None;
        let mut current_class: Option<String> = None;
        let mut doc_comment: Option<String> = None;

        for (i, line) in lines.iter().enumerate() {
            let line = line.trim();

            if line.contains("fn ") || line.contains("function ") || line.contains("async fn ") {
                if let Some(name) = self.extract_function_name(line) {
                    current_function = Some(name);
                    current_chunk_start = i;
                }
            }

            if line.contains("class ") || line.contains("struct ") || line.contains("impl ") {
                if let Some(name) = self.extract_class_name(line) {
                    current_class = Some(name);
                }
            }

            if (line == "}" || line == "};") && current_function.is_some() {
                let chunk = CodeChunk {
                    id: uuid::Uuid::new_v4().to_string(),
                    file_path: file_path.to_path_buf(),
                    content: lines[current_chunk_start..=i].join("\n"),
                    start_line: current_chunk_start,
                    end_line: i,
                    language: language.clone(),
                    function_name: current_function.clone(),
                    class_name: current_class.clone(),
                    doc_comment: doc_comment.clone(),
                    dependencies: self
                        .extract_dependencies(&lines[current_chunk_start..=i].join("\n")),
                    embedding: None,
                    metadata: HashMap::new(),
                };
                chunks.push(chunk);
                current_function = None;
                doc_comment = None;
            }
        }

        if chunks.is_empty() {
            chunks.push(CodeChunk {
                id: uuid::Uuid::new_v4().to_string(),
                file_path: file_path.to_path_buf(),
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

    fn detect_language(&self, path: &std::path::Path) -> String {
        if let Some(ext) = path.extension() {
            match ext.to_string_lossy().as_ref() {
                "rs" => "rust".to_string(),
                "ts" | "tsx" => "typescript".to_string(),
                "js" | "jsx" => "javascript".to_string(),
                "py" => "python".to_string(),
                _ => "unknown".to_string(),
            }
        } else {
            "unknown".to_string()
        }
    }

    fn extract_function_name(&self, line: &str) -> Option<String> {
        if let Some(start) = line.find("fn ") {
            let after_fn = &line[start + 3..];
            if let Some(end) = after_fn.find('(') {
                return Some(after_fn[..end].trim().to_string());
            }
        }
        None
    }

    fn extract_class_name(&self, line: &str) -> Option<String> {
        if let Some(start) = line.find("struct ") {
            let after_struct = &line[start + 7..];
            if let Some(end) = after_struct.find(' ') {
                return Some(after_struct[..end].trim().to_string());
            }
        }
        None
    }

    fn extract_dependencies(&self, content: &str) -> Vec<String> {
        let mut deps = Vec::new();
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("use ") || line.starts_with("import ") {
                deps.push(line.to_string());
            }
        }
        deps
    }

    pub fn search_code(&self, query: &str, limit: usize) -> Vec<&CodeChunk> {
        let query_lower = query.to_lowercase();
        let mut results: Vec<(&String, &CodeChunk)> = self
            .code_index
            .iter()
            .filter(|(_, chunk)| chunk.content.to_lowercase().contains(&query_lower))
            .collect();

        results.sort_by(|a, b| {
            let score_a = if a.1.content.to_lowercase().contains(&query_lower) {
                10
            } else {
                0
            };
            let score_b = if b.1.content.to_lowercase().contains(&query_lower) {
                10
            } else {
                0
            };
            score_b.cmp(&score_a)
        });

        results
            .into_iter()
            .take(limit)
            .map(|(_, chunk)| chunk)
            .collect()
    }

    pub fn retrieve_context(&self, task_description: &str, limit: usize) -> RAGContext {
        let code_chunks = self.search_code(task_description, limit);
        RAGContext {
            code_chunks: code_chunks.into_iter().cloned().collect(),
            experiences: Vec::new(),
            doc_chunks: Vec::new(),
        }
    }

    pub fn store_experience(&mut self, experience: Experience) {
        self.experience_index
            .insert(experience.id.clone(), experience);
    }

    pub fn index_documentation(&mut self, doc: DocChunk) {
        self.doc_index.insert(doc.id.clone(), doc);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RAGContext {
    pub code_chunks: Vec<CodeChunk>,
    pub experiences: Vec<Experience>,
    pub doc_chunks: Vec<DocChunk>,
}

impl RAGContext {
    pub fn to_prompt(&self) -> String {
        let mut prompt = String::new();
        if !self.code_chunks.is_empty() {
            prompt.push_str("## Relevant Code Examples\n\n");
            for chunk in &self.code_chunks {
                prompt.push_str("```\n");
                prompt.push_str(&chunk.content);
                prompt.push_str("\n```\n\n");
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
