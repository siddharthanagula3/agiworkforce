//! Local agent registry I/O: load/save agents.json + discovery.

use anyhow::{Context, Result};
use colored::Colorize;

use crate::config::CliConfig;

use super::protocol::AgentCard;

const AGENTS_REGISTRY_FILENAME: &str = "agents.json";

/// Load the local agent registry from `~/.agiworkforce/agents.json`.
///
/// Returns the list of known agent cards. If the file does not exist or
/// is malformed, returns an empty list (with a warning printed to stderr).
pub fn load_local_registry() -> Vec<AgentCard> {
    let path = match CliConfig::config_dir() {
        Ok(dir) => dir.join(AGENTS_REGISTRY_FILENAME),
        Err(_) => return Vec::new(),
    };

    if !path.exists() {
        return Vec::new();
    }

    match std::fs::read_to_string(&path) {
        Ok(contents) => match serde_json::from_str::<Vec<AgentCard>>(&contents) {
            Ok(cards) => cards,
            Err(e) => {
                eprintln!(
                    "  {} Failed to parse {}: {}",
                    "Warning:".yellow(),
                    path.display(),
                    e
                );
                Vec::new()
            }
        },
        Err(e) => {
            eprintln!(
                "  {} Failed to read {}: {}",
                "Warning:".yellow(),
                path.display(),
                e
            );
            Vec::new()
        }
    }
}

/// Save the local agent registry to `~/.agiworkforce/agents.json`.
pub fn save_local_registry(cards: &[AgentCard]) -> Result<()> {
    let dir = CliConfig::config_dir()?;
    std::fs::create_dir_all(&dir).context("Failed to create config directory")?;

    let path = dir.join(AGENTS_REGISTRY_FILENAME);
    let json = serde_json::to_string_pretty(cards)?;
    std::fs::write(&path, json).context("Failed to write agents registry")?;
    Ok(())
}

/// Discover agents by combining the local registry with network probing.
///
/// For each locally registered agent, attempts an HTTP GET on its endpoint
/// to fetch the live AgentCard. Agents that are unreachable are included
/// from the registry (marked with metadata `"online": false`).
pub async fn discover_agents(config: &CliConfig) -> Result<Vec<AgentCard>> {
    let _ = config; // reserved for future config-driven discovery
    let local_cards = load_local_registry();

    if local_cards.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let mut results = Vec::new();

    for card in &local_cards {
        let url = format!("{}/a2a/card", card.endpoint.trim_end_matches('/'));
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<AgentCard>().await {
                    Ok(live_card) => results.push(live_card),
                    Err(_) => {
                        let mut offline = card.clone();
                        offline
                            .metadata
                            .insert("online".to_string(), serde_json::json!(false));
                        results.push(offline);
                    }
                }
            }
            _ => {
                let mut offline = card.clone();
                offline
                    .metadata
                    .insert("online".to_string(), serde_json::json!(false));
                results.push(offline);
            }
        }
    }

    Ok(results)
}

/// Format a list of discovered agents for terminal display.
pub fn format_agent_list(agents: &[AgentCard]) -> String {
    if agents.is_empty() {
        return "No agents discovered.".to_string();
    }

    let mut out = format!("Discovered agents ({}):\n", agents.len());
    for card in agents {
        let online = card
            .metadata
            .get("online")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let status = if online {
            "online".green().to_string()
        } else {
            "offline".red().to_string()
        };
        let caps = if card.capabilities.is_empty() {
            "none".to_string()
        } else {
            card.capabilities.join(", ")
        };

        out.push_str(&format!(
            "  {} — {} [{}]\n    Endpoint: {}\n    Capabilities: {}\n    Models: {}\n",
            card.name.bold(),
            card.agent_id.dimmed(),
            status,
            card.endpoint,
            caps,
            card.supported_models.join(", "),
        ));
    }
    out
}
