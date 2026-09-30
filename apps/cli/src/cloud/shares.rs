use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{CloudClient, CloudError, Route};

const SHARES_PATH: &str = "/api/share";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedLink {
    pub token: String,
    pub title: String,
    pub share_url: String,
    #[serde(default)]
    pub message_count: Option<u64>,
    #[serde(default)]
    pub visibility: Option<String>,
    pub created_at: String,
    pub expires_at: String,
    #[serde(default)]
    pub expired: bool,
}

#[derive(Deserialize)]
struct SharedLinks {
    shares: Vec<SharedLink>,
}

pub async fn list(client: &CloudClient) -> Result<Vec<SharedLink>, CloudError> {
    Ok(client.get::<SharedLinks>(SHARES_PATH, &[]).await?.shares)
}

pub async fn revoke(client: &CloudClient, token: &str) -> Result<(), CloudError> {
    let _: Value = client
        .call(
            &Route::delete(format!("{SHARES_PATH}/{}", urlencoding::encode(token))),
            &[],
            None,
        )
        .await?;
    Ok(())
}

pub fn render(links: &[SharedLink]) -> String {
    if links.is_empty() {
        return "You have not shared any conversations.".to_string();
    }
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    let mut lines = vec!["Shared conversation links".to_string()];
    for link in links {
        let state = if link.expired {
            "expired".to_string()
        } else {
            format!(
                "until {}",
                sanitize(link.expires_at.get(..10).unwrap_or(&link.expires_at))
            )
        };
        let audience = link
            .visibility
            .as_deref()
            .map(|visibility| format!(", {}", sanitize(visibility)))
            .unwrap_or_default();
        lines.push(format!(
            "  {}  {}  ({state}{audience})\n    {}",
            sanitize(&link.token),
            sanitize(&link.title),
            sanitize(&link.share_url)
        ));
    }
    lines.push("agi shares revoke <token> turns a link off for everyone.".to_string());
    lines.join("\n")
}
