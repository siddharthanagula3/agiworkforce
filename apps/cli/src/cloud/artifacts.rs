//! Hosted artifacts: the same account-wide index the web gallery lists and the
//! same publish records the share pages are served from.
//!
//! The index deliberately stores metadata only. An artifact's bytes stay in the
//! assistant message that produced it and are re-derived under a deterministic
//! id, so listing is a hosted read and reading the content is a message read
//! plus the same derivation every other surface runs.
//!
//! Identity mirrors `packages/platform/artifacts/src/artifact-derivation.ts`:
//! `uuidv5("<conversationId>:<messageId>:<ordinal>")` under one fixed
//! namespace. `the_derivation_namespace_matches_the_shared_contract` pins the
//! namespace and `a_derived_id_matches_the_shared_contract` pins vectors taken
//! from that module, so a drift here fails rather than silently listing
//! artifacts no other surface can name.

use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::client::{CloudClient, CloudError, Route};

pub const ARTIFACT_INDEX_PATH: &str = "/api/artifacts/index";
pub const ARTIFACT_PUBLISH_PATH: &str = "/api/artifacts/publish";
pub const CONVERSATIONS_PATH: &str = "/api/chat/conversations";

pub const DEFAULT_ARTIFACT_LIMIT: u32 = 50;

/// One page of a conversation's messages. The hosted route caps a page at 500.
const MESSAGE_PAGE: u32 = 500;

/// Namespace of `DERIVED_ARTIFACT_NAMESPACE` in the shared derivation module.
const DERIVED_ARTIFACT_NAMESPACE: Uuid = Uuid::from_u128(0x5f6c_1e8a_2b3d_4c5e_8f9a_0b1c_2d3e_4f50);

/// Kinds the hosted publish route accepts, mirroring `PUBLISHABLE_KINDS` in
/// `apps/web/lib/services/published-artifact-service.ts`.
pub const PUBLISHABLE_KINDS: [&str; 7] = [
    "html", "react", "svg", "mermaid", "markdown", "text", "code",
];

static FENCED_CODE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^```([^\n`]*)\r?\n([\s\S]*?)^```")
        .expect("the fenced-code pattern is a compile-time literal")
});

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactIndexEntry {
    pub id: String,
    pub conversation_id: String,
    pub message_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(rename = "type")]
    pub artifact_type: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub created_at: String,
}

impl ArtifactIndexEntry {
    pub fn display_title(&self) -> &str {
        self.title
            .as_deref()
            .map(str::trim)
            .filter(|title| !title.is_empty())
            .unwrap_or("Untitled artifact")
    }
}

#[derive(Deserialize)]
struct ArtifactIndexBody {
    #[serde(default)]
    artifacts: Vec<ArtifactIndexEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedArtifact {
    pub token: String,
    pub artifact_id: String,
    #[serde(default)]
    pub title: Option<String>,
    pub kind: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub content_chars: i64,
    pub visibility: String,
    #[serde(default)]
    pub share_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
struct PublishedListBody {
    #[serde(default)]
    artifacts: Vec<PublishedArtifact>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishRequest {
    pub artifact_id: String,
    pub title: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub token: String,
    pub share_url: String,
    pub kind: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub sandboxed: bool,
    pub visibility: String,
    #[serde(default)]
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct HostedMessage {
    id: String,
    #[serde(default)]
    content: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ConversationPage {
    #[serde(default)]
    messages: Vec<HostedMessage>,
    #[serde(default)]
    has_more: bool,
}

/// One fenced block of an assistant message, in the order the block appears.
#[derive(Debug, Clone, PartialEq)]
pub struct CodeBlock {
    pub language: String,
    pub content: String,
    pub ordinal: usize,
}

/// The id every surface computes for the artifact a block produces.
pub fn derived_artifact_id(conversation_id: &str, message_id: &str, ordinal: usize) -> String {
    Uuid::new_v5(
        &DERIVED_ARTIFACT_NAMESPACE,
        format!("{conversation_id}:{message_id}:{ordinal}").as_bytes(),
    )
    .to_string()
}

fn fence_language(info: &str) -> String {
    info.split_whitespace()
        .next()
        .map(str::to_lowercase)
        .filter(|language| !language.is_empty())
        .unwrap_or_else(|| "text".to_string())
}

/// Every fenced block of a message, ordinal-numbered the way the shared
/// derivation numbers them. The ordinal is the position among ALL blocks, not
/// among the ones a surface chooses to render, which is what makes the id
/// stable between surfaces that include different subsets.
pub fn extract_code_blocks(markdown: &str) -> Vec<CodeBlock> {
    FENCED_CODE
        .captures_iter(markdown)
        .enumerate()
        .map(|(ordinal, captures)| CodeBlock {
            language: fence_language(captures.get(1).map(|m| m.as_str()).unwrap_or_default()),
            content: captures
                .get(2)
                .map(|m| m.as_str())
                .unwrap_or_default()
                .trim()
                .to_string(),
            ordinal,
        })
        .collect()
}

/// The block of `markdown` that carries `artifact_id`, or `None` when this
/// message no longer produces it.
pub fn block_for_artifact(
    markdown: &str,
    conversation_id: &str,
    message_id: &str,
    artifact_id: &str,
) -> Option<CodeBlock> {
    extract_code_blocks(markdown).into_iter().find(|block| {
        derived_artifact_id(conversation_id, message_id, block.ordinal) == artifact_id
    })
}

pub fn is_publishable_kind(kind: &str) -> bool {
    PUBLISHABLE_KINDS.contains(&kind)
}

pub fn file_extension(artifact_type: &str, language: Option<&str>) -> &'static str {
    match artifact_type {
        "html" => "html",
        "svg" => "svg",
        "mermaid" => "mmd",
        "react" => "jsx",
        "markdown" => "md",
        "text" => "txt",
        _ => language_extension(language.unwrap_or_default()),
    }
}

fn language_extension(language: &str) -> &'static str {
    match language.to_lowercase().as_str() {
        "javascript" | "js" | "node" => "js",
        "jsx" => "jsx",
        "typescript" | "ts" => "ts",
        "tsx" => "tsx",
        "python" | "py" => "py",
        "rust" | "rs" => "rs",
        "go" | "golang" => "go",
        "java" => "java",
        "kotlin" | "kt" => "kt",
        "swift" => "swift",
        "ruby" | "rb" => "rb",
        "php" => "php",
        "c" => "c",
        "cpp" | "c++" => "cpp",
        "csharp" | "cs" => "cs",
        "shell" | "bash" | "sh" | "zsh" => "sh",
        "sql" => "sql",
        "json" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "css" => "css",
        "html" | "htm" => "html",
        "markdown" | "md" => "md",
        "xml" => "xml",
        "svg" => "svg",
        "mermaid" => "mmd",
        _ => "txt",
    }
}

/// Where `agi artifacts show --out` writes. A directory takes the artifact's
/// own name; a path with no extension gains the artifact's; anything else is
/// written exactly as the user asked.
pub fn output_path(out: &Path, cwd: &Path, artifact_id: &str, extension: &str) -> PathBuf {
    let out = if out.is_absolute() {
        out.to_path_buf()
    } else {
        cwd.join(out)
    };
    if out.is_dir() {
        return out.join(format!("{artifact_id}.{extension}"));
    }
    if out.extension().is_none() {
        return out.with_extension(extension);
    }
    out
}

/// `agi artifacts list` reads the account-wide index.
pub fn list_route() -> Route {
    Route::get(ARTIFACT_INDEX_PATH)
}

/// `agi artifacts show` and `publish` read the message the artifact derives
/// from, because the index deliberately stores no content.
pub fn content_route(conversation_id: &str) -> Route {
    Route::get(format!(
        "{CONVERSATIONS_PATH}/{}",
        urlencoding::encode(conversation_id)
    ))
}

/// `agi artifacts publish` writes a share record.
pub fn publish_route() -> Route {
    Route::post(ARTIFACT_PUBLISH_PATH)
}

/// `agi artifacts open` and `unpublish` read what this account has published.
pub fn published_route() -> Route {
    Route::get(ARTIFACT_PUBLISH_PATH)
}

/// `agi artifacts unpublish` revokes one share record by its token.
pub fn unpublish_route(token: &str) -> Route {
    Route::delete(format!(
        "{ARTIFACT_PUBLISH_PATH}/{}",
        urlencoding::encode(token)
    ))
}

pub async fn list(
    client: &CloudClient,
    limit: u32,
    project_id: Option<&str>,
) -> Result<Vec<ArtifactIndexEntry>, CloudError> {
    let mut query = vec![("limit", limit.to_string())];
    if let Some(project_id) = project_id {
        query.push(("projectId", project_id.to_string()));
    }
    let body: ArtifactIndexBody = client.call(&list_route(), &query, None).await?;
    Ok(body.artifacts)
}

pub async fn published(client: &CloudClient) -> Result<Vec<PublishedArtifact>, CloudError> {
    let body: PublishedListBody = client.call(&published_route(), &[], None).await?;
    Ok(body.artifacts)
}

/// The account's index entry for `artifact_id`, or a 404 naming it.
pub async fn resolve(
    client: &CloudClient,
    artifact_id: &str,
) -> Result<ArtifactIndexEntry, CloudError> {
    let entries = list(client, 500, None).await?;
    entries
        .into_iter()
        .find(|entry| entry.id == artifact_id)
        .ok_or_else(|| CloudError::Api {
            status: 404,
            message: format!("No artifact '{artifact_id}' in your AGI Workforce account"),
        })
}

/// The artifact's bytes, re-derived from the message that produced them.
pub async fn content(
    client: &CloudClient,
    entry: &ArtifactIndexEntry,
) -> Result<CodeBlock, CloudError> {
    let route = content_route(&entry.conversation_id);
    let mut offset: u32 = 0;
    loop {
        let page: ConversationPage = client
            .call(
                &route,
                &[
                    ("limit", MESSAGE_PAGE.to_string()),
                    ("offset", offset.to_string()),
                ],
                None,
            )
            .await?;
        let delivered = page.messages.len() as u32;
        if let Some(message) = page
            .messages
            .iter()
            .find(|message| message.id == entry.message_id)
        {
            return block_for_artifact(
                &message.content,
                &entry.conversation_id,
                &entry.message_id,
                &entry.id,
            )
            .ok_or_else(|| CloudError::Api {
                status: 404,
                message: format!(
                    "The message behind artifact {} no longer produces it; the conversation was \
                     edited after it was indexed",
                    entry.id
                ),
            });
        }
        if !page.has_more || delivered == 0 {
            return Err(CloudError::Api {
                status: 404,
                message: format!(
                    "The conversation behind artifact {} no longer holds its message",
                    entry.id
                ),
            });
        }
        offset += delivered;
    }
}

pub async fn publish(
    client: &CloudClient,
    entry: &ArtifactIndexEntry,
    block: &CodeBlock,
) -> Result<PublishResult, CloudError> {
    if !is_publishable_kind(&entry.artifact_type) {
        return Err(CloudError::Api {
            status: 400,
            message: format!(
                "Your account does not publish '{}' artifacts, only {}",
                entry.artifact_type,
                PUBLISHABLE_KINDS.join(", ")
            ),
        });
    }
    let request = PublishRequest {
        artifact_id: entry.id.clone(),
        title: entry.display_title().to_string(),
        kind: entry.artifact_type.clone(),
        language: entry
            .language
            .as_deref()
            .map(str::trim)
            .filter(|language| !language.is_empty())
            .map(str::to_string)
            .or_else(|| Some(block.language.clone())),
        content: block.content.clone(),
        conversation_id: Some(entry.conversation_id.clone()),
    };
    client
        .call(
            &publish_route(),
            &[],
            Some(
                &serde_json::to_value(&request)
                    .map_err(|error| CloudError::Decode(error.to_string()))?,
            ),
        )
        .await
}

/// The live publication of `artifact_id`, or `None` when it is not published.
pub async fn published_for(
    client: &CloudClient,
    artifact_id: &str,
) -> Result<Option<PublishedArtifact>, CloudError> {
    Ok(published(client)
        .await?
        .into_iter()
        .find(|artifact| artifact.artifact_id == artifact_id))
}

pub async fn unpublish(client: &CloudClient, token: &str) -> Result<(), CloudError> {
    let _: serde_json::Value = client.call(&unpublish_route(token), &[], None).await?;
    Ok(())
}

/// The page that shows an artifact: its public share URL once published, and
/// otherwise the conversation it was produced in.
pub fn browse_url(base: &str, entry: &ArtifactIndexEntry, share_url: Option<&str>) -> String {
    match share_url {
        Some(url) if !url.trim().is_empty() => url.trim().to_string(),
        _ => format!(
            "{}/chat/{}",
            base.trim_end_matches('/'),
            urlencoding::encode(&entry.conversation_id)
        ),
    }
}

pub const SLASH_USAGE: &str = "/artifacts lists your account's artifacts. \
                               /artifacts show <id> prints one, /artifacts open <id> opens it.";

/// The `/artifacts` slash form the REPL and the TUI share, rendered as the one
/// block a chat surface prints. A boundary (signed out, Local mode) is stated
/// rather than shown as an empty account.
pub async fn slash(
    privacy: crate::platform::runtime::session::PrivacyMode,
    argument: &str,
) -> String {
    let client = match CloudClient::connect(privacy) {
        Ok(client) => client,
        Err(error) => return error.to_string(),
    };
    let (verb, rest) = argument
        .trim()
        .split_once(char::is_whitespace)
        .unwrap_or((argument.trim(), ""));
    let id = rest.trim();

    match (verb, id) {
        ("", _) => match list(&client, DEFAULT_ARTIFACT_LIMIT, None).await {
            Ok(entries) => format!("{}\n\n{SLASH_USAGE}", render_index(&entries)),
            Err(error) => error.to_string(),
        },
        ("show", "") | ("open", "") => SLASH_USAGE.to_string(),
        ("show", id) => match resolve(&client, id).await {
            Err(error) => error.to_string(),
            Ok(entry) => match content(&client, &entry).await {
                Ok(block) => block.content,
                Err(error) => error.to_string(),
            },
        },
        ("open", id) => match resolve(&client, id).await {
            Err(error) => error.to_string(),
            Ok(entry) => {
                let share_url = published_for(&client, &entry.id)
                    .await
                    .ok()
                    .flatten()
                    .and_then(|published| published.share_url);
                let url = browse_url(client.base(), &entry, share_url.as_deref());
                let opened = crate::oauth::open_external_url(
                    &url,
                    crate::oauth::UserActionContext::user_initiated(),
                );
                if opened {
                    format!("Opened {url}")
                } else {
                    format!("Open it yourself: {url}")
                }
            }
        },
        _ => SLASH_USAGE.to_string(),
    }
}

pub fn render_index(entries: &[ArtifactIndexEntry]) -> String {
    if entries.is_empty() {
        return "No artifacts in your AGI Workforce account yet.".to_string();
    }
    let mut lines = Vec::with_capacity(entries.len() * 2);
    for entry in entries {
        lines.push(format!(
            "{}  {}  [{}]",
            entry.id,
            entry.display_title(),
            entry.artifact_type
        ));
        lines.push(format!(
            "  conversation {}  {}",
            entry.conversation_id, entry.created_at
        ));
    }
    lines.join("\n")
}

pub fn render_published(artifacts: &[PublishedArtifact]) -> String {
    if artifacts.is_empty() {
        return "Nothing is published from this account.".to_string();
    }
    artifacts
        .iter()
        .map(|artifact| {
            format!(
                "{}  [{}]  {}",
                artifact.artifact_id,
                artifact.visibility,
                artifact.share_url.as_deref().unwrap_or(&artifact.token)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::super::client::Method;
    use super::*;

    #[test]
    fn the_derivation_namespace_matches_the_shared_contract() {
        assert_eq!(
            DERIVED_ARTIFACT_NAMESPACE.to_string(),
            "5f6c1e8a-2b3d-4c5e-8f9a-0b1c2d3e4f50",
            "the namespace is the shared derivation module's; a different one names artifacts no \
             other surface can find"
        );
    }

    #[test]
    fn a_derived_id_matches_the_shared_contract() {
        let conversation = "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
        let message = "9c4d1e2f-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
        assert_eq!(
            derived_artifact_id(conversation, message, 0),
            "070c6f1a-1024-5b5a-83ed-c2559a8bfda4"
        );
        assert_eq!(
            derived_artifact_id(conversation, message, 2),
            "84624fd1-166e-5c6b-982c-f50acd9ef51c"
        );
        assert_eq!(
            derived_artifact_id("", "", 0),
            "7b23dc31-836a-5302-bf8d-f9fc60fc13a7"
        );
    }

    #[test]
    fn every_fenced_block_gets_the_ordinal_the_shared_derivation_gives_it() {
        let markdown = "Intro text\n\n```html\n<h1>Hi</h1>\n```\n\nmiddle\n\n```\nplain\n```\n\n```python\nprint(1)\n```\n";
        let blocks = extract_code_blocks(markdown);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].language, "html");
        assert_eq!(blocks[0].content, "<h1>Hi</h1>");
        assert_eq!(blocks[1].language, "text");
        assert_eq!(blocks[1].content, "plain");
        assert_eq!(blocks[2].language, "python");
        assert_eq!(blocks[2].ordinal, 2);
    }

    #[test]
    fn an_unclosed_fence_produces_no_block() {
        let blocks = extract_code_blocks("```js\nlet a = 1;\n```\ntail\n```unclosed\nnever ends\n");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].content, "let a = 1;");
    }

    #[test]
    fn an_artifact_resolves_to_the_block_its_id_names() {
        let conversation = "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
        let message = "9c4d1e2f-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
        let markdown = "```html\n<h1>first</h1>\n```\n\n```html\n<h1>second</h1>\n```\n";
        let wanted = derived_artifact_id(conversation, message, 1);
        let block = block_for_artifact(markdown, conversation, message, &wanted)
            .expect("the second block is the artifact");
        assert_eq!(block.content, "<h1>second</h1>");
        assert!(block_for_artifact(markdown, conversation, message, "not-an-id").is_none());
    }

    #[test]
    fn an_index_entry_decodes_from_the_wire_shape() {
        let wire = serde_json::json!({
            "id": "070c6f1a-1024-5b5a-83ed-c2559a8bfda4",
            "conversationId": "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
            "messageId": "9c4d1e2f-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
            "title": null,
            "type": "html",
            "language": "html",
            "projectId": null,
            "createdAt": "2026-09-14T00:00:00.000Z"
        });
        let entry: ArtifactIndexEntry = serde_json::from_value(wire).expect("decodes");
        assert_eq!(entry.artifact_type, "html");
        assert_eq!(entry.display_title(), "Untitled artifact");
        assert!(entry.project_id.is_none());
    }

    #[test]
    fn a_published_row_decodes_from_the_wire_shape() {
        let wire = serde_json::json!({
            "token": "aaaaaaaaaaaaaaaaaaaaaaaa",
            "artifactId": "070c6f1a-1024-5b5a-83ed-c2559a8bfda4",
            "title": "Chart",
            "kind": "html",
            "language": null,
            "contentChars": 42,
            "visibility": "public",
            "createdAt": "2026-09-14T00:00:00.000Z",
            "updatedAt": "2026-09-14T00:00:00.000Z",
            "shareUrl": "https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa",
            "sandboxed": true
        });
        let artifact: PublishedArtifact = serde_json::from_value(wire).expect("decodes");
        assert_eq!(artifact.visibility, "public");
        assert_eq!(artifact.content_chars, 42);
    }

    #[test]
    fn a_publish_request_carries_only_fields_the_hosted_schema_accepts() {
        let entry = entry_fixture();
        let block = CodeBlock {
            language: "html".to_string(),
            content: "<h1>Hi</h1>".to_string(),
            ordinal: 0,
        };
        let request = PublishRequest {
            artifact_id: entry.id.clone(),
            title: entry.display_title().to_string(),
            kind: entry.artifact_type.clone(),
            language: Some(block.language.clone()),
            content: block.content.clone(),
            conversation_id: Some(entry.conversation_id.clone()),
        };
        let value = serde_json::to_value(&request).expect("serializes");
        let object = value.as_object().expect("object");
        let allowed = [
            "artifactId",
            "title",
            "kind",
            "language",
            "content",
            "conversationId",
        ];
        for key in object.keys() {
            assert!(
                allowed.contains(&key.as_str()),
                "the hosted publish route rejects unknown fields, found '{key}'"
            );
        }
        assert_eq!(object["kind"], serde_json::json!("html"));
    }

    #[test]
    fn only_the_kinds_the_hosted_route_accepts_are_publishable() {
        assert!(is_publishable_kind("html"));
        assert!(is_publishable_kind("mermaid"));
        assert!(!is_publishable_kind("image"));
    }

    #[test]
    fn the_extension_follows_the_kind_then_the_language() {
        assert_eq!(file_extension("html", None), "html");
        assert_eq!(file_extension("mermaid", None), "mmd");
        assert_eq!(file_extension("react", Some("tsx")), "jsx");
        assert_eq!(file_extension("code", Some("python")), "py");
        assert_eq!(file_extension("code", Some("rs")), "rs");
        assert_eq!(file_extension("code", None), "txt");
    }

    #[test]
    fn an_out_path_keeps_the_name_the_user_gave_and_gains_a_missing_extension() {
        let cwd = Path::new("/tmp/work");
        assert_eq!(
            output_path(Path::new("chart.txt"), cwd, "abc", "html"),
            PathBuf::from("/tmp/work/chart.txt")
        );
        assert_eq!(
            output_path(Path::new("chart"), cwd, "abc", "html"),
            PathBuf::from("/tmp/work/chart.html")
        );
    }

    #[test]
    fn an_out_directory_is_named_for_the_artifact() {
        let dir = tempfile::tempdir().expect("temp dir");
        assert_eq!(
            output_path(dir.path(), dir.path(), "abc", "svg"),
            dir.path().join("abc.svg")
        );
    }

    #[test]
    fn an_unpublished_artifact_browses_to_its_conversation() {
        let entry = entry_fixture();
        assert_eq!(
            browse_url("https://agiworkforce.com/", &entry, None),
            format!("https://agiworkforce.com/chat/{}", entry.conversation_id)
        );
        assert_eq!(
            browse_url("https://agiworkforce.com", &entry, Some("  ")),
            format!("https://agiworkforce.com/chat/{}", entry.conversation_id)
        );
        assert_eq!(
            browse_url(
                "https://agiworkforce.com",
                &entry,
                Some("https://agiworkforce.com/shared-artifact/tok")
            ),
            "https://agiworkforce.com/shared-artifact/tok"
        );
    }

    #[test]
    fn each_artifact_command_routes_to_the_hosted_endpoint_it_names() {
        assert_eq!(list_route().method, Method::Get);
        assert_eq!(list_route().path, "/api/artifacts/index");

        assert_eq!(published_route().method, Method::Get);
        assert_eq!(published_route().path, "/api/artifacts/publish");

        assert_eq!(publish_route().method, Method::Post);
        assert_eq!(publish_route().path, "/api/artifacts/publish");

        let unpublish = unpublish_route("a b");
        assert_eq!(unpublish.method, Method::Delete);
        assert_eq!(unpublish.path, "/api/artifacts/publish/a%20b");

        let content = content_route("a b");
        assert_eq!(content.method, Method::Get);
        assert_eq!(content.path, "/api/chat/conversations/a%20b");
    }

    #[test]
    fn an_empty_listing_says_so_rather_than_printing_nothing() {
        assert!(render_index(&[]).contains("No artifacts"));
        assert!(render_published(&[]).contains("Nothing is published"));
    }

    #[test]
    fn a_rendered_entry_names_its_conversation_and_kind() {
        let rendered = render_index(std::slice::from_ref(&entry_fixture()));
        assert!(rendered.contains("[html]"), "{rendered}");
        assert!(
            rendered.contains("3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f"),
            "{rendered}"
        );
    }

    fn entry_fixture() -> ArtifactIndexEntry {
        ArtifactIndexEntry {
            id: "070c6f1a-1024-5b5a-83ed-c2559a8bfda4".to_string(),
            conversation_id: "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f".to_string(),
            message_id: "9c4d1e2f-3a4b-4c5d-8e9f-0a1b2c3d4e5f".to_string(),
            title: Some("Chart".to_string()),
            artifact_type: "html".to_string(),
            language: Some("html".to_string()),
            project_id: None,
            created_at: "2026-09-14T00:00:00.000Z".to_string(),
        }
    }
}
