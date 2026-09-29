use crate::cloud::client::CloudClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedbackKind {
    Bug,
    Feature,
    General,
}

impl FeedbackKind {
    fn subject(self) -> &'static str {
        match self {
            FeedbackKind::Bug => "Bug report",
            FeedbackKind::Feature => "Feature request",
            FeedbackKind::General => "Product feedback",
        }
    }
}

pub fn parse_feedback_command(command: &str, arg: &str) -> Result<(FeedbackKind, String), String> {
    let arg = arg.trim();
    let (kind, text) = if command == "/bug" {
        (FeedbackKind::Bug, arg)
    } else if let Some(rest) = arg.strip_prefix("feature ") {
        (FeedbackKind::Feature, rest.trim())
    } else if let Some(rest) = arg.strip_prefix("bug ") {
        (FeedbackKind::Bug, rest.trim())
    } else {
        (FeedbackKind::General, arg)
    };
    if text.is_empty() {
        return Err(
            "Usage: /bug <what happened>, /feedback <your feedback>, or /feedback feature <what you want>."
                .to_string(),
        );
    }
    Ok((kind, text.to_string()))
}

pub async fn send_feedback(kind: FeedbackKind, text: &str) -> String {
    let client = match CloudClient::connect_managed() {
        Ok(client) => client,
        Err(_) => {
            return "Sign in with /login to send feedback from here, or email contact@agiworkforce.com."
                .to_string()
        }
    };
    let body = serde_json::json!({
        "subject": kind.subject(),
        "message": text,
        "metadata": {
            "source": "cli",
            "platform": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
            "version": env!("CARGO_PKG_VERSION"),
            "user_agent": format!("agiworkforce-cli/{}", env!("CARGO_PKG_VERSION")),
        },
    });
    match client
        .post::<_, serde_json::Value>("/api/feedback", &body)
        .await
    {
        Ok(_) => format!("{} sent. Thank you.", kind.subject()),
        Err(error) => format!("Could not send it: {error}"),
    }
}
