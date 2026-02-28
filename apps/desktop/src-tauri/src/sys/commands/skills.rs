//! Tauri commands for skills management.

use crate::core::skills::{
    RequirementCheckResult, Skill, SkillInvocation, SkillManager, SkillSourceFilter, SlashCommand,
};
use serde::Serialize;
use std::collections::HashSet;
use tauri::State;

/// State wrapper for the skill manager.
pub struct SkillsState {
    pub manager: SkillManager,
}

impl Default for SkillsState {
    fn default() -> Self {
        let manager = SkillManager::new();
        manager.initialize();
        Self { manager }
    }
}

/// Serializable skill information for frontend consumption.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source_type: String,
    pub requires_bins: Vec<String>,
    pub requires_env: Vec<String>,
    pub supported_os: Vec<String>,
    pub allowed_tools: Vec<String>,
    pub context_mode: String,
}

impl From<&Skill> for SkillInfo {
    fn from(skill: &Skill) -> Self {
        let source_type = if skill.source.is_bundled() {
            "bundled"
        } else if skill.source.is_managed() {
            "managed"
        } else if skill.source.is_workspace() {
            "workspace"
        } else {
            "unknown"
        }
        .to_string();

        let context_mode = if skill.context_mode.is_fork() {
            "fork"
        } else {
            "main"
        }
        .to_string();

        Self {
            name: skill.name.clone(),
            description: skill.description.clone(),
            source_type,
            requires_bins: skill.requires_bins.clone(),
            requires_env: skill.requires_env.clone(),
            supported_os: skill.supported_os.clone(),
            allowed_tools: skill.allowed_tools.clone(),
            context_mode,
        }
    }
}

/// Serializable skill invocation result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInvocationResult {
    pub skill_name: String,
    pub instructions: String,
    pub allowed_tools: Vec<String>,
    pub context_mode: String,
}

impl From<SkillInvocation> for SkillInvocationResult {
    fn from(invocation: SkillInvocation) -> Self {
        Self {
            skill_name: invocation.skill_name,
            instructions: invocation.instructions,
            allowed_tools: invocation.allowed_tools,
            context_mode: if invocation.context_mode.is_fork() {
                "fork".to_string()
            } else {
                "main".to_string()
            },
        }
    }
}

/// Serializable requirement check result for frontend consumption.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementCheckResultResponse {
    pub satisfied: bool,
    pub missing_bins: Vec<String>,
    pub missing_env: Vec<String>,
    pub os_supported: bool,
}

impl From<RequirementCheckResult> for RequirementCheckResultResponse {
    fn from(result: RequirementCheckResult) -> Self {
        Self {
            satisfied: result.satisfied,
            missing_bins: result.missing_bins,
            missing_env: result.missing_env,
            os_supported: result.os_supported,
        }
    }
}

/// Result of matching a skill against a user message.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMatchResult {
    pub skill_name: String,
    pub description: String,
    pub relevance_score: f64,
    pub match_reason: String,
}

/// Common English stopwords to filter out during tokenization.
const STOPWORDS: &[&str] = &[
    "a", "an", "the", "is", "it", "in", "on", "at", "to", "for", "of", "and", "or", "but", "not",
    "with", "from", "by", "as", "this", "that", "be", "are", "was", "were", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might",
    "can", "i", "me", "my", "you", "your", "we", "our", "they", "them", "their", "he", "she",
    "his", "her", "its", "what", "which", "who", "how", "when", "where", "why", "so", "if", "then",
    "just", "also", "about", "up", "out", "no", "yes",
];

/// Tokenize a string into lowercase words, stripping punctuation and filtering
/// out common stopwords.
fn tokenize(text: &str) -> HashSet<String> {
    let stopwords: HashSet<&str> = STOPWORDS.iter().copied().collect();

    text.to_lowercase()
        .split(|c: char| c.is_whitespace() || c.is_ascii_punctuation())
        .filter(|w| !w.is_empty() && w.len() > 1)
        .filter(|w| !stopwords.contains(w))
        .map(String::from)
        .collect()
}

/// Compute the Jaccard similarity between two token sets.
///
/// Returns a value in `[0.0, 1.0]` where 1.0 means the sets are identical.
fn jaccard_similarity(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let intersection = a.intersection(b).count() as f64;
    let union = a.union(b).count() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

/// Match available skills against a user message and return ranked results.
///
/// Algorithm:
/// 1. Tokenize user message: lowercase, split on whitespace/punctuation, filter stopwords.
/// 2. For each skill: compute Jaccard similarity between message tokens and
///    skill name+description tokens.
/// 3. Boost score by 0.3 if the skill name appears as a substring in the message.
/// 4. Filter: score > 0.15, limit 3, sort descending.
/// 5. `match_reason` lists the overlapping keywords.
#[tauri::command]
pub fn skill_match_for_message(
    content: String,
    state: State<'_, SkillsState>,
) -> Vec<SkillMatchResult> {
    let message_tokens = tokenize(&content);
    if message_tokens.is_empty() {
        return Vec::new();
    }

    let message_lower = content.to_lowercase();
    let skills = state.manager.skills_by_source(SkillSourceFilter::All);

    let mut matches: Vec<SkillMatchResult> = skills
        .iter()
        .filter_map(|skill| {
            // Build token set from skill name + description
            let skill_text = format!("{} {}", skill.name, skill.description);
            let skill_tokens = tokenize(&skill_text);
            if skill_tokens.is_empty() {
                return None;
            }

            let mut score = jaccard_similarity(&message_tokens, &skill_tokens);

            // Boost if the skill name appears as a substring in the message
            let skill_name_lower = skill.name.to_lowercase();
            if message_lower.contains(&skill_name_lower) {
                score += 0.3;
            }

            if score <= 0.15 {
                return None;
            }

            // Build match reason from overlapping keywords
            let matched_keywords: Vec<&String> =
                message_tokens.intersection(&skill_tokens).collect();
            let reason = if matched_keywords.is_empty() {
                format!("Skill name '{}' found in message", skill.name)
            } else {
                let kw_list: Vec<&str> = matched_keywords
                    .iter()
                    .take(5)
                    .map(|s| s.as_str())
                    .collect();
                format!("Keywords matched: {}", kw_list.join(", "))
            };

            Some(SkillMatchResult {
                skill_name: skill.name.clone(),
                description: skill.description.clone(),
                relevance_score: score,
                match_reason: reason,
            })
        })
        .collect();

    // Sort descending by score
    matches.sort_by(|a, b| {
        b.relevance_score
            .partial_cmp(&a.relevance_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Limit to top 3
    matches.truncate(3);
    matches
}

/// Lists all available skills.
///
/// Returns skills from all sources (bundled, managed, and workspace).
#[tauri::command]
pub fn skill_list(state: State<'_, SkillsState>) -> Vec<SkillInfo> {
    state
        .manager
        .skills_by_source(SkillSourceFilter::All)
        .iter()
        .map(SkillInfo::from)
        .collect()
}

/// Gets a skill by name.
///
/// Returns `None` if the skill is not found.
#[tauri::command]
pub fn skill_get(state: State<'_, SkillsState>, name: String) -> Option<SkillInfo> {
    state.manager.get_skill(&name).as_ref().map(SkillInfo::from)
}

/// Gets the instructions for a skill by name.
///
/// Returns `None` if the skill is not found.
#[tauri::command]
pub fn skill_get_instructions(state: State<'_, SkillsState>, name: String) -> Option<String> {
    state.manager.get_skill(&name).map(|s| s.instructions)
}

/// Checks if a skill's requirements are satisfied.
///
/// Returns `None` if the skill is not found.
#[tauri::command]
pub fn skill_check_requirements(
    state: State<'_, SkillsState>,
    name: String,
) -> Option<RequirementCheckResultResponse> {
    state
        .manager
        .check_skill_requirements(&name)
        .map(RequirementCheckResultResponse::from)
}

/// Generates the full skill context for AGI prompts.
///
/// Returns a formatted string containing all available skill instructions.
#[tauri::command]
pub fn skill_get_context(state: State<'_, SkillsState>) -> String {
    state.manager.generate_skill_context()
}

/// Sets the workspace path for loading workspace-local skills.
///
/// Pass `None` to clear the workspace and remove workspace skills.
#[tauri::command]
pub fn skill_set_workspace(state: State<'_, SkillsState>, path: Option<String>) {
    state
        .manager
        .set_workspace(path.map(std::path::PathBuf::from));
}

/// Returns the total number of loaded skills.
#[tauri::command]
pub fn skill_count(state: State<'_, SkillsState>) -> usize {
    state.manager.skill_count()
}

/// Invokes a skill with the provided arguments.
///
/// Returns the skill instructions with arguments substituted.
#[tauri::command]
pub fn skill_invoke(
    state: State<'_, SkillsState>,
    name: String,
    arguments: String,
) -> Result<SkillInvocationResult, String> {
    state
        .manager
        .invoke_skill(&name, &arguments)
        .map(SkillInvocationResult::from)
        .map_err(|e| e.to_string())
}

/// Parses a slash command and returns skill invocation if valid.
///
/// Slash commands have the format: `/skill-name [arguments]`
#[tauri::command]
pub fn skill_parse_slash_command(
    state: State<'_, SkillsState>,
    input: String,
) -> Option<Result<SkillInvocationResult, String>> {
    state.manager.parse_slash_command(&input).map(|result| {
        result
            .map(SkillInvocationResult::from)
            .map_err(|e| e.to_string())
    })
}

/// Returns a list of available slash commands.
#[tauri::command]
pub fn skill_get_slash_commands(state: State<'_, SkillsState>) -> Vec<SlashCommand> {
    state.manager.get_slash_commands()
}

/// Reloads all skills from disk.
#[tauri::command]
pub fn skill_reload(state: State<'_, SkillsState>) {
    state.manager.reload();
}
