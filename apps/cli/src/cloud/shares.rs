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

#[derive(Debug, Deserialize)]
pub struct SharedLinks {
    pub shares: Vec<SharedLink>,
    #[serde(default)]
    pub complete: bool,
}

pub async fn list(client: &CloudClient) -> Result<SharedLinks, CloudError> {
    client.get::<SharedLinks>(SHARES_PATH, &[]).await
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

const INCOMPLETE_NOTICE: &str = "This list may not include every link you shared. Older links stay open until they expire or you revoke them.";

pub fn render(inventory: &SharedLinks) -> String {
    let links = &inventory.shares;
    if links.is_empty() {
        return if inventory.complete {
            "You have not shared any conversations.".to_string()
        } else {
            format!("No shared links were listed. {INCOMPLETE_NOTICE}")
        };
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
    if !inventory.complete {
        lines.push(INCOMPLETE_NOTICE.to_string());
    }
    lines.push("agi shares revoke <token> turns a link off for everyone.".to_string());
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn inventory(body: Value) -> SharedLinks {
        serde_json::from_value(body).expect("share inventory")
    }

    fn link(token: &str) -> Value {
        serde_json::json!({
            "token": token,
            "title": "Plan",
            "shareUrl": format!("https://example.test/s/{token}"),
            "createdAt": "2026-11-01T00:00:00.000Z",
            "expiresAt": "2026-12-01T00:00:00.000Z",
            "expired": false,
        })
    }

    #[test]
    fn a_complete_inventory_says_nothing_is_missing() {
        let empty = render(&inventory(
            serde_json::json!({ "shares": [], "complete": true }),
        ));
        assert_eq!(empty, "You have not shared any conversations.");

        let listed = render(&inventory(
            serde_json::json!({ "shares": [link("tok-1")], "complete": true }),
        ));
        assert!(listed.contains("tok-1"));
        assert!(!listed.contains(INCOMPLETE_NOTICE));
    }

    #[test]
    fn a_truncated_inventory_says_older_links_are_not_shown() {
        let listed = render(&inventory(
            serde_json::json!({ "shares": [link("tok-1")], "complete": false }),
        ));
        assert!(listed.contains("tok-1"));
        assert!(listed.contains(INCOMPLETE_NOTICE));
    }

    #[test]
    fn a_missing_completeness_field_is_not_read_as_complete() {
        let parsed = inventory(serde_json::json!({ "shares": [] }));
        assert!(!parsed.complete);
        let empty = render(&parsed);
        assert_ne!(empty, "You have not shared any conversations.");
        assert!(empty.contains(INCOMPLETE_NOTICE));

        let listed = render(&inventory(serde_json::json!({ "shares": [link("tok-1")] })));
        assert!(listed.contains(INCOMPLETE_NOTICE));
    }
}
