use serde::{Deserialize, Serialize};

use super::{CloudClient, CloudError};

const FEEDBACK_PATH: &str = "/api/feedback";
const SUBJECT_LIMIT: usize = 200;
const MESSAGE_LIMIT: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedbackKind {
    Bug,
    Feature,
    Feedback,
}

#[derive(Serialize)]
struct FeedbackMetadata {
    source: &'static str,
    platform: String,
    version: &'static str,
    user_agent: String,
}

#[derive(Serialize)]
struct FeedbackRequest {
    subject: String,
    message: String,
    metadata: FeedbackMetadata,
}

#[derive(Deserialize)]
struct FeedbackResponse {
    #[serde(default)]
    success: bool,
}

pub const USAGE: &str = "Describe it after the command, for example `/bug the diff view hangs on large files` or `/feedback I would like a dark theme`; start with `/feedback feature` for a feature request. It goes to the AGI Workforce team with this CLI's version and platform.";

fn subject(kind: FeedbackKind, message: &str) -> String {
    let prefix = match kind {
        FeedbackKind::Bug => "Bug report",
        FeedbackKind::Feature => "Feature request",
        FeedbackKind::Feedback => "Feedback",
    };
    let line = message.lines().next().unwrap_or_default().trim();
    let mut subject = format!("{prefix}: {line}");
    if subject.chars().count() > SUBJECT_LIMIT {
        subject = subject.chars().take(SUBJECT_LIMIT - 1).collect::<String>() + "…";
    }
    subject
}

pub async fn submit(
    client: &CloudClient,
    kind: FeedbackKind,
    message: &str,
) -> Result<String, CloudError> {
    let message = message.trim();
    let message: String = message.chars().take(MESSAGE_LIMIT).collect();
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let request = FeedbackRequest {
        subject: subject(kind, &message),
        message,
        metadata: FeedbackMetadata {
            source: "cli",
            user_agent: format!("agi/{} ({platform})", env!("CARGO_PKG_VERSION")),
            platform,
            version: env!("CARGO_PKG_VERSION"),
        },
    };
    let response: FeedbackResponse = client.post(FEEDBACK_PATH, &request).await?;
    Ok(if response.success {
        match kind {
            FeedbackKind::Bug => "Bug report sent to the AGI Workforce team. Thank you.",
            FeedbackKind::Feature => "Feature request sent to the AGI Workforce team. Thank you.",
            FeedbackKind::Feedback => "Feedback sent to the AGI Workforce team. Thank you.",
        }
        .to_string()
    } else {
        "The team's feedback inbox did not confirm it. Try again in a moment.".to_string()
    })
}
