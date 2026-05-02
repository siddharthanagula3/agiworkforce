use std::path::PathBuf;

use clap::Args;

use crate::SandboxModeCliArg;

/// CLI flags shared between every Agiworkforce front-end binary that boots a
/// session (TUI, exec, …). Wrapped per-binary in a Newtype so that
/// `mark_..._args` hooks can flip flags to `global = true`.
#[derive(Args, Debug, Default, Clone)]
pub struct SharedCliOptions {
    /// Image attachment to send with the prompt. Repeatable.
    #[arg(long = "image", short = 'i', value_name = "FILE", num_args = 0..)]
    pub images: Vec<PathBuf>,

    /// Override the configured model.
    #[arg(long = "model", short = 'm', value_name = "MODEL")]
    pub model: Option<String>,

    /// Use the gpt-oss model bundled with the binary instead of any cloud model.
    #[arg(long = "oss", default_value_t = false)]
    pub oss: bool,

    /// Provider override for the gpt-oss build (e.g., "ollama", "lmstudio").
    #[arg(long = "oss-provider", value_name = "PROVIDER")]
    pub oss_provider: Option<String>,

    /// Configuration profile to load from `$AGIWORKFORCE_HOME/config.toml`.
    #[arg(long = "profile", short = 'p', value_name = "NAME")]
    pub config_profile: Option<String>,

    /// Sandbox enforcement mode for shell tools.
    #[arg(long = "sandbox", short = 's', value_enum)]
    pub sandbox_mode: Option<SandboxModeCliArg>,

    /// Skip every approval and sandbox check. Use only on disposable machines.
    #[arg(
        long = "dangerously-bypass-approvals-and-sandbox",
        default_value_t = false,
        alias = "yolo"
    )]
    pub dangerously_bypass_approvals_and_sandbox: bool,

    /// Working directory for the session. Defaults to the current directory.
    #[arg(long = "cwd", short = 'C', value_name = "DIR")]
    pub cwd: Option<PathBuf>,

    /// Additional directories the agent is allowed to read and write under
    /// the workspace-write sandbox. Repeatable.
    #[arg(long = "add-dir", value_name = "DIR", num_args = 0..)]
    pub add_dir: Vec<PathBuf>,
}
