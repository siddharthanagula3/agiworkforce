use colored::Colorize;
use dialoguer::{Input, Select};

use crate::config::CliConfig;
use crate::output;

pub(super) fn handle_setup(config: &mut CliConfig) {
    let providers = vec![
        "anthropic",
        "openai",
        "google",
        "mistral",
        "xai",
        "deepseek",
        "ollama",
    ];

    let selection = Select::new()
        .with_prompt("Select provider to configure")
        .items(&providers)
        .interact_opt();

    let idx = match selection {
        Ok(Some(idx)) => idx,
        Ok(None) => {
            output::print_info("Setup cancelled.");
            return;
        }
        Err(e) => {
            output::print_error(&format!("Selection error: {}", e));
            return;
        }
    };

    let selected_provider = providers[idx];

    if selected_provider == "ollama" {
        let current_url = config
            .base_url("ollama")
            .unwrap_or_else(|| "http://localhost:11434".to_string());

        let url_result: std::result::Result<String, _> = Input::new()
            .with_prompt("Ollama base URL")
            .default(current_url)
            .interact_text();

        match url_result {
            Ok(url) => {
                if let Some(pc) = config.providers.get_mut("ollama") {
                    pc.base_url = Some(url);
                }
                if let Err(e) = config.save() {
                    output::print_error(&format!("Failed to save config: {:#}", e));
                } else {
                    output::print_info("Ollama configuration saved.");
                }
            }
            Err(e) => {
                output::print_error(&format!("Input error: {}", e));
            }
        }
        return;
    }

    let env_var = config
        .providers
        .get(selected_provider)
        .and_then(|p| p.api_key_env.as_deref())
        .unwrap_or("UNKNOWN");

    eprintln!(
        "{}",
        format!(
            "Enter API key for {} (will be set as {} for this session):",
            selected_provider, env_var
        )
        .dimmed()
    );

    let key_result: std::result::Result<String, _> =
        Input::new().with_prompt("API key").interact_text();

    match key_result {
        Ok(key) => {
            if key.is_empty() {
                output::print_warn("Empty key — skipping.");
                return;
            }

            std::env::set_var(env_var, &key);
            output::print_info(&format!(
                "{} set for this session. To persist, add to your shell profile:\n  export {}={}",
                env_var, env_var, key
            ));
        }
        Err(e) => {
            output::print_error(&format!("Input error: {}", e));
        }
    }
}

pub(super) fn handle_logout() {
    match crate::auth::load_auth() {
        Ok(mut store) => {
            if store.entries.is_empty() {
                output::print_info("No subscription auth to clear.");
                return;
            }
            let count = store.entries.len();
            store.entries.clear();
            match crate::auth::save_auth(&store) {
                Ok(()) => {
                    output::print_info(&format!(
                        "Cleared {} subscription auth {}.",
                        count,
                        if count == 1 { "entry" } else { "entries" },
                    ));
                }
                Err(e) => {
                    output::print_error(&format!("Failed to save auth store: {:#}", e));
                }
            }
        }
        Err(_) => {
            output::print_info("No subscription auth to clear.");
        }
    }
}
