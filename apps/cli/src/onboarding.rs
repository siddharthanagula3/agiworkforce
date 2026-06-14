use anyhow::{bail, Context, Result};

use crate::model_catalog;
use crate::project_registry::ProjectRegistry;
use crate::project_scope::resolve_project_scope;
use crate::terminal_style as ts;

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

fn multi_model_fallback_example() -> String {
    let primary = model_catalog::default_model().to_string();
    let fallback = model_catalog::fast_completion_model("openai");
    let local = model_catalog::models_for("ollama")
        .first()
        .map(|m| m.id.clone())
        .unwrap_or_else(|| fallback.clone());
    format!("-m {primary},{fallback},{local}")
}

fn local_pull_hint() -> String {
    match model_catalog::models_for("ollama").first() {
        Some(model) => format!(
            "pull a model (for example, `ollama pull {}`), or load a model in LM Studio.",
            model.id
        ),
        None => "pull a model in Ollama or load one in LM Studio.".to_string(),
    }
}

fn print_welcome_banner() {
    let logo = r#"
     _    ____ ___  __        __         _     __
    / \  / ___|_ _| \ \      / /__  _ __| | __/ _| ___  _ __ ___ ___
   / _ \| |  _ | |   \ \ /\ / / _ \| '__| |/ / |_ / _ \| '__/ __/ _ \
  / ___ \ |_| || |    \ V  V / (_) | |  |   <|  _| (_) | | | (_|  __/
 /_/   \_\____|___|    \_/\_/ \___/|_|  |_|\_\_|  \___/|_|  \___\___|
    "#;

    eprintln!("{}", ts::brand(logo));
    eprintln!(
        "  {} {}",
        ts::brand_header("Welcome to AGI"),
        ts::muted(format!("v{}", env!("CARGO_PKG_VERSION"))),
    );
    eprintln!(
        "  {}\n",
        ts::muted("Multi-model AI agent in your terminal.")
    );
    eprintln!("  {}", ts::muted("What makes us different:"));
    eprintln!(
        "  {}  {}",
        ts::accent("✦"),
        ts::muted("Live cost HUD — see tokens, $, and context % in real time")
    );
    eprintln!(
        "  {}  {}",
        ts::accent("✦"),
        ts::muted("JSON event stream — `--json-events` for CI / dashboards / automation")
    );
    eprintln!(
        "  {}  {}",
        ts::accent("✦"),
        ts::muted(format!(
            "Multi-model fallback — `{}`",
            multi_model_fallback_example()
        ))
    );
    eprintln!(
        "  {}  {}\n",
        ts::accent("✦"),
        ts::muted("Session replay — `agi session fork <id> --at-turn N --as <name>`")
    );
    eprintln!(
        "  {}\n",
        ts::muted(
            "Sign in with your preferred AI provider to get started,\n  or connect an API key for usage-based billing."
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth provider selection
// ─────────────────────────────────────────────────────────────────────────────

fn maybe_trust_current_directory() -> Result<bool> {
    let cwd = match std::env::current_dir() {
        Ok(cwd) => cwd,
        Err(_) => return Ok(true),
    };
    let target = resolve_project_scope(&cwd);
    let agiworkforce_home = crate::config::CliConfig::config_dir()?;
    let registry = ProjectRegistry::load(&agiworkforce_home).unwrap_or_default();
    let target_key = target.to_string_lossy().to_string();

    let trust_already_decided = registry
        .projects
        .get(&target_key)
        .is_some_and(|entry| entry.trust_level == "trusted");
    if trust_already_decided {
        return Ok(true);
    }

    eprintln!("\n  {}", ts::brand_header("Trust This Directory"));
    eprintln!(
        "  {}\n",
        ts::muted("Working with untrusted code comes with higher prompt-injection risk.")
    );
    eprintln!(
        "  {} {}",
        ts::warning("•"),
        ts::muted(format!("Current directory: {}", cwd.display()))
    );
    if target != cwd {
        eprintln!(
            "  {} {}",
            ts::warning("•"),
            ts::muted(format!(
                "Trust will apply to repository root: {}",
                target.display()
            ))
        );
    }
    eprintln!();

    let choices = &["Yes, continue", "No, quit"];
    let selection = dialoguer::Select::new()
        .with_prompt("  Do you trust the contents of this directory?")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display trust prompt")?;

    if selection != 0 {
        let mut registry = registry;
        if let Err(err) = registry
            .register_project(&target, "untrusted")
            .and_then(|()| registry.save(&agiworkforce_home))
        {
            eprintln!(
                "  {} Failed to record trust decision: {}",
                ts::warning_header("⚠"),
                err
            );
        }
        eprintln!(
            "\n  {}",
            ts::muted("Setup canceled. Re-run onboarding when you trust this directory.")
        );
        return Ok(false);
    }

    let mut registry = registry;
    if let Err(err) = registry
        .register_project(&target, "trusted")
        .and_then(|()| registry.save(&agiworkforce_home))
    {
        eprintln!(
            "\n  {} Failed to save trust decision: {}",
            ts::warning_header("⚠"),
            err
        );
        eprintln!(
            "  {}",
            ts::muted("Continuing anyway. You can set trust later in config.toml.")
        );
    } else {
        eprintln!(
            "\n  {} Trusted {}",
            ts::success_header("✓"),
            ts::brand_header(target.display().to_string())
        );
    }

    Ok(true)
}

fn select_auth_provider() -> Result<AuthChoice> {
    let choices = &[
        "Local model                      Run AI locally — no account required",
        "Provide your own API key         Pay for what you use (Anthropic, OpenAI, Google)",
        "Other providers                  ChatGPT, Anthropic, GitHub Copilot OAuth",
        "AGI cloud                        Waitlist only — join at agiworkforce.com",
        "Skip for now                     Configure later with /login",
    ];

    let selection = dialoguer::Select::new()
        .with_prompt("  Select login method")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display auth menu")?;

    Ok(auth_choice_for_index(selection))
}

fn select_other_provider() -> Result<AuthChoice> {
    let choices = &[
        "Sign in with ChatGPT             Usage included with Plus, Pro, Business, Enterprise",
        "Sign in with Anthropic           Usage included with Pro, Max, Team, Enterprise",
        "Sign in with GitHub Copilot      Usage included with Copilot subscription",
        "OpenRouter                       API key — access 200+ models",
        "NVIDIA NIM                       API key — NVIDIA hosted models",
        "Ollama (local)                   Connect to locally running Ollama models",
        "LM Studio (local)                Connect to LM Studio's local OpenAI-compatible server",
        "Back",
    ];

    let selection = dialoguer::Select::new()
        .with_prompt("  Select provider")
        .items(choices)
        .default(0)
        .interact()
        .context("Failed to display provider menu")?;

    Ok(other_provider_choice_for_index(selection))
}

/// Choose a local model for the local-only path. Returns
/// `(model_id, provider, has_reasoning)` to match `select_model`, so a
/// local-only first run never lands on a cloud default it cannot run offline.
async fn select_local_model(preferred_provider: Option<&str>) -> Result<(String, String, bool)> {
    let config = crate::config::CliConfig::load_merged().unwrap_or_default();
    let probes = crate::local_models::discover_all(&config).await;
    let all_discovered = crate::local_models::discovered_models(&probes);
    let discovered: Vec<_> = match preferred_provider {
        Some(provider) => all_discovered
            .iter()
            .filter(|model| model.provider == provider)
            .cloned()
            .collect(),
        None => all_discovered.clone(),
    };
    if !discovered.is_empty() {
        let labels: Vec<String> = discovered
            .iter()
            .map(|m| format!("{}  ({}, {})", m.id, m.provider, m.base_url))
            .collect();
        let selection = dialoguer::Select::new()
            .with_prompt("  Choose an installed local model")
            .items(&labels)
            .default(0)
            .interact()
            .context("Failed to display local model menu")?;
        let chosen = &discovered[selection];
        return Ok((chosen.id.clone(), chosen.provider.clone(), false));
    }

    eprintln!(
        "\n  {}",
        ts::muted(crate::local_models::format_probe_report(&probes))
    );

    if matches!(preferred_provider, Some("lmstudio")) {
        let model_id: String = dialoguer::Input::new()
            .with_prompt("  Enter the model ID loaded in LM Studio")
            .interact_text()
            .context("Failed to read LM Studio model ID")?;
        let model_id = model_id.trim();
        if model_id.is_empty() {
            bail!("LM Studio model ID must not be empty");
        }
        return Ok((model_id.to_string(), "lmstudio".to_string(), false));
    }

    let suggested_pull = crate::model_catalog::models_for("ollama")
        .first()
        .map(|m| m.id.as_str())
        .unwrap_or("an Ollama model");
    eprintln!(
        "  {}",
        ts::muted(format!(
            "No installed Ollama models were detected. Start Ollama and run `ollama pull {suggested_pull}`, or enter an installed model name."
        ))
    );
    let model_id: String = dialoguer::Input::new()
        .with_prompt("  Enter your installed Ollama model name")
        .interact_text()
        .context("Failed to read Ollama model name")?;
    let model_id = model_id.trim();
    if model_id.is_empty() {
        bail!("Ollama model name must not be empty");
    }
    Ok((model_id.to_string(), "ollama".to_string(), false))
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum AuthChoice {
    /// A cloud provider that requires an interactive login (OAuth/API key).
    Provider(&'static str),
    /// A LOCAL provider (Ollama/LM Studio) — runs on-device, needs no account,
    /// and must NEVER fall through to the cloud login menu.
    Local(&'static str),
    /// A named provider that stores a BYOK credential in auth.json.
    ApiKeyProvider(&'static str),
    ApiKey,
    OtherProviders,
    Skip,
}

/// Pure mapping for the primary login menu (`select_auth_provider`). Index 0 is
/// "Local model — no account required" and resolves to a LOCAL provider, not a
/// cloud login (the v1 local-only first-run must not demand an account).
fn auth_choice_for_index(selection: usize) -> AuthChoice {
    match selection {
        0 => AuthChoice::Local("auto"),
        1 => AuthChoice::ApiKey,
        2 => AuthChoice::OtherProviders,
        3 => AuthChoice::Provider("agiworkforce"),
        _ => AuthChoice::Skip,
    }
}

fn local_provider_preference(auth_choice: &AuthChoice) -> Option<&'static str> {
    match auth_choice {
        AuthChoice::Local("auto") => None,
        AuthChoice::Local(provider) => Some(*provider),
        _ => None,
    }
}

/// Pure mapping for the "Other providers" submenu (`select_other_provider`).
/// Local submenu entries must resolve to LOCAL providers, never cloud login.
fn other_provider_choice_for_index(selection: usize) -> AuthChoice {
    match selection {
        0 => AuthChoice::Provider("openai"),
        1 => AuthChoice::Provider("anthropic"),
        2 => AuthChoice::Provider("copilot"),
        3 => AuthChoice::ApiKeyProvider("openrouter"),
        4 => AuthChoice::ApiKeyProvider("nvidia"),
        5 => AuthChoice::Local("ollama"),
        6 => AuthChoice::Local("lmstudio"),
        _ => AuthChoice::Skip,
    }
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
    id: String,
    label: String,
    description: String,
    provider: String,
    has_reasoning: bool,
}

/// Providers shown in the default onboarding model picker, in display order.
const DEFAULT_ONBOARDING_PROVIDERS: &[&str] = &["anthropic", "openai", "google"];

/// Build the onboarding model list from the bundled catalog.
///
/// For each provider in ONBOARDING_PROVIDERS we select up to 3 models using this
/// priority order:
///   1. qualityTier == "best"   → shown as the flagship option.
///   2. qualityTier == "balanced" → shown as the everyday option.
///   3. qualityTier == "fast"   → shown as the quick-answers option.
///
/// Model descriptions are derived from qualityTier so they stay accurate as the
/// catalog evolves — no hardcoded model IDs or descriptions.
fn onboarding_models(providers: &[&str]) -> Vec<ModelChoice> {
    let default_id = model_catalog::default_model();
    let mut choices: Vec<ModelChoice> = Vec::new();

    for &provider in providers {
        let mut provider_models = model_catalog::models_for(provider);
        // Exclude deprecated / inactive models.
        provider_models.retain(|m| m.status == "active");

        for tier in ["best", "balanced", "fast"] {
            // Find the first active model for this provider+tier from the catalog.
            let candidate = provider_models.iter().find(|m| {
                model_catalog::quality_tier_for_model(&m.id)
                    .as_deref()
                    .unwrap_or("")
                    == tier
            });
            if let Some(model) = candidate {
                let description = match tier {
                    "best" => "Most capable — complex work and research".to_string(),
                    "fast" => "Fastest — quick answers and simple tasks".to_string(),
                    _ => "Everyday tasks — quality and speed balanced".to_string(),
                };
                let label = if model.id == default_id {
                    format!("{} (default)", model.display_name)
                } else {
                    model.display_name.clone()
                };
                choices.push(ModelChoice {
                    id: model.id.clone(),
                    label,
                    description,
                    provider: model.provider.clone(),
                    has_reasoning: model.supports_reasoning,
                });
            }
        }
        if choices.iter().all(|choice| choice.provider != provider) {
            choices.extend(provider_models.iter().take(3).map(|model| ModelChoice {
                id: model.id.clone(),
                label: if model.id == default_id {
                    format!("{} (default)", model.display_name)
                } else {
                    model.display_name.clone()
                },
                description: "Catalog model — provider-supplied metadata".to_string(),
                provider: model.provider.clone(),
                has_reasoning: model.supports_reasoning,
            }));
        }
    }
    choices
}

fn provider_header(provider: &str) -> String {
    match provider {
        "anthropic" => "── Anthropic ──".to_string(),
        "openai" => "── OpenAI ──".to_string(),
        "google" => "── Google ──".to_string(),
        "xai" => "── xAI ──".to_string(),
        "openrouter" => "── OpenRouter ──".to_string(),
        "nvidia" => "── NVIDIA NIM ──".to_string(),
        "ollama-cloud" => "── Ollama Cloud ──".to_string(),
        "lmstudio" => "── LM Studio ──".to_string(),
        other => format!("── {other} ──"),
    }
}

fn model_picker_providers_for_auth_choice(auth_choice: &AuthChoice) -> Vec<&'static str> {
    match auth_choice {
        AuthChoice::Local(provider) | AuthChoice::ApiKeyProvider(provider) => vec![*provider],
        AuthChoice::Provider(provider) if is_catalog_provider(provider) => {
            vec![*provider]
        }
        _ => DEFAULT_ONBOARDING_PROVIDERS.to_vec(),
    }
}

fn is_catalog_provider(provider: &str) -> bool {
    model_catalog::providers()
        .iter()
        .any(|known| known.eq_ignore_ascii_case(provider))
}

fn select_model_for_providers(providers: &[&str]) -> Result<(String, String, bool)> {
    eprintln!("\n  {}", ts::brand_header("Select Model"));
    eprintln!(
        "  {}\n",
        ts::muted("Access other models by running /model or in your config.toml")
    );
    let onboarding_models = onboarding_models(providers);
    if onboarding_models.is_empty() {
        bail!(
            "No active onboarding models are available for {}",
            providers.join(", ")
        );
    }

    // Build display strings grouped by provider
    let mut items: Vec<String> = Vec::new();
    let mut current_provider = "";

    for m in &onboarding_models {
        if m.provider != current_provider {
            current_provider = &m.provider;
            // Provider header embedded in the item text
            items.push(provider_header(&m.provider));
        }
        items.push(format!("  {}    {}", m.label, m.description));
    }

    // Map display items back to model indices (skip headers)
    let mut index_to_model: Vec<Option<usize>> = Vec::new();
    let mut current_prov = "";
    for (model_idx, m) in onboarding_models.iter().enumerate() {
        if m.provider != current_prov {
            current_prov = &m.provider;
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
            let chosen = &onboarding_models[*midx];
            return Ok((
                chosen.id.clone(),
                chosen.provider.clone(),
                chosen.has_reasoning,
            ));
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
        ts::brand_header(format!("Select Reasoning Level for {model_label}"))
    );
    eprintln!(
        "  {}\n",
        ts::muted("Press Enter to confirm or Esc to go back.")
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

pub(crate) fn update_config_model(
    model_id: &str,
    provider: &str,
    reasoning: Option<&str>,
) -> Result<()> {
    let dir = crate::config::CliConfig::config_dir()?;
    std::fs::create_dir_all(&dir)?;
    let config_path = dir.join("config.toml");
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    let mut root: toml::Table = if content.trim().is_empty() {
        toml::Table::new()
    } else {
        toml::from_str(&content)
            .with_context(|| format!("Failed to parse {}", config_path.display()))?
    };

    let default_value = root
        .entry("default".to_string())
        .or_insert_with(|| toml::Value::Table(toml::Table::new()));
    if !default_value.is_table() {
        *default_value = toml::Value::Table(toml::Table::new());
    }

    let default = default_value
        .as_table_mut()
        .context("Failed to update [default] config table")?;
    default.insert(
        "model".to_string(),
        toml::Value::String(model_id.to_string()),
    );
    default.insert(
        "provider".to_string(),
        toml::Value::String(provider.to_string()),
    );
    match reasoning {
        Some(effort) => {
            default.insert(
                "reasoning_effort".to_string(),
                toml::Value::String(effort.to_string()),
            );
        }
        None => {
            default.remove("reasoning_effort");
        }
    }

    let rendered = toml::to_string_pretty(&toml::Value::Table(root))
        .context("Failed to serialize config.toml")?;
    std::fs::write(&config_path, rendered)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety notes + approval mode
// ─────────────────────────────────────────────────────────────────────────────

fn print_safety_notes() {
    eprintln!("\n  {}", ts::brand_header("Before you start:"));
    eprintln!("  {}", ts::muted("─".repeat(50)));
    eprintln!();
    eprintln!("  {}  AGI can make mistakes.", ts::warning("•"));
    eprintln!(
        "      {}",
        ts::muted("Review the code it writes and commands it runs.")
    );
    eprintln!();
    eprintln!(
        "  {}  Tool calls (file edits, shell commands) require your approval.",
        ts::warning("•")
    );
    eprintln!(
        "      {}",
        ts::muted("Use Shift+Tab to cycle through autonomy levels.")
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
        ts::muted("Decide how much autonomy you want to grant:")
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
    // Match the hardening in `update_config_model`: this path can create or
    // rewrite config.toml, so restrict it to owner read/write (0o600) instead
    // of leaving world-readable default permissions.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Wait for Enter
// ─────────────────────────────────────────────────────────────────────────────

fn wait_for_enter() {
    eprintln!(
        "\n  {} {}",
        ts::brand_header("Press Enter to start..."),
        ts::muted("(or Ctrl+C to quit)")
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

    // Step 2: Trust current directory
    match maybe_trust_current_directory() {
        Ok(true) => {}
        Ok(false) => return Ok(false),
        Err(_) => {
            eprintln!(
                "\n  {}",
                ts::muted("Setup interrupted. Run again to continue.")
            );
            return Ok(false);
        }
    }

    // Step 3: Auth selection
    let auth_choice = match select_auth_provider() {
        Ok(choice) => choice,
        Err(_) => {
            // Ctrl+C or error — don't write marker, re-run next time
            eprintln!(
                "\n  {}",
                ts::muted("Setup interrupted. Run again to continue.")
            );
            return Ok(false);
        }
    };

    // Step 4: Execute auth flow
    let auth_choice = match auth_choice {
        AuthChoice::OtherProviders => match select_other_provider() {
            Ok(choice) => choice,
            Err(_) => AuthChoice::Skip,
        },
        other => other,
    };

    let chose_local = matches!(&auth_choice, AuthChoice::Local(_));
    let preferred_local_provider = local_provider_preference(&auth_choice);
    let model_picker_providers = model_picker_providers_for_auth_choice(&auth_choice);

    match auth_choice {
        AuthChoice::Local(_provider) => {
            // Local-only path: no account, no cloud login. The cloud login menu
            // must never appear here (the v1 local-only first-run bug).
            eprintln!(
                "\n  {} Local model — no account needed.",
                ts::success_header("✓")
            );
            eprintln!(
                "  {}",
                ts::muted(format!(
                    "Runs on your machine. Start Ollama or LM Studio, then {}",
                    local_pull_hint()
                ))
            );
        }
        AuthChoice::Provider(provider) => {
            if let Err(e) = crate::auth::interactive_login_for_provider(Some(provider)).await {
                eprintln!(
                    "\n  {} Authentication failed: {}",
                    ts::warning_header("⚠"),
                    e
                );
                eprintln!(
                    "  {}",
                    ts::muted("You can try again later with /login or `agi login`.")
                );
            }
        }
        AuthChoice::ApiKeyProvider(provider) => {
            if let Err(e) = crate::auth::interactive_api_key_login_for_provider(provider).await {
                eprintln!(
                    "\n  {} API key setup failed: {}",
                    ts::warning_header("⚠"),
                    e
                );
                eprintln!(
                    "  {}",
                    ts::muted("You can try again later with /login or `agi login`.")
                );
            }
        }
        AuthChoice::ApiKey => {
            if let Err(e) = run_api_key_flow().await {
                eprintln!(
                    "\n  {} API key setup failed: {}",
                    ts::warning_header("⚠"),
                    e
                );
                eprintln!(
                    "  {}",
                    ts::muted("You can try again later with /login or `agi login`.")
                );
            }
        }
        AuthChoice::OtherProviders | AuthChoice::Skip => {
            eprintln!("\n  {} Skipped authentication.", ts::muted("→"));
            eprintln!(
                "  {}",
                ts::muted("Use /login or `agi login` to authenticate later.")
            );
        }
    }

    // Step 5: Model selection — local choice picks a local model so a local-only
    // user never ends up with a cloud default they cannot run offline.
    let model_selection = if chose_local {
        select_local_model(preferred_local_provider).await
    } else {
        select_model_for_providers(&model_picker_providers)
    };
    match model_selection {
        Ok((model_id, provider, has_reasoning)) => {
            // Step 5b: Reasoning effort (if model supports it)
            let reasoning = if has_reasoning {
                select_reasoning_effort(&model_id).ok()
            } else {
                None
            };

            if let Err(e) = update_config_model(&model_id, &provider, reasoning.as_deref()) {
                eprintln!(
                    "  {} Failed to save model selection: {}",
                    ts::warning_header("⚠"),
                    e
                );
            } else {
                eprintln!(
                    "\n  {} Using {} {}",
                    ts::success_header("✓"),
                    ts::brand_header(&model_id),
                    ts::muted(
                        reasoning
                            .as_ref()
                            .map(|r| format!("with {} reasoning", r))
                            .unwrap_or_default()
                    )
                );
            }
        }
        Err(_) if chose_local => {
            eprintln!("\n  {} No local model selected.", ts::muted("→"));
            eprintln!(
                "  {}",
                ts::muted("Leaving the existing model config unchanged. Run `agi models scan` and `agi models set <model>` after starting Ollama or LM Studio.")
            );
        }
        Err(_) => {
            eprintln!(
                "\n  {} Using default model ({}).",
                ts::muted("→"),
                model_catalog::default_model()
            );
        }
    }

    // Step 6: Safety notes + approval mode
    print_safety_notes();

    let approval_mode = match select_approval_mode() {
        Ok(mode) => mode,
        Err(_) => {
            eprintln!(
                "\n  {}",
                ts::muted("Setup interrupted. Run again to continue.")
            );
            return Ok(false);
        }
    };

    if let Err(e) = update_config_approval_mode(&approval_mode) {
        eprintln!(
            "  {} Failed to save approval mode: {}",
            ts::warning_header("⚠"),
            e
        );
    }

    // Step 7: Wait for Enter
    wait_for_enter();

    // Step 8: Mark setup complete
    if let Err(e) = mark_setup_complete() {
        eprintln!("  Warning: could not write setup marker: {}", e);
    }

    let hcfg = crate::hooks::load_hooks().unwrap_or_default();
    crate::hooks::run_hooks(
        &hcfg,
        crate::hooks::HookEvent::Setup,
        &crate::hooks::HookInput {
            event: "Setup".to_string(),
            session_id: None,
            model: None,
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: Some("first-run setup complete".to_string()),
            tool_execution: None,
        },
    )
    .await;

    eprintln!();
    Ok(true)
}

#[cfg(test)]
mod local_first_run_tests {
    use super::{auth_choice_for_index, other_provider_choice_for_index, AuthChoice};

    #[test]
    fn local_model_choice_resolves_to_local_not_cloud_login() {
        // Primary menu index 0 = "Local model — no account required".
        assert_eq!(auth_choice_for_index(0), AuthChoice::Local("auto"));
        // It must NOT route into any cloud login path (the v1 first-run bug).
        assert!(!matches!(
            auth_choice_for_index(0),
            AuthChoice::Provider(_) | AuthChoice::ApiKey | AuthChoice::OtherProviders
        ));
    }

    #[test]
    fn other_providers_ollama_entry_resolves_to_local() {
        // "Other providers" submenu index 5 = "Ollama (local)".
        assert_eq!(
            other_provider_choice_for_index(5),
            AuthChoice::Local("ollama")
        );
    }

    #[test]
    fn other_providers_lmstudio_entry_resolves_to_local() {
        assert_eq!(
            other_provider_choice_for_index(6),
            AuthChoice::Local("lmstudio")
        );
    }

    #[test]
    fn cloud_providers_still_resolve_to_provider_login() {
        assert_eq!(
            auth_choice_for_index(3),
            AuthChoice::Provider("agiworkforce")
        );
        assert_eq!(
            other_provider_choice_for_index(0),
            AuthChoice::Provider("openai")
        );
        assert_eq!(
            other_provider_choice_for_index(1),
            AuthChoice::Provider("anthropic")
        );
        assert_eq!(
            other_provider_choice_for_index(2),
            AuthChoice::Provider("copilot")
        );
    }

    #[test]
    fn api_key_providers_do_not_route_to_oauth_login() {
        assert_eq!(
            other_provider_choice_for_index(3),
            AuthChoice::ApiKeyProvider("openrouter")
        );
        assert_eq!(
            other_provider_choice_for_index(4),
            AuthChoice::ApiKeyProvider("nvidia")
        );
    }

    #[test]
    fn local_choice_carries_a_local_provider_not_a_cloud_default() {
        match auth_choice_for_index(0) {
            AuthChoice::Local(p) => assert_eq!(p, "auto"),
            other => panic!("expected Local, got {other:?}"),
        }
    }
}
