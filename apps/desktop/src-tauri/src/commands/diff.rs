/**
 * Diff-Based Edit System
 * Smart code modifications using minimal diffs
 */

use anyhow::Result;
use serde::{Deserialize, Serialize};
use similar::{ChangeTag, TextDiff};

#[derive(Debug, Deserialize)]
pub struct DiffRequest {
    pub file_path: String,
    pub original_content: String,
    pub instructions: String,
}

#[derive(Debug, Serialize)]
pub struct DiffResponse {
    pub hunks: Vec<DiffHunk>,
    pub preview: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DiffHunk {
    pub old_start: usize,
    pub old_lines: Vec<String>,
    pub new_start: usize,
    pub new_lines: Vec<String>,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
}

/// Generate diff-based edit from LLM instructions
#[tauri::command]
pub async fn generate_diff_edit(
    request: DiffRequest,
    router_state: tauri::State<'_, std::sync::Arc<tokio::sync::Mutex<crate::router::LLMRouter>>>,
) -> Result<DiffResponse, String> {
    // Query LLM for new content
    let prompt = format!(
        r#"Modify the following code according to instructions.
Return ONLY the modified code, no explanations.

File: {}

Original Code:
```
{}
```

Instructions: {}

Modified Code:"#,
        request.file_path, request.original_content, request.instructions
    );

    let llm_request = crate::router::LLMRequest {
        messages: vec![crate::router::Message {
            role: crate::router::MessageRole::User,
            content: prompt,
        }],
        max_tokens: Some(2000),
        temperature: Some(0.2),
        stream: false,
    };

    let router = router_state.lock().await;
    let response = router
        .send_message(&llm_request)
        .await
        .map_err(|e| format!("LLM failed: {}", e))?;

    // Extract code from response (handle markdown code blocks)
    let new_content = extract_code_from_response(&response.content);

    // Generate diff
    let diff = compute_diff(&request.original_content, &new_content);

    Ok(DiffResponse {
        hunks: diff.hunks,
        preview: diff.preview,
    })
}

/// Apply diff to content
#[tauri::command]
pub fn apply_diff(
    original: String,
    hunks: Vec<DiffHunk>,
) -> Result<String, String> {
    let mut lines: Vec<String> = original.lines().map(|s| s.to_string()).collect();

    // Apply hunks in reverse order to maintain line numbers
    let mut sorted_hunks = hunks;
    sorted_hunks.sort_by_key(|h| std::cmp::Reverse(h.old_start));

    for hunk in sorted_hunks {
        let start = hunk.old_start;
        let end = start + hunk.old_lines.len();

        // Remove old lines
        lines.drain(start..end.min(lines.len()));

        // Insert new lines
        for (i, new_line) in hunk.new_lines.iter().enumerate() {
            lines.insert(start + i, new_line.clone());
        }
    }

    Ok(lines.join("\n"))
}

/// Compute diff between old and new content
fn compute_diff(old: &str, new: &str) -> DiffResult {
    let diff = TextDiff::from_lines(old, new);
    let mut hunks = Vec::new();
    let mut preview = String::new();

    let mut old_line = 0;
    let mut new_line = 0;
    let mut current_hunk: Option<DiffHunk> = None;

    for change in diff.iter_all_changes() {
        let line = change.value().trim_end_matches('\n').to_string();

        match change.tag() {
            ChangeTag::Equal => {
                if let Some(hunk) = current_hunk.take() {
                    hunks.push(hunk);
                }
                old_line += 1;
                new_line += 1;
                preview.push_str(&format!("  {}\n", line));
            }
            ChangeTag::Delete => {
                let hunk = current_hunk.get_or_insert(DiffHunk {
                    old_start: old_line,
                    old_lines: Vec::new(),
                    new_start: new_line,
                    new_lines: Vec::new(),
                    context_before: Vec::new(),
                    context_after: Vec::new(),
                });
                hunk.old_lines.push(line.clone());
                old_line += 1;
                preview.push_str(&format!("- {}\n", line));
            }
            ChangeTag::Insert => {
                let hunk = current_hunk.get_or_insert(DiffHunk {
                    old_start: old_line,
                    old_lines: Vec::new(),
                    new_start: new_line,
                    new_lines: Vec::new(),
                    context_before: Vec::new(),
                    context_after: Vec::new(),
                });
                hunk.new_lines.push(line.clone());
                new_line += 1;
                preview.push_str(&format!("+ {}\n", line));
            }
        }
    }

    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    DiffResult { hunks, preview }
}

struct DiffResult {
    hunks: Vec<DiffHunk>,
    preview: String,
}

/// Extract code from LLM response (handle markdown)
fn extract_code_from_response(response: &str) -> String {
    // Check for markdown code blocks
    if let Some(start) = response.find("```") {
        if let Some(end) = response[start + 3..].find("```") {
            let code_block = &response[start + 3..start + 3 + end];
            // Skip language identifier line
            return code_block
                .lines()
                .skip(1)
                .collect::<Vec<_>>()
                .join("\n");
        }
    }

    // Return as-is if no markdown
    response.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_diff() {
        let old = "line1\nline2\nline3";
        let new = "line1\nmodified\nline3";

        let diff = compute_diff(old, new);
        assert_eq!(diff.hunks.len(), 1);
        assert_eq!(diff.hunks[0].old_lines, vec!["line2"]);
        assert_eq!(diff.hunks[0].new_lines, vec!["modified"]);
    }

    #[test]
    fn test_extract_code_from_markdown() {
        let response = "Here's the code:\n```typescript\nconst x = 1;\n```\nDone.";
        let code = extract_code_from_response(response);
        assert_eq!(code.trim(), "const x = 1;");
    }
}
