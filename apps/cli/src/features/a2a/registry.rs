//! Local agent registry I/O: load/save agents.json + discovery.

use anyhow::{Context, Result};
use colored::Colorize;

use crate::config::CliConfig;
use crate::terminal_style as ts;

use super::protocol::AgentCard;
use super::security::peer_token;

const AGENTS_REGISTRY_FILENAME: &str = "agents.json";
const TOKEN_REQUIRED_KEY: &str = "token_required";

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
                    ts::warning("Warning:"),
                    path.display(),
                    e
                );
                Vec::new()
            }
        },
        Err(e) => {
            eprintln!(
                "  {} Failed to read {}: {}",
                ts::warning("Warning:"),
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

    let mut results = Vec::new();

    for card in &local_cards {
        let url = format!("{}/a2a/card", card.endpoint.trim_end_matches('/'));

        // SSRF guard: a registry entry whose endpoint points at a private/
        // internal address (e.g. cloud-metadata 169.254.169.254 or loopback)
        // must not be probed. Build a per-card client that validates the
        // endpoint AND pins DNS to the checked IP (so it cannot rebind to a
        // private address between the check and the connect). On failure,
        // surface the agent as offline instead of issuing the GET.
        let client = match super::security::a2a_pinned_client(&url, 5) {
            Ok(client) => client,
            Err(_) => {
                let mut offline = card.clone();
                offline
                    .metadata
                    .insert("online".to_string(), serde_json::json!(false));
                results.push(offline);
                continue;
            }
        };

        results.push(probe_card(&client, card, &url).await);
    }

    Ok(results)
}

async fn probe_card(client: &reqwest::Client, card: &AgentCard, url: &str) -> AgentCard {
    let mut request = client.get(url);
    if let Some(token) = peer_token(&card.endpoint) {
        request = request.bearer_auth(token);
    }

    let mut probed = card.clone();
    match request.send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<AgentCard>().await {
            Ok(live_card) => return live_card,
            Err(_) => {
                probed
                    .metadata
                    .insert("online".to_string(), serde_json::json!(false));
            }
        },
        Ok(resp) if matches!(resp.status().as_u16(), 401 | 403) => {
            probed
                .metadata
                .insert("online".to_string(), serde_json::json!(true));
            probed
                .metadata
                .insert(TOKEN_REQUIRED_KEY.to_string(), serde_json::json!(true));
        }
        _ => {
            probed
                .metadata
                .insert("online".to_string(), serde_json::json!(false));
        }
    }
    probed
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
        let token_required = card
            .metadata
            .get(TOKEN_REQUIRED_KEY)
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let status = if token_required {
            ts::warning(format!("token required, run /a2a auth {}", card.endpoint)).to_string()
        } else if online {
            ts::success("online").to_string()
        } else {
            ts::danger("offline").to_string()
        };
        let caps = if card.capabilities.is_empty() {
            "none".to_string()
        } else {
            card.capabilities.join(", ")
        };

        out.push_str(&format!(
            "  {}, {} [{}]\n    Endpoint: {}\n    Capabilities: {}\n    Models: {}\n",
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    const PEER_TOKEN: &str = "discovery-peer-token";

    fn card(endpoint: &str) -> AgentCard {
        AgentCard {
            agent_id: "agent-peer".to_string(),
            name: "peer".to_string(),
            version: "0.1.0".to_string(),
            capabilities: Vec::new(),
            supported_models: Vec::new(),
            endpoint: endpoint.to_string(),
            auth_required: true,
            metadata: HashMap::new(),
        }
    }

    async fn serve_card_behind_bearer() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let body = serde_json::to_string(&card(&endpoint)).unwrap();
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                let body = body.clone();
                tokio::spawn(async move {
                    let mut buffer = vec![0u8; 8192];
                    let read = stream.read(&mut buffer).await.unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]).to_lowercase();
                    let response = if request
                        .contains(&format!("authorization: bearer {PEER_TOKEN}"))
                    {
                        format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        )
                    } else {
                        "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                            .to_string()
                    };
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.shutdown().await;
                });
            }
        });
        endpoint
    }

    #[tokio::test]
    async fn discovery_presents_the_remembered_token_and_flags_a_peer_that_needs_one() {
        let endpoint = serve_card_behind_bearer().await;
        let url = format!("{endpoint}/a2a/card");
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let registered = card(&endpoint);

        let locked = probe_card(&client, &registered, &url).await;
        assert_eq!(
            locked.metadata.get(TOKEN_REQUIRED_KEY),
            Some(&serde_json::json!(true))
        );
        assert!(format_agent_list(&[locked]).contains("/a2a auth"));

        super::super::security::remember_peer_token(&endpoint, PEER_TOKEN).unwrap();
        let unlocked = probe_card(&client, &registered, &url).await;
        assert!(!unlocked.metadata.contains_key(TOKEN_REQUIRED_KEY));
        assert!(!unlocked.metadata.contains_key("online"));
    }
}
