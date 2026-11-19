use serde::{Deserialize, Serialize};

use super::client::{CloudClient, CloudError, Route};
use crate::platform::runtime::session::PrivacyMode;

pub const REFERRALS_PATH: &str = "/api/referrals";
pub const REFERRAL_CODE_PATH: &str = "/api/referrals/code";

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferralProgram {
    pub friend_trial_days: u32,
    pub reward_credits: u32,
    pub hold_days: u32,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct ReferralOverview {
    code: Option<String>,
    link: Option<String>,
    program: ReferralProgram,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
struct ReferralCode {
    code: String,
    link: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Invite {
    pub code: String,
    pub link: String,
    pub program: ReferralProgram,
}

pub fn overview_route() -> Route {
    Route::get(REFERRALS_PATH)
}

pub fn code_route() -> Route {
    Route::post(REFERRAL_CODE_PATH)
}

pub async fn invite(privacy: PrivacyMode) -> Result<Invite, CloudError> {
    let client = CloudClient::connect(privacy)?;
    let overview: ReferralOverview = client.call(&overview_route(), &[], None).await?;
    let (code, link) = match (overview.code, overview.link) {
        (Some(code), Some(link)) => (code, link),
        _ => {
            let created: ReferralCode = client.call(&code_route(), &[], None).await?;
            (created.code, created.link)
        }
    };
    Ok(Invite {
        code,
        link,
        program: overview.program,
    })
}

pub fn invite_text(invite: &Invite) -> String {
    format!(
        "{}\n\nFriends who join with this link get {} days of {} free. When their first payment \
         goes through, they get {} bonus credits, and you get {} bonus credits {} days later.",
        invite.link,
        invite.program.friend_trial_days,
        crate::tier_cache::UserTier::Pro.label(),
        invite.program.reward_credits,
        invite.program.reward_credits,
        invite.program.hold_days,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_local_or_byok_session_never_asks_the_account_for_an_invite() {
        for mode in [PrivacyMode::Local, PrivacyMode::Byok] {
            let refused = invite(mode)
                .await
                .err()
                .expect("a non-Cloud session must be refused before any request");
            assert!(matches!(refused, CloudError::NotManaged(seen) if seen == mode));
        }
    }
}
