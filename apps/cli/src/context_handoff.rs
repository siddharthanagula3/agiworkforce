//! Reads the local handoff link the Chrome extension mints for a browser
//! selection. The grammar is owned by
//! `packages/contracts/types/src/context-handoff-uri.ts`; this is its Rust
//! reader. Nothing here touches the network: the whole selection travels in
//! the link.

use anyhow::{bail, Result};

pub const CONTEXT_HANDOFF_URI_VERSION: &str = "1";
pub const CLI_CONTEXT_HANDOFF_SCHEME: &str = "agi-context";
pub const MAX_CONTEXT_HANDOFF_SELECTION_CHARS: usize = 2_000;
pub const MAX_CONTEXT_HANDOFF_URL_CHARS: usize = 2_048;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowserSelectionHandoff {
    pub id: String,
    pub source_url: String,
    pub selected_text: String,
}

impl BrowserSelectionHandoff {
    pub fn to_prompt_context(&self) -> String {
        format!(
            "<browser-selection source=\"{}\">\n{}\n</browser-selection>\n\n",
            self.source_url, self.selected_text
        )
    }
}

fn decode(value: &str) -> Result<String> {
    let plus_decoded = value.replace('+', " ");
    match urlencoding::decode(&plus_decoded) {
        Ok(decoded) => Ok(decoded.into_owned()),
        Err(_) => bail!("--context-url: the handoff link is not valid percent-encoded text"),
    }
}

fn is_handoff_id(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("ctx_") else {
        return false;
    };
    (8..=80).contains(&rest.len())
        && rest
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn is_source_url(value: &str) -> bool {
    if value.is_empty() || value.len() > MAX_CONTEXT_HANDOFF_URL_CHARS {
        return false;
    }
    let Some(rest) = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
    else {
        return false;
    };
    let host = rest.split('/').next().unwrap_or_default();
    !host.is_empty() && !host.contains('@') && !rest.contains(['?', '#', ' '])
}

pub fn parse_context_handoff_url(raw: &str) -> Result<BrowserSelectionHandoff> {
    let expected_prefix = format!("{CLI_CONTEXT_HANDOFF_SCHEME}://v{CONTEXT_HANDOFF_URI_VERSION}?");
    let Some(query) = raw.trim().strip_prefix(&expected_prefix) else {
        bail!("--context-url: expected a link that starts with {expected_prefix}");
    };

    let mut version = None;
    let mut id = None;
    let mut source_url = None;
    let mut selected_text = None;
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        match key {
            "v" => version = Some(decode(value)?),
            "id" => id = Some(decode(value)?),
            "url" => source_url = Some(decode(value)?),
            "text" => selected_text = Some(decode(value)?),
            _ => {}
        }
    }

    if version.as_deref() != Some(CONTEXT_HANDOFF_URI_VERSION) {
        bail!(
            "--context-url: this build reads version {CONTEXT_HANDOFF_URI_VERSION} handoff links"
        );
    }
    let id = id.unwrap_or_default();
    if !is_handoff_id(&id) {
        bail!("--context-url: the handoff link carries no valid identifier");
    }
    let source_url = source_url.unwrap_or_default();
    if !is_source_url(&source_url) {
        bail!("--context-url: the handoff link carries no http or https source page");
    }
    let selected_text = selected_text.unwrap_or_default().trim().to_string();
    if selected_text.is_empty()
        || selected_text.chars().count() > MAX_CONTEXT_HANDOFF_SELECTION_CHARS
    {
        bail!("--context-url: the handoff link carries no selected text within the size limit");
    }

    Ok(BrowserSelectionHandoff {
        id,
        source_url,
        selected_text,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LINK: &str = "agi-context://v1?v=1&id=ctx_12345678&url=https%3A%2F%2Fexample.com%2Fdocs&text=pick+this+up%27s+%26+that";

    #[test]
    fn reads_the_selection_and_its_source_page() {
        let handoff = parse_context_handoff_url(LINK).expect("link parses");

        assert_eq!(handoff.id, "ctx_12345678");
        assert_eq!(handoff.source_url, "https://example.com/docs");
        assert_eq!(handoff.selected_text, "pick this up's & that");
        assert!(handoff
            .to_prompt_context()
            .contains("<browser-selection source=\"https://example.com/docs\">"));
    }

    #[test]
    fn refuses_a_link_that_is_not_a_version_one_handoff() {
        assert!(parse_context_handoff_url("https://example.com/docs").is_err());
        assert!(parse_context_handoff_url("agi-context://v2?v=2&id=ctx_12345678").is_err());
    }

    #[test]
    fn refuses_a_source_page_that_is_not_http_or_https() {
        let link = LINK.replace(
            "https%3A%2F%2Fexample.com%2Fdocs",
            "file%3A%2F%2F%2Fetc%2Fpasswd",
        );

        assert!(parse_context_handoff_url(&link).is_err());
    }

    #[test]
    fn refuses_a_link_with_no_selected_text() {
        let link = LINK.replace("&text=pick+this+up%27s+%26+that", "&text=++");

        assert!(parse_context_handoff_url(&link).is_err());
    }
}
