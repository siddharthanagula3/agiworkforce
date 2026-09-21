//! Which surface is calling, which build of it, and which contract it speaks.
//! These mirror `packages/contracts/cloud-contracts/src/client-handshake.ts`,
//! and `scripts/check-client-handshake.mjs` fails when the two drift apart.

pub const SURFACE_HEADER: &str = "x-agi-surface";
pub const CLIENT_VERSION_HEADER: &str = "x-agi-client-version";
pub const API_VERSION_HEADER: &str = "x-agi-api-version";

pub const SOURCE_SURFACE: &str = "cli";
pub const API_CONTRACT_VERSION: &str = "2026-09-17";

/// Taken from the crate this binary was compiled from, never a literal.
pub const CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn headers() -> [(&'static str, &'static str); 3] {
    [
        (SURFACE_HEADER, SOURCE_SURFACE),
        (CLIENT_VERSION_HEADER, CLIENT_VERSION),
        (API_VERSION_HEADER, API_CONTRACT_VERSION),
    ]
}

pub fn apply(builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    headers()
        .into_iter()
        .fold(builder, |builder, (name, value)| {
            builder.header(name, value)
        })
}

/// Header the deployment answers with when it refuses this build's contract.
pub const MINIMUM_API_VERSION_HEADER: &str = "x-agi-api-version-minimum";

/// `CLIENT_UPDATE_REQUIRED` in `packages/contracts/types/src/errors.ts`.
pub const CLIENT_UPDATE_REQUIRED_STATUS: u16 = 426;

/// The contract version the deployment still answers, when it says so.
pub fn minimum_api_version(headers: &reqwest::header::HeaderMap) -> Option<String> {
    headers
        .get(MINIMUM_API_VERSION_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// Sending the contract version is half the handshake. A deployment that has
/// moved past this build answers 426, and a build that cannot read that answer
/// tells the user the request failed instead of telling them to update.
pub fn upgrade_required(
    status: u16,
    minimum_api_version: Option<String>,
    body: &str,
) -> Option<crate::errors::CliError> {
    if status != CLIENT_UPDATE_REQUIRED_STATUS {
        return None;
    }
    Some(crate::errors::CliError::ClientUpdateRequired {
        message: server_message(body),
        minimum_api_version,
    })
}

/// The deployment's own sentence, when the body carries one.
fn server_message(body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    parsed
        .pointer("/error/message")
        .or_else(|| parsed.get("message"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue};

    #[test]
    fn every_platform_request_names_the_surface_the_build_and_the_contract() {
        let names: Vec<&str> = headers().iter().map(|(name, _)| *name).collect();
        assert_eq!(
            names,
            vec![SURFACE_HEADER, CLIENT_VERSION_HEADER, API_VERSION_HEADER]
        );
    }

    #[test]
    fn the_client_version_is_the_crate_version_and_never_a_literal() {
        assert_eq!(CLIENT_VERSION, env!("CARGO_PKG_VERSION"));
        assert!(!CLIENT_VERSION.is_empty());
    }

    #[test]
    fn a_deployment_that_has_moved_past_this_build_produces_a_sentence_a_person_can_act_on() {
        let error = upgrade_required(
            CLIENT_UPDATE_REQUIRED_STATUS,
            Some("2026-10-01".to_string()),
            r#"{"error":{"code":"CLIENT_UPDATE_REQUIRED","message":"This deployment no longer answers 2026-09-17."}}"#,
        )
        .expect("a 426 answer is an upgrade refusal");

        let sentence = error.to_string();
        assert!(
            sentence.contains("Update the AGI CLI"),
            "the user is not told what to do: {sentence}"
        );
        assert!(sentence.contains("2026-10-01"), "{sentence}");
        assert!(
            sentence.contains("This deployment no longer answers 2026-09-17."),
            "the deployment's own sentence was dropped: {sentence}"
        );
        assert_eq!(error.kind(), "client_update_required");
        assert!(error.hint().contains("agi update"), "{}", error.hint());
    }

    #[test]
    fn a_refusal_with_no_body_and_no_minimum_still_says_what_to_do() {
        let error = upgrade_required(CLIENT_UPDATE_REQUIRED_STATUS, None, "").expect("a refusal");
        let sentence = error.to_string();
        assert!(sentence.contains("Update the AGI CLI"), "{sentence}");
        assert!(!sentence.contains("None"), "{sentence}");
    }

    #[test]
    fn any_other_status_is_not_an_upgrade_refusal() {
        for status in [200, 400, 401, 426 - 1, 500] {
            assert!(
                upgrade_required(status, None, "{}").is_none(),
                "HTTP {status} was read as an upgrade refusal"
            );
        }
    }

    #[test]
    fn the_minimum_the_deployment_advertises_is_read_off_the_answer() {
        let mut headers = HeaderMap::new();
        assert_eq!(minimum_api_version(&headers), None);
        headers.insert(
            MINIMUM_API_VERSION_HEADER,
            HeaderValue::from_static("  2026-10-01  "),
        );
        assert_eq!(
            minimum_api_version(&headers),
            Some("2026-10-01".to_string())
        );
        headers.insert(MINIMUM_API_VERSION_HEADER, HeaderValue::from_static("   "));
        assert_eq!(minimum_api_version(&headers), None);
    }
}
