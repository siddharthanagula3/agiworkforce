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

fn admitted_message(message: &str) -> Result<String, CloudError> {
    let message = message.trim();
    let length = message.encode_utf16().count();
    if length > MESSAGE_LIMIT {
        return Err(CloudError::LocalFile(format!(
            "the description is {length} characters and the limit is {MESSAGE_LIMIT}. Press Up to edit it, shorten it by {} characters and send it again.",
            length - MESSAGE_LIMIT
        )));
    }
    Ok(message.to_string())
}

pub async fn submit(
    client: &CloudClient,
    kind: FeedbackKind,
    message: &str,
) -> Result<String, CloudError> {
    let message = admitted_message(message)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_at_the_limit_is_sent_whole() {
        let body = format!("  {}  ", "a".repeat(MESSAGE_LIMIT));
        assert_eq!(admitted_message(&body).unwrap(), "a".repeat(MESSAGE_LIMIT));
    }

    #[test]
    fn message_over_the_limit_is_refused_not_clipped() {
        let body = format!("{}tail condition", "a".repeat(MESSAGE_LIMIT));
        let error = admitted_message(&body).unwrap_err().to_string();
        assert!(error.contains("the limit is 10000"), "{error}");
        assert!(error.contains("shorten it by 14 characters"), "{error}");
    }

    #[test]
    fn limit_counts_utf16_units_like_the_server() {
        let body = "\u{1F600}".repeat(MESSAGE_LIMIT / 2 + 1);
        assert!(body.chars().count() <= MESSAGE_LIMIT);
        assert!(admitted_message(&body).is_err());
        let fits = "\u{1F600}".repeat(MESSAGE_LIMIT / 2);
        assert_eq!(admitted_message(&fits).unwrap(), fits);
    }

    #[tokio::test]
    async fn a_local_or_byok_session_never_sends_feedback() {
        use crate::platform::runtime::session::PrivacyMode;
        for mode in [PrivacyMode::Local, PrivacyMode::Byok] {
            let reply = crate::cloud::send_feedback(mode, FeedbackKind::Bug, "it broke").await;
            assert_eq!(reply, CloudError::NotManaged(mode).to_string());
        }
    }
}
