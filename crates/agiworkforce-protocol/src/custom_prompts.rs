use std::path::PathBuf;

/// Prefix for slash commands generated from custom prompts (e.g., `/prompts:my-prompt`).
pub const PROMPTS_CMD_PREFIX: &str = "prompts";

/// A custom prompt loaded from disk (e.g., `~/.agiworkforce/prompts/`).
#[derive(Debug, Clone)]
pub struct CustomPrompt {
    /// Unique name used in slash commands.
    pub name: String,
    /// Filesystem path to the prompt file.
    pub path: PathBuf,
    /// Raw content of the prompt file (may contain `$PLACEHOLDER` patterns).
    pub content: String,
    /// Optional short description shown in the command popup.
    pub description: Option<String>,
    /// Optional hint for the argument format (shown in the popup).
    pub argument_hint: Option<String>,
}
