use std::time::Duration;

use agiworkforce_protocol::developer_session::{AccountLoginResponse, AccountStatusResponse};
use anyhow::{ensure, Context, Result};
use chrono::{DateTime, Utc};
use url::{Host, Url};

#[derive(Default)]
pub struct AccountPanel {
    pub visible: bool,
    pub status: Option<AccountView>,
    pub challenge: Option<DeviceLogin>,
    pub pending: Option<AccountOperation>,
    pub notice: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AccountOperation {
    Reading,
    Starting,
    Cancelling,
    SigningOut,
}

pub struct AccountView {
    pub signed_in: bool,
    pub email: Option<String>,
    pub tier: Option<String>,
    pub balance_credits: Option<f64>,
    pub purchased_credits: Option<f64>,
    pub cached: bool,
}

impl From<AccountStatusResponse> for AccountView {
    fn from(status: AccountStatusResponse) -> Self {
        Self {
            signed_in: status.signed_in,
            email: status.email.filter(|_| status.signed_in),
            tier: status.tier.filter(|_| status.signed_in),
            balance_credits: status
                .balance_credits
                .filter(|value| status.signed_in && value.is_finite()),
            purchased_credits: status
                .purchased_credits
                .filter(|value| status.signed_in && value.is_finite()),
            cached: status.cached,
        }
    }
}

pub struct DeviceLogin {
    pub id: String,
    pub verification_url: Url,
    pub user_code: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub wait_timeout: Duration,
}

impl DeviceLogin {
    pub fn new(
        response: AccountLoginResponse,
        now: DateTime<Utc>,
        grace: Duration,
    ) -> Result<Self> {
        ensure!(
            !response.login_id.trim().is_empty(),
            "The runtime returned an empty sign-in handle"
        );
        let verification_url = Url::parse(&response.verification_url)
            .context("The runtime returned an invalid sign-in URL")?;
        let loopback = match verification_url.host() {
            Some(Host::Ipv4(address)) => address.is_loopback(),
            Some(Host::Ipv6(address)) => address.is_loopback(),
            Some(Host::Domain("localhost")) => true,
            _ => false,
        };
        ensure!(
            verification_url.username().is_empty()
                && verification_url.password().is_none()
                && verification_url.fragment().is_none()
                && verification_url.host().is_some()
                && (verification_url.scheme() == "https"
                    || (verification_url.scheme() == "http" && loopback)),
            "The runtime returned an unsafe sign-in URL"
        );
        let expires_at = DateTime::parse_from_rfc3339(
            response
                .expires_at
                .as_deref()
                .context("The runtime did not state when this sign-in expires")?,
        )?
        .with_timezone(&Utc);
        let remaining = (expires_at - now)
            .to_std()
            .context("This sign-in code has expired. Start sign-in again.")?;
        ensure!(
            !remaining.is_zero(),
            "This sign-in code has expired. Start sign-in again."
        );
        let wait_timeout = remaining
            .checked_add(grace)
            .context("The sign-in deadline is out of range")?;
        Ok(Self {
            id: response.login_id,
            verification_url,
            user_code: response.user_code,
            expires_at,
            wait_timeout,
        })
    }
}
