//! The bound the web puts on connected tool schemas
//! (apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts): rank
//! the connected tools against the turn and admit schemas until a count and a
//! byte budget are spent, so the prompt stays bounded as servers are added.

use crate::core::llm::ToolDefinition;
use std::collections::HashSet;

/// `MAX_CONNECTOR_TOOLS_PER_USER` in apps/web/lib/user-connector-tools.ts.
pub const MAX_TOOL_SCHEMAS: usize = 32;
/// `DEFAULT_TOOL_SCHEMA_BYTES` in the web's tool-schema-loader.ts.
pub const MAX_TOOL_SCHEMA_BYTES: usize = 24_000;

const MIN_RELEVANT_SCORE: usize = 1;
const NAME_MATCH_WEIGHT: usize = 3;
const SERVER_MATCH_WEIGHT: usize = 2;
const DESCRIPTION_MATCH_WEIGHT: usize = 1;
const MIN_WORD_LENGTH: usize = 3;
const DEFERRED_SUMMARY_CHARS: usize = 80;

pub struct ToolSchemaCandidate {
    pub server_name: String,
    pub tool_name: String,
    pub definition: ToolDefinition,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeferredToolSchema {
    pub name: String,
    pub summary: String,
}

#[derive(Debug, Default)]
pub struct ToolSchemaSelection {
    pub tools: Vec<ToolDefinition>,
    pub deferred: Vec<DeferredToolSchema>,
    pub bytes: usize,
}

fn words(value: &str) -> HashSet<String> {
    value
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| word.len() >= MIN_WORD_LENGTH)
        .map(str::to_string)
        .collect()
}

fn overlap(candidate: &str, turn: &HashSet<String>) -> usize {
    words(candidate)
        .iter()
        .filter(|word| turn.contains(*word))
        .count()
}

fn relevance(candidate: &ToolSchemaCandidate, turn: &HashSet<String>) -> usize {
    overlap(&candidate.tool_name, turn) * NAME_MATCH_WEIGHT
        + overlap(&candidate.server_name, turn) * SERVER_MATCH_WEIGHT
        + overlap(&candidate.definition.description, turn) * DESCRIPTION_MATCH_WEIGHT
}

pub fn tool_schema_bytes(definition: &ToolDefinition) -> usize {
    serde_json::to_vec(&serde_json::json!({
        "name": definition.name,
        "description": definition.description,
        "parameters": definition.parameters,
    }))
    .map(|bytes| bytes.len())
    .unwrap_or(usize::MAX)
}

fn deferred_entry(candidate: &ToolSchemaCandidate) -> DeferredToolSchema {
    let summary = candidate
        .definition
        .description
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let summary = if summary.chars().count() > DEFERRED_SUMMARY_CHARS {
        format!(
            "{}...",
            summary
                .chars()
                .take(DEFERRED_SUMMARY_CHARS)
                .collect::<String>()
        )
    } else {
        summary
    };
    DeferredToolSchema {
        name: format!("{} / {}", candidate.server_name, candidate.tool_name),
        summary,
    }
}

pub fn select_tool_schemas(
    candidates: Vec<ToolSchemaCandidate>,
    turn_text: &str,
) -> ToolSchemaSelection {
    let turn = words(turn_text);
    let mut ranked: Vec<(usize, usize, ToolSchemaCandidate)> = candidates
        .into_iter()
        .enumerate()
        .map(|(index, candidate)| (relevance(&candidate, &turn), index, candidate))
        .collect();
    ranked.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    let any_relevant = ranked
        .iter()
        .any(|(score, _, _)| *score >= MIN_RELEVANT_SCORE);

    let mut selection = ToolSchemaSelection::default();
    for (score, _, candidate) in ranked {
        let size = tool_schema_bytes(&candidate.definition);
        let admissible = selection.tools.len() < MAX_TOOL_SCHEMAS
            && selection.bytes.saturating_add(size) <= MAX_TOOL_SCHEMA_BYTES
            && (!any_relevant || score >= MIN_RELEVANT_SCORE);
        if admissible {
            selection.bytes += size;
            selection.tools.push(candidate.definition);
        } else {
            selection.deferred.push(deferred_entry(&candidate));
        }
    }
    selection.tools.sort_by(|a, b| a.name.cmp(&b.name));
    selection
}

/// Names what was left out, so the model can tell the user it exists and a
/// later message that names it brings it in, rather than it silently vanishing.
pub fn deferred_tools_notice(deferred: &[DeferredToolSchema]) -> Option<String> {
    if deferred.is_empty() {
        return None;
    }
    let listing = deferred
        .iter()
        .map(|tool| format!("- {}: {}", tool.name, tool.summary))
        .collect::<Vec<_>>()
        .join("\n");
    Some(format!(
        "\n\nThese connected tools were left out of this message to keep the request within its \
         tool budget, so none of them can be called now. If one is needed, tell the user to name \
         it in their next message, which brings it in.\n{listing}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(server: &str, tool: &str, description: &str) -> ToolSchemaCandidate {
        ToolSchemaCandidate {
            server_name: server.to_string(),
            tool_name: tool.to_string(),
            definition: ToolDefinition {
                name: format!("mcp__{server}__{tool}"),
                description: description.to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": { "query": { "type": "string" } },
                }),
                strict: None,
            },
        }
    }

    fn many(count: usize) -> Vec<ToolSchemaCandidate> {
        (0..count)
            .map(|index| candidate("warehouse", &format!("tool_{index:03}"), "Reads a table."))
            .collect()
    }

    #[test]
    fn admits_no_more_schemas_than_the_web_does_and_names_the_rest() {
        let selection = select_tool_schemas(many(MAX_TOOL_SCHEMAS + 8), "");

        assert_eq!(selection.tools.len(), MAX_TOOL_SCHEMAS);
        assert_eq!(selection.deferred.len(), 8);
        assert!(selection.bytes <= MAX_TOOL_SCHEMA_BYTES);
    }

    #[test]
    fn stops_at_the_byte_budget_even_under_the_count() {
        let large = "x".repeat(MAX_TOOL_SCHEMA_BYTES / 3);
        let candidates = (0..5)
            .map(|index| candidate("docs", &format!("page_{index}"), &large))
            .collect();

        let selection = select_tool_schemas(candidates, "");

        assert_eq!(selection.tools.len(), 2);
        assert_eq!(selection.deferred.len(), 3);
        assert!(selection.bytes <= MAX_TOOL_SCHEMA_BYTES);
    }

    #[test]
    fn a_tool_the_turn_names_is_admitted_ahead_of_the_rest() {
        let mut candidates = many(MAX_TOOL_SCHEMAS + 8);
        candidates.push(candidate(
            "tracker",
            "create_issue",
            "Opens an issue in the tracker.",
        ));

        let selection = select_tool_schemas(candidates, "please create an issue for this bug");

        assert_eq!(
            selection
                .tools
                .iter()
                .map(|tool| tool.name.as_str())
                .collect::<Vec<_>>(),
            vec!["mcp__tracker__create_issue"]
        );
        assert!(selection
            .deferred
            .iter()
            .all(|tool| tool.name.starts_with("warehouse / ")));
    }

    #[test]
    fn the_notice_lists_every_deferred_tool_and_is_absent_when_nothing_was_left_out() {
        let selection = select_tool_schemas(many(MAX_TOOL_SCHEMAS + 2), "");
        let notice = deferred_tools_notice(&selection.deferred).expect("two tools were left out");

        for tool in &selection.deferred {
            assert!(notice.contains(&tool.name));
        }
        assert!(deferred_tools_notice(&select_tool_schemas(many(3), "").deferred).is_none());
    }
}
