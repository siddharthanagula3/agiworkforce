//! Server-authoritative account usage read.
//!
//! Mirrors `ManagedUsageSummaryResponse` in
//! `packages/contracts/types/src/managed-usage-balance.ts`, so the CLI reports
//! the same remaining allowance the web app reports from the same ledger.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::time::Duration;

use crate::tier_cache::{self, UserTier};

const USAGE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const USAGE_PATH: &str = "/api/usage";

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct UsageCreditWindow {
    pub allowance: f64,
    pub used: f64,
    pub remaining: f64,
    #[serde(default)]
    pub reset_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PurchasedCredits {
    #[serde(default)]
    pub remaining: Option<f64>,
    #[serde(default)]
    pub overage_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct UsageCredits {
    pub monthly: UsageCreditWindow,
    pub weekly: UsageCreditWindow,
    pub five_hour: UsageCreditWindow,
    #[serde(default)]
    pub flagship_weekly: Option<UsageCreditWindow>,
    pub purchased: PurchasedCredits,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AccountUsage {
    pub plan_tier: String,
    pub usage_percentage: f64,
    pub has_usage_remaining: bool,
    #[serde(default)]
    pub usage_reset_at: Option<String>,
    #[serde(default)]
    pub session_usage_percentage: f64,
    #[serde(default)]
    pub session_reset_at: Option<String>,
    #[serde(default)]
    pub weekly_usage_percentage: f64,
    #[serde(default)]
    pub weekly_reset_at: Option<String>,
    #[serde(default)]
    pub flagship_weekly_usage_percentage: f64,
    #[serde(default)]
    pub flagship_weekly_reset_at: Option<String>,
    #[serde(default)]
    pub usage_allocation: Option<String>,
    #[serde(default)]
    pub credits: Option<UsageCredits>,
}

pub fn parse_account_usage(body: &str) -> Result<AccountUsage, serde_json::Error> {
    serde_json::from_str(body)
}

#[derive(Debug)]
pub enum UsageFetchError {
    /// 401, 402 and 403 all mean the cached tier no longer describes the account.
    EntitlementChanged(u16),
    Other(anyhow::Error),
}

impl std::fmt::Display for UsageFetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UsageFetchError::EntitlementChanged(401) => {
                f.write_str("session expired, run `agi login`")
            }
            UsageFetchError::EntitlementChanged(402) => {
                f.write_str("plan payment required, see https://agiworkforce.com/pricing")
            }
            UsageFetchError::EntitlementChanged(403) => {
                f.write_str("this account cannot read managed usage")
            }
            UsageFetchError::EntitlementChanged(status) => write!(f, "HTTP {status}"),
            UsageFetchError::Other(error) => write!(f, "{error}"),
        }
    }
}

pub enum UsageMode {
    Managed(String),
    LocalOnly(&'static str),
}

pub fn usage_mode() -> UsageMode {
    let cached_tier = tier_cache::read_tier_cache().map(|cached| cached.tier);
    if matches!(cached_tier, Some(UserTier::Byok)) {
        return UsageMode::LocalOnly(
            "this account runs in BYOK mode, so provider spend is billed by the provider",
        );
    }
    match tier_cache::load_jwt() {
        Some(jwt) if !jwt.is_empty() => UsageMode::Managed(jwt),
        _ => UsageMode::LocalOnly(
            "no AGI Workforce credential, so this session runs local or BYOK, run `agi login` to see account usage",
        ),
    }
}

pub async fn fetch_account_usage(jwt: &str) -> Result<AccountUsage, UsageFetchError> {
    let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| tier_cache::default_api_base().to_string());
    let base = tier_cache::resolve_agi_api_base(&raw_base).ok_or_else(|| {
        UsageFetchError::Other(anyhow::anyhow!(
            "AGIWORKFORCE_API_BASE must be an https agiworkforce.com host"
        ))
    })?;

    let client = reqwest::Client::builder()
        .timeout(USAGE_FETCH_TIMEOUT)
        .build()
        .map_err(|e| UsageFetchError::Other(anyhow::anyhow!("{e}")))?;

    let response = client
        .get(format!("{base}{USAGE_PATH}"))
        .header("Authorization", format!("Bearer {jwt}"))
        .header("Accept", "application/json")
        .header("X-AGI-Surface", "cli")
        .send()
        .await
        .map_err(|e| UsageFetchError::Other(anyhow::anyhow!("{e}")))?;

    let status = response.status().as_u16();
    if tier_cache::status_invalidates_tier(status) {
        tier_cache::invalidate_tier_cache();
        return Err(UsageFetchError::EntitlementChanged(status));
    }
    if !response.status().is_success() {
        return Err(UsageFetchError::Other(anyhow::anyhow!(
            "usage API returned HTTP {status}"
        )));
    }

    let body = response
        .text()
        .await
        .map_err(|e| UsageFetchError::Other(anyhow::anyhow!("{e}")))?;
    let usage =
        parse_account_usage(&body).map_err(|e| UsageFetchError::Other(anyhow::anyhow!(e)))?;
    tier_cache::adopt_server_plan(&usage.plan_tier);
    Ok(usage)
}

pub async fn account_lines() -> Vec<String> {
    let jwt = match usage_mode() {
        UsageMode::Managed(jwt) => jwt,
        UsageMode::LocalOnly(reason) => return unavailable_lines(reason),
    };
    match fetch_account_usage(&jwt).await {
        Ok(usage) => render_account_usage(&usage, Utc::now()),
        Err(error) => unavailable_lines(&error.to_string()),
    }
}

/// The TUI slash dispatcher is synchronous; an owned current-thread runtime
/// keeps this off whatever reactor the caller is already on.
pub fn account_lines_blocking() -> Vec<String> {
    std::thread::spawn(|| {
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(error) => return unavailable_lines(&error.to_string()),
        };
        runtime.block_on(account_lines())
    })
    .join()
    .unwrap_or_else(|_| unavailable_lines("the usage lookup thread stopped"))
}

fn unavailable_lines(reason: &str) -> Vec<String> {
    vec![
        "Account usage".to_string(),
        format!("  unavailable: {reason}"),
    ]
}

pub fn render_account_usage(usage: &AccountUsage, now: DateTime<Utc>) -> Vec<String> {
    let mut lines = vec![
        "Account usage".to_string(),
        format!("  plan: {}", plan_label(&usage.plan_tier)),
    ];

    if usage.usage_allocation.as_deref() == Some("pending") {
        lines.push("  allowance: not provisioned yet".to_string());
    }

    match usage.credits.as_ref() {
        Some(credits) => {
            lines.push(credit_line("5-hour", &credits.five_hour, now));
            lines.push(credit_line("weekly", &credits.weekly, now));
            lines.push(credit_line("monthly", &credits.monthly, now));
            if let Some(flagship) = credits.flagship_weekly.as_ref() {
                lines.push(credit_line("flagship weekly", flagship, now));
            }
            lines.push(purchased_line(&credits.purchased));
        }
        None => {
            lines.push(percent_line(
                "5-hour",
                usage.session_usage_percentage,
                usage.session_reset_at.as_deref(),
                now,
            ));
            lines.push(percent_line(
                "weekly",
                usage.weekly_usage_percentage,
                usage.weekly_reset_at.as_deref(),
                now,
            ));
            lines.push(percent_line(
                "monthly",
                usage.usage_percentage,
                usage.usage_reset_at.as_deref(),
                now,
            ));
            if usage.flagship_weekly_usage_percentage > 0.0 {
                lines.push(percent_line(
                    "flagship weekly",
                    usage.flagship_weekly_usage_percentage,
                    usage.flagship_weekly_reset_at.as_deref(),
                    now,
                ));
            }
            lines.push("  credits: not reported by this server".to_string());
        }
    }

    if !usage.has_usage_remaining {
        lines.push("  no allowance remaining on this plan".to_string());
    }
    lines
}

fn plan_label(plan_tier: &str) -> String {
    tier_cache::parse_tier(plan_tier)
        .map(|tier| tier.label().to_string())
        .unwrap_or_else(|| plan_tier.to_string())
}

fn credit_line(label: &str, window: &UsageCreditWindow, now: DateTime<Utc>) -> String {
    format!(
        "  {label}: {} of {} credits used, {} left{}",
        fmt_credits(window.used),
        fmt_credits(window.allowance),
        fmt_credits(window.remaining),
        reset_suffix(window.reset_at.as_deref(), now)
    )
}

fn percent_line(
    label: &str,
    percentage: f64,
    reset_at: Option<&str>,
    now: DateTime<Utc>,
) -> String {
    format!(
        "  {label}: {percentage:.0}% used{}",
        reset_suffix(reset_at, now)
    )
}

fn purchased_line(purchased: &PurchasedCredits) -> String {
    let balance = match purchased.remaining {
        Some(remaining) => format!("{} credits", fmt_credits(remaining)),
        None => "unknown".to_string(),
    };
    let overage = if purchased.overage_enabled {
        "overage on"
    } else {
        "overage off"
    };
    format!("  purchased credits: {balance}, {overage}")
}

fn fmt_credits(value: f64) -> String {
    if value.fract().abs() < 1e-9 {
        format!("{value:.0}")
    } else {
        format!("{value:.2}")
    }
}

fn reset_suffix(reset_at: Option<&str>, now: DateTime<Utc>) -> String {
    let Some(reset_at) = reset_at else {
        return String::new();
    };
    match DateTime::parse_from_rfc3339(reset_at) {
        Ok(parsed) => {
            let seconds = parsed
                .with_timezone(&Utc)
                .signed_duration_since(now)
                .num_seconds();
            if seconds <= 0 {
                ", resetting now".to_string()
            } else {
                format!(", resets in {}", fmt_duration(seconds))
            }
        }
        Err(_) => format!(", resets {reset_at}"),
    }
}

fn fmt_duration(total_seconds: i64) -> String {
    let days = total_seconds / 86_400;
    let hours = (total_seconds % 86_400) / 3_600;
    let minutes = (total_seconds % 3_600) / 60;
    if days > 0 {
        format!("{days}d {hours}h")
    } else if hours > 0 {
        format!("{hours}h {minutes}m")
    } else {
        format!("{}m", minutes.max(1))
    }
}

#[derive(Debug, Clone, Default)]
pub struct SessionEstimate {
    pub turns: u32,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_write_tokens: u32,
    pub estimated_cost_usd: f64,
    pub model: String,
}

pub fn render_session_estimate(estimate: &SessionEstimate) -> Vec<String> {
    vec![
        "Session estimate (this CLI session, priced locally, not the billed figure)".to_string(),
        format!("  turns: {}", estimate.turns),
        format!(
            "  tokens: {} in, {} out, {} cache read, {} cache write",
            estimate.input_tokens,
            estimate.output_tokens,
            estimate.cache_read_tokens,
            estimate.cache_write_tokens
        ),
        format!("  estimated cost: ${:.6}", estimate.estimated_cost_usd),
        format!("  model: {}", estimate.model),
    ]
}

pub async fn render_usage_report(estimate: &SessionEstimate) -> String {
    let mut lines = account_lines().await;
    lines.push(String::new());
    lines.extend(render_session_estimate(estimate));
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contract_fixture() -> &'static str {
        r#"{
            "plan_tier": "max_15x",
            "usage_percentage": 42,
            "usage_reset_at": "2026-09-30T00:00:00.000Z",
            "has_usage_remaining": true,
            "period_start": "2026-09-01T00:00:00.000Z",
            "period_end": "2026-09-30T00:00:00.000Z",
            "subscription_status": "active",
            "session_usage_percentage": 5,
            "session_reset_at": "2026-09-13T15:00:00.000Z",
            "weekly_usage_percentage": 18,
            "weekly_reset_at": "2026-09-15T00:00:00.000Z",
            "flagship_weekly_usage_percentage": 3,
            "flagship_weekly_reset_at": "2026-09-15T00:00:00.000Z",
            "credit_balance_cents": 1250,
            "overage_enabled": true,
            "usage_allocation": "provisioned",
            "credits": {
                "monthly": {
                    "allowance": 10000,
                    "used": 4200.5,
                    "remaining": 5799.5,
                    "reset_at": "2026-09-30T00:00:00.000Z"
                },
                "weekly": {
                    "allowance": 2500,
                    "used": 450,
                    "remaining": 2050,
                    "reset_at": "2026-09-15T00:00:00.000Z"
                },
                "five_hour": {
                    "allowance": 200,
                    "used": 10.25,
                    "remaining": 189.75,
                    "reset_at": "2026-09-13T15:00:00.000Z"
                },
                "flagship_weekly": {
                    "allowance": 500,
                    "used": 15,
                    "remaining": 485,
                    "reset_at": "2026-09-15T00:00:00.000Z"
                },
                "purchased": { "remaining": 120.5, "overage_enabled": true }
            }
        }"#
    }

    fn fixture_now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-09-13T12:00:00Z")
            .expect("fixture clock must parse")
            .with_timezone(&Utc)
    }

    #[test]
    fn parses_every_contract_field_the_cli_prints() {
        let usage = parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        assert_eq!(usage.plan_tier, "max_15x");
        assert!(usage.has_usage_remaining);
        assert_eq!(usage.usage_allocation.as_deref(), Some("provisioned"));

        let credits = usage.credits.expect("fixture states credits");
        assert_eq!(credits.five_hour.allowance, 200.0);
        assert_eq!(credits.five_hour.used, 10.25);
        assert_eq!(credits.five_hour.remaining, 189.75);
        assert_eq!(
            credits.five_hour.reset_at.as_deref(),
            Some("2026-09-13T15:00:00.000Z")
        );
        assert_eq!(credits.weekly.remaining, 2050.0);
        assert_eq!(credits.monthly.remaining, 5799.5);
        assert_eq!(
            credits
                .flagship_weekly
                .expect("fixture has flagship")
                .remaining,
            485.0
        );
        assert_eq!(credits.purchased.remaining, Some(120.5));
        assert!(credits.purchased.overage_enabled);
    }

    #[test]
    fn renders_each_meter_with_remaining_and_reset() {
        let usage = parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        let rendered = render_account_usage(&usage, fixture_now()).join("\n");
        assert!(rendered.contains("plan: Max 15x"), "{rendered}");
        assert!(
            rendered.contains("5-hour: 10.25 of 200 credits used, 189.75 left, resets in 3h 0m"),
            "{rendered}"
        );
        assert!(
            rendered.contains("weekly: 450 of 2500 credits used, 2050 left, resets in 1d 12h"),
            "{rendered}"
        );
        assert!(
            rendered.contains("monthly: 4200.50 of 10000 credits used"),
            "{rendered}"
        );
        assert!(
            rendered.contains("flagship weekly: 15 of 500 credits used"),
            "{rendered}"
        );
        assert!(
            rendered.contains("purchased credits: 120.50 credits, overage on"),
            "{rendered}"
        );
    }

    #[test]
    fn a_server_without_credits_falls_back_to_percentages() {
        let body = r#"{
            "plan_tier": "pro",
            "usage_percentage": 61,
            "usage_reset_at": null,
            "has_usage_remaining": true,
            "session_usage_percentage": 12,
            "session_reset_at": null,
            "weekly_usage_percentage": 30,
            "weekly_reset_at": null,
            "flagship_weekly_usage_percentage": 0,
            "flagship_weekly_reset_at": null
        }"#;
        let usage = parse_account_usage(body).expect("older summary must still parse");
        assert!(usage.credits.is_none());
        let rendered = render_account_usage(&usage, fixture_now()).join("\n");
        assert!(rendered.contains("monthly: 61% used"), "{rendered}");
        assert!(
            rendered.contains("credits: not reported by this server"),
            "{rendered}"
        );
        assert!(!rendered.contains("0 credits"), "{rendered}");
    }

    #[test]
    fn an_exhausted_plan_says_so() {
        let usage = AccountUsage {
            plan_tier: "free".to_string(),
            usage_percentage: 100.0,
            has_usage_remaining: false,
            usage_reset_at: None,
            session_usage_percentage: 100.0,
            session_reset_at: None,
            weekly_usage_percentage: 100.0,
            weekly_reset_at: None,
            flagship_weekly_usage_percentage: 0.0,
            flagship_weekly_reset_at: None,
            usage_allocation: None,
            credits: None,
        };
        let rendered = render_account_usage(&usage, fixture_now()).join("\n");
        assert!(rendered.contains("no allowance remaining"), "{rendered}");
    }

    #[test]
    fn a_pending_allocation_is_not_reported_as_spent() {
        let mut usage =
            parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        usage.usage_allocation = Some("pending".to_string());
        let rendered = render_account_usage(&usage, fixture_now()).join("\n");
        assert!(
            rendered.contains("allowance: not provisioned yet"),
            "{rendered}"
        );
    }

    #[test]
    fn a_malformed_summary_is_an_error_not_a_zero_allowance() {
        assert!(parse_account_usage(r#"{"plan_tier":"pro"}"#).is_err());
        assert!(parse_account_usage("not json").is_err());
    }

    #[test]
    fn session_estimate_is_labelled_as_an_estimate() {
        let rendered = render_session_estimate(&SessionEstimate {
            turns: 3,
            input_tokens: 1_200,
            output_tokens: 340,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            estimated_cost_usd: 0.0125,
            model: "fixture-model".to_string(),
        })
        .join("\n");
        assert!(rendered.contains("estimate"), "{rendered}");
        assert!(rendered.contains("not the billed figure"), "{rendered}");
    }

    #[test]
    fn a_usage_read_adopts_the_server_plan_over_a_stale_cached_tier() {
        let usage = parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        assert_eq!(
            tier_cache::tier_to_adopt(&usage.plan_tier, Some(&UserTier::Pro)),
            Some(UserTier::Max15x)
        );
        assert_eq!(
            tier_cache::tier_to_adopt(&usage.plan_tier, Some(&UserTier::Max15x)),
            None
        );
    }

    #[test]
    fn entitlement_answers_invalidate_the_tier_and_explain_themselves() {
        for status in [401, 402, 403] {
            assert!(tier_cache::status_invalidates_tier(status));
            let message = UsageFetchError::EntitlementChanged(status).to_string();
            assert!(!message.is_empty(), "HTTP {status} must explain itself");
            assert_eq!(unavailable_lines(&message).len(), 2);
        }
        assert!(!tier_cache::status_invalidates_tier(500));
    }

    #[test]
    fn reset_suffix_handles_a_past_and_unparseable_timestamp() {
        assert_eq!(
            reset_suffix(Some("2026-09-13T11:00:00Z"), fixture_now()),
            ", resetting now"
        );
        assert_eq!(
            reset_suffix(Some("tomorrow"), fixture_now()),
            ", resets tomorrow"
        );
        assert_eq!(reset_suffix(None, fixture_now()), "");
    }
}
