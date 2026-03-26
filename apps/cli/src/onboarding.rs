// First-run onboarding wizard for AGI Workforce CLI
// First-run onboarding wizard

use anyhow::{Context, Result};
use colored::Colorize;

// ─────────────────────────────────────────────────────────────────────────────
// Amber/gold brand color (warm palette)
// ─────────────────────────────────────────────────────────────────────────────

/// Print text in brand amber color (TrueColor: #FFB000, fallback: yellow).
///
/// Checks `COLORTERM` env var for truecolor support instead of depending on
/// the `supports_color` crate.
fn amber(text: &str) -> String {
    let has_truecolor = std::env::var("COLORTERM")
        .map(|v| v == "truecolor" || v == "24bit")
        .unwrap_or(false);
    if has_truecolor {
        format!("\x1b[38;2;255;176;0m{text}\x1b[0m")
    } else {
        format!("{}", text.yellow())
    }
}

/// Print text in brand amber + bold
fn amber_bold(text: &str) -> String {
    let has_truecolor = std::env::var("COLORTERM")
        .map(|v| v == "truecolor" || v == "24bit")
        .unwrap_or(false);
    if has_truecolor {
        format!("\x1b[1;38;2;255;176;0m{text}\x1b[0m")
    } else {
        format!("{}", text.yellow().bold())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// First-run detection
// ─────────────────────────────────────────────────────────────────────────────

/// Check whether first-run onboarding has already completed.
pub fn is_setup_complete() -> bool {
    crate::config::CliConfig::config_dir()
        .map(|dir| dir.join(".setup_complete").exists())
        .unwrap_or(false)
}

/// Write the .setup_complete marker after onboarding finishes.
fn mark_setup_complete() -> Result<()> {
    let dir = crate::config::CliConfig::config_dir()?;
    let marker = dir.join(".setup_complete");
    std::fs::write(
        &marker,
        format!(
            "Setup completed at {}\nVersion: {}\n",
            chrono::Utc::now().to_rfc3339(),
            env!("CARGO_PKG_VERSION"),
        ),
    )?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// ASCII art welcome
// ─────────────────────────────────────────────────────────────────────────────

fn print_welcome_banner() {
    let logo = r#"
     _    ____ ___  __        __         _     __
    / \  / ___|_ _| \ \      / /__  _ __| | __/ _| ___  _ __ ___ ___
   / _ \| |  _ | |   \ \ /\ / / _ \| '__| |/ / |_ / _ \| '__/ __/ _ \
  / ___ \ |_| || |    \ V  V / (_) | |  |   <|  _| (_) | | | (_|  __/
 /_/   \_\____|___|    \_/\_/ \___/|_|  |_|\_\_|  \___/|_|  \___\___|
    "#;

    eprintln!("{}", amber(logo));
    eprintln!(
        "  {} {}",
        amber_bold("Welcome to AGI Workforce"),
        format!("v{}", env!("CARGO_PKG_VERSION")).dimmed(),
    );
    eprintln!(
        "  {}\n",
        "Multi-model AI agent in your terminal.".dimmed()
    );
    eprintln!(
        "  {}\n",
        "Sign in with your preferred AI provider to get started,\n  or connect an API key for usage-based billing."
            .dimmed()
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth provider selection
// ─────────────────────────────────────────────────────────────────────────────

fn select_auth_provider() -> Result<AuthChoice> {
    let choices = &[
        "AGI Workforce                    Usage included with your subscription",
        "Provide your own API key         Pay for what you use (Anthropic, OpenAI, Google)",
        "Other providers                  ChatGPT, Claude, GitHub Copilot OAuth",
        "Skip for now                     Configure later with /login",
    ];

    let selection = dialoguer::Select::new()
        .with_prompt("  Select login method")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display auth menu")?;

    match selection {
        0 => Ok(AuthChoice::Provider("agiworkforce")),
        1 => Ok(AuthChoice::ApiKey),
        2 => Ok(AuthChoice::OtherProviders),
        _ => Ok(AuthChoice::Skip),
    }
}

fn select_other_provider() -> Result<AuthChoice> {
    let choices = &[
        "Sign in with ChatGPT             Usage included with Plus, Pro, Business, Enterprise",
        "Sign in with Claude              Usage included with Pro, Max, Team, Enterprise",
        "Sign in with GitHub Copilot      Usage included with Copilot subscription",
        "OpenRouter                       API key — access 200+ models",
        "NVIDIA NIM                       API key — NVIDIA hosted models",
        "Ollama (local)                   Connect to locally running Ollama models",
        "Back",
    ];

    let selection = dialoguer::Select::new()
        .with_prompt("  Select provider")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display provider menu")?;

    match selection {
        0 => Ok(AuthChoice::Provider("openai")),
        1 => Ok(AuthChoice::Provider("anthropic")),
        2 => Ok(AuthChoice::Provider("copilot")),
        3 => Ok(AuthChoice::Provider("openrouter")),
        4 => Ok(AuthChoice::Provider("nvidia")),
        5 => Ok(AuthChoice::Provider("ollama")),
        _ => Ok(AuthChoice::Skip),
    }
}

enum AuthChoice {
    Provider(&'static str),
    ApiKey,
    OtherProviders,
    Skip,
}

// ─────────────────────────────────────────────────────────────────────────────
// API key submenu
// ─────────────────────────────────────────────────────────────────────────────

async fn run_api_key_flow() -> Result<()> {
    crate::auth::interactive_api_key_login().await
}

// ─────────────────────────────────────────────────────────────────────────────
// Model selection (grouped by provider, latest only)
// ─────────────────────────────────────────────────────────────────────────────

struct ModelChoice {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    provider: &'static str,
    has_reasoning: bool,
}

const ONBOARDING_MODELS: &[ModelChoice] = &[
    // ── Anthropic ──
    ModelChoice {
        id: "claude-opus-4-6",
        label: "Claude Opus 4.6 (default)",
        description: "Most capable for complex work",
        provider: "anthropic",
        has_reasoning: true,
    },
    ModelChoice {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        description: "Best for everyday tasks",
        provider: "anthropic",
        has_reasoning: true,
    },
    ModelChoice {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        description: "Fastest for quick answers",
        provider: "anthropic",
        has_reasoning: false,
    },
    // ── OpenAI ──
    ModelChoice {
        id: "gpt-5.4",
        label: "GPT-5.4",
        description: "Latest frontier agentic model",
        provider: "openai",
        has_reasoning: true,
    },
    ModelChoice {
        id: "gpt-5.4-mini",
        label: "GPT-5.4 Mini",
        description: "Smaller frontier agentic model",
        provider: "openai",
        has_reasoning: true,
    },
    ModelChoice {
        id: "gpt-4.1",
        label: "GPT-4.1",
        description: "Optimized agentic coding model",
        provider: "openai",
        has_reasoning: false,
    },
    // ── Google ──
    ModelChoice {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        description: "Most capable Gemini model",
        provider: "google",
        has_reasoning: true,
    },
    ModelChoice {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Fast and efficient",
        provider: "google",
        has_reasoning: false,
    },
    // ── xAI ──
    ModelChoice {
        id: "grok-4",
        label: "Grok 4",
        description: "xAI's frontier reasoning model",
        provider: "xai",
        has_reasoning: true,
    },
];

fn select_model() -> Result<(&'static str, &'static str, bool)> {
    eprintln!("\n  {}", amber_bold("Select Model"));
    eprintln!(
        "  {}\n",
        "Access other models by running /model or in your config.toml".dimmed()
    );

    // Build display strings grouped by provider
    let mut items: Vec<String> = Vec::new();
    let mut current_provider = "";

    for m in ONBOARDING_MODELS {
        if m.provider != current_provider {
            current_provider = m.provider;
            // Provider header embedded in the item text
            let header = match m.provider {
                "anthropic" => "── Anthropic ──",
                "openai" => "── OpenAI ──",
                "google" => "── Google ──",
                "xai" => "── xAI ──",
                _ => m.provider,
            };
            items.push(header.to_string());
        }
        items.push(format!("  {}    {}", m.label, m.description));
    }

    // Map display items back to model indices (skip headers)
    let mut index_to_model: Vec<Option<usize>> = Vec::new();
    let mut current_prov = "";
    for (model_idx, m) in ONBOARDING_MODELS.iter().enumerate() {
        if m.provider != current_prov {
            current_prov = m.provider;
            index_to_model.push(None); // header row
        }
        index_to_model.push(Some(model_idx));
    }

    // Find the first actual model item (skip header)
    let default_idx = index_to_model.iter().position(|x| x.is_some()).unwrap_or(0);

    loop {
        let selection = dialoguer::Select::new()
            .with_prompt("  Choose your default model")
            .items(&items)
            .default(default_idx)
            .interact()
            .context("Failed to display model menu")?;

        if let Some(Some(midx)) = index_to_model.get(selection) {
            let chosen = &ONBOARDING_MODELS[*midx];
            return Ok((chosen.id, chosen.provider, chosen.has_reasoning));
        }
        // User selected a header row — re-show
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning / effort level
// ─────────────────────────────────────────────────────────────────────────────

fn select_reasoning_effort(model_label: &str) -> Result<String> {
    eprintln!(
        "\n  {}",
        amber_bold(&format!("Select Reasoning Level for {model_label}"))
    );
    eprintln!(
        "  {}\n",
        "Press Enter to confirm or Esc to go back.".dimmed()
    );

    let choices = &[
        "Low              Fast responses with lighter reasoning",
        "Medium           Balances speed and reasoning depth for everyday tasks",
        "High (default)   Greater reasoning depth for complex problems",
        "Extra high       Extra high reasoning depth for complex problems",
    ];

    let selection = dialoguer::Select::new()
        .with_prompt("  Reasoning effort")
        .items(choices)
        .default(2)
        .interact()
        .context("Failed to display reasoning menu")?;

    Ok(match selection {
        0 => "low".to_string(),
        1 => "medium".to_string(),
        3 => "max".to_string(),
        _ => "high".to_string(),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Config writer for model + reasoning
// ─────────────────────────────────────────────────────────────────────────────

fn update_config_model(model_id: &str, provider: &str, reasoning: Option<&str>) -> Result<()> {
    let dir = crate::config::CliConfig::config_dir()?;
    let config_path = dir.join("config.toml");
    let mut content = std::fs::read_to_string(&config_path).unwrap_or_default();

    // Update model + provider + reasoning_effort lines
    if content.contains("model =") {
        let lines: Vec<&str> = content.lines().collect();
        let updated: Vec<String> = lines
            .iter()
            .map(|line| {
                let trimmed = line.trim();
                if (trimmed.starts_with("model =") || trimmed.starts_with("# model ="))
                    && !trimmed.starts_with("model_")
                    && !trimmed.contains("fast_model")
                    && !trimmed.contains("review_model")
                    && !trimmed.contains("cloud_model")
                {
                    format!("model = \"{}\"", model_id)
                } else if trimmed.starts_with("provider =")
                    || trimmed.starts_with("# provider =")
                {
                    format!("provider = \"{}\"", provider)
                } else if trimmed.starts_with("reasoning_effort =")
                    || trimmed.starts_with("# reasoning_effort =")
                {
                    if let Some(effort) = reasoning {
                        format!("reasoning_effort = \"{}\"", effort)
                    } else {
                        line.to_string()
                    }
                } else {
                    line.to_string()
                }
            })
            .collect();
        content = updated.join("\n");
    } else if content.contains("[default]") {
        let reasoning_line = reasoning
            .map(|r| format!("\nreasoning_effort = \"{}\"", r))
            .unwrap_or_default();
        content = content.replace(
            "[default]",
            &format!(
                "[default]\nmodel = \"{}\"\nprovider = \"{}\"{}",
                model_id, provider, reasoning_line
            ),
        );
    }

    // If reasoning_effort wasn't in the file, append it under [default]
    if let Some(effort) = reasoning {
        if !content.contains("reasoning_effort =") && content.contains("[default]") {
            content = content.replace(
                "[default]",
                &format!("[default]\nreasoning_effort = \"{}\"", effort),
            );
        }
    }

    std::fs::write(&config_path, content)?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety notes + approval mode
// ─────────────────────────────────────────────────────────────────────────────

fn print_safety_notes() {
    eprintln!("\n  {}", amber_bold("Before you start:"));
    eprintln!("  {}", "─".repeat(50).dimmed());
    eprintln!();
    eprintln!(
        "  {}  AGI Workforce can make mistakes.",
        "•".yellow()
    );
    eprintln!(
        "      {}",
        "Review the code it writes and commands it runs.".dimmed()
    );
    eprintln!();
    eprintln!(
        "  {}  Tool calls (file edits, shell commands) require your approval.",
        "•".yellow()
    );
    eprintln!(
        "      {}",
        "Use Shift+Tab to cycle through autonomy levels.".dimmed()
    );
    eprintln!();
}

fn select_approval_mode() -> Result<String> {
    let choices = &[
        "Suggest        Ask before every tool call (safest, recommended)",
        "Auto-edit      Auto-approve file edits, ask for shell commands",
        "Full-auto      Auto-approve everything (use with caution)",
    ];

    eprintln!(
        "  {}\n",
        "Decide how much autonomy you want to grant:".dimmed()
    );

    let selection = dialoguer::Select::new()
        .with_prompt("  Default interaction mode")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display mode menu")?;

    Ok(match selection {
        1 => "auto-edit".to_string(),
        2 => "full-auto".to_string(),
        _ => "suggest".to_string(),
    })
}

/// Update approval_mode in ~/.agiworkforce/config.toml if non-default.
fn update_config_approval_mode(mode: &str) -> Result<()> {
    if mode == "suggest" {
        return Ok(()); // Default, no need to write
    }

    let dir = crate::config::CliConfig::config_dir()?;
    let config_path = dir.join("config.toml");
    let mut content = std::fs::read_to_string(&config_path).unwrap_or_default();

    // Replace or append the approval_mode line under [default]
    if content.contains("approval_mode") {
        // Replace existing line
        let lines: Vec<&str> = content.lines().collect();
        let updated: Vec<String> = lines
            .iter()
            .map(|line| {
                if line.trim().starts_with("approval_mode")
                    || line.trim().starts_with("# approval_mode")
                {
                    format!("approval_mode = \"{}\"", mode)
                } else {
                    line.to_string()
                }
            })
            .collect();
        content = updated.join("\n");
    } else if content.contains("[default]") {
        // Append after [default] section
        content = content.replace(
            "[default]",
            &format!("[default]\napproval_mode = \"{}\"", mode),
        );
    } else {
        // Append at end
        content.push_str(&format!("\n[default]\napproval_mode = \"{}\"\n", mode));
    }

    std::fs::write(&config_path, content)?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Wait for Enter
// ─────────────────────────────────────────────────────────────────────────────

fn wait_for_enter() {
    eprintln!(
        "\n  {} {}",
        amber_bold("Press Enter to start..."),
        "(or Ctrl+C to quit)".dimmed()
    );
    let _ = dialoguer::Input::<String>::new()
        .allow_empty(true)
        .interact_text();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main onboarding entry point
// ─────────────────────────────────────────────────────────────────────────────

/// Run the interactive first-run onboarding wizard.
/// Returns `Ok(true)` if completed, `Ok(false)` if skipped/interrupted.
pub async fn run_onboarding() -> Result<bool> {
    // Step 1: Welcome banner
    print_welcome_banner();

    // Step 2: Auth selection
    let auth_choice = match select_auth_provider() {
        Ok(choice) => choice,
        Err(_) => {
            // Ctrl+C or error — don't write marker, re-run next time
            eprintln!("\n  {}", "Setup interrupted. Run again to continue.".dimmed());
            return Ok(false);
        }
    };

    // Step 3: Execute auth flow
    let auth_choice = match auth_choice {
        AuthChoice::OtherProviders => match select_other_provider() {
            Ok(choice) => choice,
            Err(_) => AuthChoice::Skip,
        },
        other => other,
    };

    match auth_choice {
        AuthChoice::Provider(provider) => {
            if let Err(e) = crate::auth::interactive_login_for_provider(Some(provider)).await {
                eprintln!(
                    "\n  {} Authentication failed: {}",
                    "⚠".yellow().bold(),
                    e
                );
                eprintln!(
                    "  {}",
                    "You can try again later with /login or `agiworkforce login`.".dimmed()
                );
            }
        }
        AuthChoice::ApiKey => {
            if let Err(e) = run_api_key_flow().await {
                eprintln!(
                    "\n  {} API key setup failed: {}",
                    "⚠".yellow().bold(),
                    e
                );
                eprintln!(
                    "  {}",
                    "You can try again later with /login or `agiworkforce login`.".dimmed()
                );
            }
        }
        AuthChoice::OtherProviders | AuthChoice::Skip => {
            eprintln!(
                "\n  {} Skipped authentication.",
                "→".dimmed()
            );
            eprintln!(
                "  {}",
                "Use /login or `agiworkforce login` to authenticate later.".dimmed()
            );
        }
    }

    // Step 4: Model selection
    match select_model() {
        Ok((model_id, provider, has_reasoning)) => {
            // Step 4b: Reasoning effort (if model supports it)
            let reasoning = if has_reasoning {
                select_reasoning_effort(model_id).ok()
            } else {
                None
            };

            if let Err(e) =
                update_config_model(model_id, provider, reasoning.as_deref())
            {
                eprintln!(
                    "  {} Failed to save model selection: {}",
                    "⚠".yellow().bold(),
                    e
                );
            } else {
                eprintln!(
                    "\n  {} Using {} {}",
                    "✓".green().bold(),
                    amber_bold(model_id),
                    reasoning
                        .as_ref()
                        .map(|r| format!("with {} reasoning", r))
                        .unwrap_or_default()
                        .dimmed()
                );
            }
        }
        Err(_) => {
            eprintln!(
                "\n  {} Using default model (claude-opus-4-6).",
                "→".dimmed()
            );
        }
    }

    // Step 5: Safety notes + approval mode
    print_safety_notes();

    let approval_mode = match select_approval_mode() {
        Ok(mode) => mode,
        Err(_) => {
            eprintln!("\n  {}", "Setup interrupted. Run again to continue.".dimmed());
            return Ok(false);
        }
    };

    if let Err(e) = update_config_approval_mode(&approval_mode) {
        eprintln!(
            "  {} Failed to save approval mode: {}",
            "⚠".yellow().bold(),
            e
        );
    }

    // Step 6: Wait for Enter
    wait_for_enter();

    // Step 7: Mark setup complete
    if let Err(e) = mark_setup_complete() {
        eprintln!(
            "  Warning: could not write setup marker: {}",
            e
        );
    }

    eprintln!();
    Ok(true)
}
