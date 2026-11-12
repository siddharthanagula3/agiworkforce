use std::path::Path;
use std::time::Duration;

use agiworkforce_protocol::developer_session::{
    DeveloperSessionHandoff, DeveloperSessionTrustMode, HandoffEnvironment,
};
use serde::Deserialize;

use super::code_handoff::{Access, NETWORK_ACCESS};
use super::code_sessions::{CodeSession, CODE_SESSIONS_PATH};
use super::{CloudClient, CloudError};
use crate::runtime::session::{ManagedSession, PrivacyMode};
use crate::runtime::session_control::{ManagedSessionReference, ManagedSessionStore};
use crate::runtime::session_handoff::{developer_session_handoff, HandoffContext};

const HANDOFF_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pushed {
    pub session: CodeSession,
    pub seed_prompt: String,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
struct RefusalReply {
    error: RefusalError,
}

#[derive(Deserialize)]
struct RefusalError {
    #[serde(default)]
    refusal: Option<serde_json::Value>,
    #[serde(default)]
    message: Option<String>,
}

pub fn local_session(reference: Option<&str>, workspace: &Path) -> Result<ManagedSession, String> {
    let store = ManagedSessionStore::user_config().map_err(|error| error.to_string())?;
    let workspace = workspace
        .canonicalize()
        .unwrap_or_else(|_| workspace.to_path_buf());
    let in_workspace = |root: Option<&std::path::PathBuf>| {
        root.and_then(|root| root.canonicalize().ok())
            .is_some_and(|root| root == workspace)
    };
    let reference = match reference {
        Some(raw) => ManagedSessionReference::parse(raw).map_err(|error| error.to_string())?,
        None => {
            let latest = store
                .list_active()
                .map_err(|error| error.to_string())?
                .into_iter()
                .filter(|summary| in_workspace(summary.workspace_root.as_ref()))
                .max_by_key(|summary| summary.updated_at)
                .ok_or("No saved session in this folder to hand off. Start one with `agi`, or name one with its id.")?;
            ManagedSessionReference::SessionId(latest.session_id)
        }
    };
    let session = store.load(reference).map_err(|error| error.to_string())?;
    if !in_workspace(session.workspace_root.as_ref()) {
        return Err(
            "That session belongs to another folder; run this command from its checkout.".into(),
        );
    }
    Ok(session)
}

pub fn admit(session: &ManagedSession) -> Result<(), String> {
    let mode = session
        .routing_authority
        .as_ref()
        .map(|authority| authority.privacy_mode);
    let recorded = session.code.as_ref().map(|code| code.trust_mode);
    match (mode, recorded) {
        (Some(PrivacyMode::Managed), None | Some(DeveloperSessionTrustMode::Managed)) => Ok(()),
        (Some(PrivacyMode::Managed), Some(_)) | (None, _) => Err(format!(
            "Session {} has no readable Managed mode, so it stays on this machine and nothing \
             was handed off.",
            session.session_id
        )),
        (Some(mode), _) => Err(format!(
            "Session {id} runs in {} mode, so it stays on this machine and nothing was handed \
             off. To move its work to your account, open it with `agi resume {id}`, run \
             /continue-with-cloud and send the draft you review there; that starts a Managed \
             session you can hand off.",
            mode.trust_word(),
            id = session.session_id
        )),
    }
}

pub fn record(session: &ManagedSession) -> DeveloperSessionHandoff {
    developer_session_handoff(session, HandoffContext::to(HandoffEnvironment::Cloud))
}

pub fn body(handoff: &DeveloperSessionHandoff, access: &Access) -> serde_json::Value {
    let mut body = serde_json::json!({
        "handoff": handoff,
        "networkAccess": NETWORK_ACCESS,
    });
    if let Access::Installation {
        installation_id,
        full_name,
        ..
    } = access
    {
        body["repository"] = serde_json::json!({
            "installationId": installation_id,
            "fullName": full_name,
        });
    }
    body
}

fn refusal_text(refusal: &serde_json::Value) -> String {
    match refusal.get("reason").and_then(|reason| reason.as_str()) {
        Some("protocolVersionUnsupported") => {
            "The cloud does not accept this version of agi's handoff. Update agi and try again."
        }
        Some("expired") => "The handoff took too long to arrive. Run the command again.",
        Some("wrongAccount") => {
            "This session was handed off under a different account. Sign in with `agi login` as the account that owns it."
        }
        Some("trustModeUnknown") => {
            "This session's mode could not be read, so it cannot move to the cloud. Send one message in it first."
        }
        _ => "The cloud refused this handoff.",
    }
    .to_string()
}

pub async fn submit(client: &CloudClient, body: &serde_json::Value) -> Result<Pushed, CloudError> {
    let path = format!("{CODE_SESSIONS_PATH}/handoff");
    let key = format!("agi.code.cli.handoff.{}", uuid::Uuid::new_v4());
    let reply = client
        .post_reply(&path, Some(&key), body, HANDOFF_TIMEOUT)
        .await?;
    if reply.status == 422 {
        let error = serde_json::from_str::<RefusalReply>(&reply.body).ok();
        let message = match error {
            Some(RefusalReply {
                error:
                    RefusalError {
                        refusal: Some(refusal),
                        ..
                    },
            }) => refusal_text(&refusal),
            Some(RefusalReply {
                error:
                    RefusalError {
                        message: Some(message),
                        ..
                    },
            }) => message,
            _ => crate::schedules::api_error_message(&reply.body),
        };
        return Err(CloudError::Api {
            status: reply.status,
            message,
        });
    }
    if !reply.is_success() {
        return Err(CloudError::Api {
            status: reply.status,
            message: crate::schedules::api_error_message(&reply.body),
        });
    }
    serde_json::from_str(&reply.body).map_err(|error| CloudError::Decode(error.to_string()))
}

pub fn warning_text(warning: &str) -> String {
    match warning {
        "uncommitted_changes_not_included" => {
            "Uncommitted changes stay on this machine; the cloud session works from the pushed branch.".to_string()
        }
        other => format!("The cloud noted: {other}."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::session::ManagedSessionRoutingAuthority;

    fn session_in(mode: Option<PrivacyMode>) -> ManagedSession {
        let mut session = ManagedSession::new("s1", chrono::Utc::now());
        session.routing_authority = mode.map(|privacy_mode| ManagedSessionRoutingAuthority {
            privacy_mode,
            provider: "fixture-provider".to_string(),
        });
        session
    }

    #[test]
    fn only_a_managed_session_is_handed_to_the_cloud() {
        assert!(admit(&session_in(Some(PrivacyMode::Managed))).is_ok());

        for mode in [PrivacyMode::Local, PrivacyMode::Byok] {
            let refused = admit(&session_in(Some(mode))).unwrap_err();
            assert!(refused.contains(mode.trust_word()), "{refused}");
            assert!(refused.contains("nothing was handed off"), "{refused}");
            assert!(refused.contains("/continue-with-cloud"), "{refused}");
        }

        assert!(admit(&session_in(None)).is_err());

        let mut recorded_local = session_in(Some(PrivacyMode::Managed));
        let mut code = session_in(Some(PrivacyMode::Local)).code_session();
        code.trust_mode = DeveloperSessionTrustMode::Local;
        recorded_local.code = Some(Box::new(code));
        assert!(
            admit(&recorded_local).is_err(),
            "a record that names another mode was handed off"
        );
    }
}
