//! Server-authoritative account usage read.
//!
//! Mirrors `ManagedUsageSummaryResponse` in
//! `packages/contracts/types/src/managed-usage-balance.ts`, so the CLI reports
//! the same remaining allowance the web app reports from the same ledger.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::time::Duration;

use crate::cost_ledger::{credit_amount, credits_for_cents, format_credits, format_usd_as_credits};
use crate::tier_cache::{self, UserTier};

const USAGE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const USAGE_PATH: &str = "/api/usage";
const USAGE_HISTORY_PATH: &str = "/api/usage/history";
const BILLING_PATH: &str = "/settings/billing";
const PRICING_PATH: &str = "/pricing";
const USAGE_SETTINGS_PATH: &str = "/settings/usage";
const FLAGSHIP_LIMIT_CODE: &str = "flagship_weekly_limit_reached";
const ENTITLED_SUBSCRIPTION_STATUSES: [&str; 2] = ["active", "trialing"];
const PAYMENT_FAILED_SUBSCRIPTION_STATUSES: [&str; 3] = ["past_due", "unpaid", "incomplete"];
const HISTORY_MODEL_LIMIT: usize = 8;
const HISTORY_DAY_LIMIT: usize = 7;
const SECONDS_PER_DAY: i64 = 86_400;

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
    pub subscription_status: Option<String>,
    #[serde(default)]
    pub usage_allocation: Option<String>,
    #[serde(default)]
    pub credits: Option<UsageCredits>,
}

pub fn parse_account_usage(body: &str) -> Result<AccountUsage, serde_json::Error> {
    serde_json::from_str(body)
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryTotals {
    pub requests: u64,
    pub cost_cents: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryDay {
    pub day: String,
    pub requests: u64,
    pub cost_cents: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryBreakdown {
    pub key: String,
    pub requests: u64,
    pub cost_cents: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryFreshness {
    pub unsettled_requests: u64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistory {
    pub from: String,
    pub to: String,
    pub totals: UsageHistoryTotals,
    pub daily: Vec<UsageHistoryDay>,
    pub by_model: Vec<UsageHistoryBreakdown>,
    pub freshness: UsageHistoryFreshness,
}

pub fn parse_usage_history(body: &str) -> Result<UsageHistory, serde_json::Error> {
    serde_json::from_str(body)
}

fn web_link(path: &str) -> String {
    format!("{}{path}", tier_cache::default_api_base())
}

pub fn recovery_sentence(href: &str) -> String {
    let url = web_link(href);
    match href {
        BILLING_PATH => format!("Add credits or fix billing at {url}."),
        PRICING_PATH => format!("Compare plans at {url}."),
        USAGE_SETTINGS_PATH => format!("See every usage window at {url}."),
        _ => format!("More options at {url}."),
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct UsageLimitContext {
    pub resets_in: Option<String>,
    pub alternative_model: Option<String>,
}

fn limit_window_reset<'a>(usage: &'a AccountUsage, code: &str) -> Option<&'a str> {
    let credits = usage.credits.as_ref();
    match code {
        "rolling_five_hour_limit_reached" => credits
            .and_then(|credits| credits.five_hour.reset_at.as_deref())
            .or(usage.session_reset_at.as_deref()),
        "rolling_weekly_limit_reached" => credits
            .and_then(|credits| credits.weekly.reset_at.as_deref())
            .or(usage.weekly_reset_at.as_deref()),
        FLAGSHIP_LIMIT_CODE => credits
            .and_then(|credits| credits.flagship_weekly.as_ref())
            .and_then(|window| window.reset_at.as_deref())
            .or(usage.flagship_weekly_reset_at.as_deref()),
        "insufficient_credits"
        | "monthly_limit_exceeded"
        | "monthly_credit_limit_reached"
        | "free_trial_token_budget_reached" => credits
            .and_then(|credits| credits.monthly.reset_at.as_deref())
            .or(usage.usage_reset_at.as_deref()),
        _ => None,
    }
}

fn time_until(reset_at: &str, now: DateTime<Utc>) -> Option<String> {
    let seconds = DateTime::parse_from_rfc3339(reset_at)
        .ok()?
        .with_timezone(&Utc)
        .signed_duration_since(now)
        .num_seconds();
    (seconds > 0).then(|| fmt_duration(seconds))
}

pub fn usage_limit_context_from(
    usage: &AccountUsage,
    code: &str,
    now: DateTime<Utc>,
) -> UsageLimitContext {
    let alternative_model = if code == FLAGSHIP_LIMIT_CODE {
        tier_cache::parse_tier(&usage.plan_tier)
            .and_then(|tier| crate::model_catalog::standard_model_for_tier(&tier))
    } else {
        None
    };
    UsageLimitContext {
        resets_in: limit_window_reset(usage, code).and_then(|reset_at| time_until(reset_at, now)),
        alternative_model,
    }
}

pub async fn usage_limit_context(jwt: &str, code: &str) -> UsageLimitContext {
    match fetch_account_usage(jwt).await {
        Ok(usage) => usage_limit_context_from(&usage, code, Utc::now()),
        Err(_) => UsageLimitContext::default(),
    }
}

#[derive(Debug)]
pub enum UsageFetchError {
    /// 401, 402 and 403 all mean the cached tier no longer describes the
    /// account; 403 is shared, so `detail` carries the server's own sentence.
    EntitlementChanged {
        status: u16,
        detail: Option<String>,
    },
    Other(anyhow::Error),
}

impl UsageFetchError {
    pub fn entitlement(status: u16) -> UsageFetchError {
        UsageFetchError::EntitlementChanged {
            status,
            detail: None,
        }
    }
}

/// The `{ error: { code, message } }` body every API error carries. An empty or
/// unparseable body just means there is no detail to add.
fn entitlement_detail(body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    let message = parsed.get("error")?.get("message")?.as_str()?.trim();
    (!message.is_empty()).then(|| message.to_string())
}

impl std::fmt::Display for UsageFetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UsageFetchError::EntitlementChanged {
                status: 401,
                detail,
            } => match detail {
                Some(detail) => write!(f, "{detail} Run `agi login`."),
                None => f.write_str("session expired, run `agi login`"),
            },
            UsageFetchError::EntitlementChanged {
                status: 402,
                detail,
            } => {
                let billing = web_link(BILLING_PATH);
                match detail {
                    Some(detail) => write!(f, "{detail} Fix billing at {billing}"),
                    None => write!(
                        f,
                        "a payment on this plan did not go through, update your payment method at {billing}"
                    ),
                }
            }
            UsageFetchError::EntitlementChanged {
                status: 403,
                detail,
            } => match detail {
                Some(detail) => f.write_str(detail),
                None => f.write_str("this account cannot read managed usage"),
            },
            UsageFetchError::EntitlementChanged { status, .. } => write!(f, "HTTP {status}"),
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
    let body = fetch_account_body(jwt, USAGE_PATH).await?;
    let usage =
        parse_account_usage(&body).map_err(|e| UsageFetchError::Other(anyhow::anyhow!(e)))?;
    tier_cache::adopt_server_plan(&usage.plan_tier);
    Ok(usage)
}

pub async fn fetch_usage_history(jwt: &str) -> Result<UsageHistory, UsageFetchError> {
    let body = fetch_account_body(jwt, USAGE_HISTORY_PATH).await?;
    parse_usage_history(&body).map_err(|e| UsageFetchError::Other(anyhow::anyhow!(e)))
}

async fn fetch_account_body(jwt: &str, path: &str) -> Result<String, UsageFetchError> {
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

    let response = crate::cloud::handshake::apply(
        client
            .get(format!("{base}{path}"))
            .header("Authorization", format!("Bearer {jwt}"))
            .header("Accept", "application/json"),
    )
    .send()
    .await
    .map_err(|e| UsageFetchError::Other(anyhow::anyhow!("{e}")))?;

    let status = response.status().as_u16();
    if tier_cache::status_invalidates_tier(status) {
        tier_cache::invalidate_tier_cache();
        let detail = response
            .text()
            .await
            .ok()
            .as_deref()
            .and_then(entitlement_detail);
        return Err(UsageFetchError::EntitlementChanged { status, detail });
    }
    if !response.status().is_success() {
        return Err(UsageFetchError::Other(anyhow::anyhow!(
            "usage API returned HTTP {status}"
        )));
    }

    response
        .text()
        .await
        .map_err(|e| UsageFetchError::Other(anyhow::anyhow!("{e}")))
}

pub async fn account_lines() -> Vec<String> {
    let jwt = match usage_mode() {
        UsageMode::Managed(jwt) => jwt,
        UsageMode::LocalOnly(reason) => return unavailable_lines(reason),
    };
    let (usage, history) = tokio::join!(fetch_account_usage(&jwt), fetch_usage_history(&jwt));
    let mut lines = match usage {
        Ok(usage) => render_account_usage(&usage, Utc::now()),
        Err(error) => return unavailable_lines(&error.to_string()),
    };
    lines.push(String::new());
    match history {
        Ok(history) => lines.extend(render_usage_history(&history)),
        Err(error) => lines.push(format!("Usage history unavailable: {error}")),
    }
    lines
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
        format!("  Unavailable: {reason}"),
    ]
}

pub fn render_account_usage(usage: &AccountUsage, now: DateTime<Utc>) -> Vec<String> {
    let mut lines = vec![
        "Account usage".to_string(),
        format!("  Plan: {}", plan_label(&usage.plan_tier)),
    ];

    lines.extend(subscription_lines(usage.subscription_status.as_deref()));

    if usage.usage_allocation.as_deref() == Some("pending") {
        lines.push("  Allowance: not provisioned yet".to_string());
    }

    match usage.credits.as_ref() {
        Some(credits) => {
            lines.push(credit_line("5-hour window", &credits.five_hour, now));
            lines.push(credit_line("Weekly", &credits.weekly, now));
            lines.push(credit_line("Monthly", &credits.monthly, now));
            if let Some(flagship) = credits.flagship_weekly.as_ref() {
                lines.push(credit_line("Flagship weekly", flagship, now));
            }
            lines.push(purchased_line(&credits.purchased));
            lines.push(format!("  Add credits: {}", web_link(BILLING_PATH)));
        }
        None => {
            lines.push(percent_line(
                "5-hour window",
                usage.session_usage_percentage,
                usage.session_reset_at.as_deref(),
                now,
            ));
            lines.push(percent_line(
                "Weekly",
                usage.weekly_usage_percentage,
                usage.weekly_reset_at.as_deref(),
                now,
            ));
            lines.push(percent_line(
                "Monthly",
                usage.usage_percentage,
                usage.usage_reset_at.as_deref(),
                now,
            ));
            if usage.flagship_weekly_usage_percentage > 0.0 {
                lines.push(percent_line(
                    "Flagship weekly",
                    usage.flagship_weekly_usage_percentage,
                    usage.flagship_weekly_reset_at.as_deref(),
                    now,
                ));
            }
            lines.push("  Credits: not reported by this server".to_string());
        }
    }

    if !usage.has_usage_remaining {
        lines.push("  No allowance remaining on this plan".to_string());
    }
    lines
}

fn plan_label(plan_tier: &str) -> String {
    tier_cache::parse_tier(plan_tier)
        .map(|tier| tier.label().to_string())
        .unwrap_or_else(|| plan_tier.to_string())
}

fn subscription_status_label(status: &str) -> String {
    match status {
        "trialing" => "trial".to_string(),
        other => other.replace('_', " "),
    }
}

fn subscription_lines(status: Option<&str>) -> Vec<String> {
    let Some(status) = status.map(str::trim).filter(|status| !status.is_empty()) else {
        return Vec::new();
    };
    let status = status.to_ascii_lowercase();
    if status == "none" {
        return Vec::new();
    }
    let mut lines = vec![format!(
        "  Subscription: {}",
        subscription_status_label(&status)
    )];
    if ENTITLED_SUBSCRIPTION_STATUSES.contains(&status.as_str()) {
        return lines;
    }
    if PAYMENT_FAILED_SUBSCRIPTION_STATUSES.contains(&status.as_str()) {
        lines.push(
            "  Payment failed: until it is paid this account runs on Free, and plan features and purchased credits are paused.".to_string(),
        );
        lines.push(format!(
            "  Fix it: update your payment method at {}",
            web_link(BILLING_PATH)
        ));
    } else if status == "paused" {
        lines.push("  While the subscription is paused this account runs on Free.".to_string());
        lines.push(format!("  Resume it at {}", web_link(BILLING_PATH)));
    } else {
        lines.push("  This subscription has ended, so this account runs on Free.".to_string());
        lines.push(format!("  Choose a plan at {}", web_link(PRICING_PATH)));
    }
    lines
}

fn credit_line(label: &str, window: &UsageCreditWindow, now: DateTime<Utc>) -> String {
    format!(
        "  {label}: {} of {} credits used, {} left{}",
        credit_amount(window.used),
        credit_amount(window.allowance),
        credit_amount(window.remaining),
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
        Some(remaining) => format_credits(remaining),
        None => "unknown".to_string(),
    };
    let overage = if purchased.overage_enabled {
        "overage on"
    } else {
        "overage off"
    };
    format!("  Purchased credits: {balance}, {overage}")
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

fn request_count(requests: u64) -> String {
    if requests == 1 {
        "1 request".to_string()
    } else {
        format!("{requests} requests")
    }
}

fn history_window_days(history: &UsageHistory) -> Option<i64> {
    let from = DateTime::parse_from_rfc3339(&history.from).ok()?;
    let to = DateTime::parse_from_rfc3339(&history.to).ok()?;
    let seconds = to.signed_duration_since(from).num_seconds();
    Some(((seconds + SECONDS_PER_DAY / 2) / SECONDS_PER_DAY).max(1))
}

fn history_day_label(day: &str) -> String {
    DateTime::parse_from_rfc3339(day)
        .map(|parsed| parsed.with_timezone(&Utc).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| day.to_string())
}

pub fn render_usage_history(history: &UsageHistory) -> Vec<String> {
    let window = history_window_days(history)
        .map(|days| format!("last {days} {}", if days == 1 { "day" } else { "days" }))
        .unwrap_or_else(|| format!("{} to {}", history.from, history.to));
    let mut lines = vec![format!(
        "Usage history, {window}: {}, {}",
        format_credits(credits_for_cents(history.totals.cost_cents)),
        request_count(history.totals.requests)
    )];
    if history.by_model.is_empty() && history.daily.is_empty() {
        lines.push("  No settled usage in this window".to_string());
    }
    if !history.by_model.is_empty() {
        lines.push("  By model:".to_string());
        lines.extend(
            history
                .by_model
                .iter()
                .take(HISTORY_MODEL_LIMIT)
                .map(|row| {
                    format!(
                        "    {}: {}, {}",
                        crate::model_catalog::display_name(&row.key),
                        format_credits(credits_for_cents(row.cost_cents)),
                        request_count(row.requests)
                    )
                }),
        );
    }
    if !history.daily.is_empty() {
        lines.push("  By day (UTC):".to_string());
        lines.extend(
            history
                .daily
                .iter()
                .rev()
                .take(HISTORY_DAY_LIMIT)
                .map(|day| {
                    format!(
                        "    {}: {}, {}",
                        history_day_label(&day.day),
                        format_credits(credits_for_cents(day.cost_cents)),
                        request_count(day.requests)
                    )
                }),
        );
    }
    if history.freshness.unsettled_requests > 0 {
        lines.push(format!(
            "  {} still settling, not counted yet",
            request_count(history.freshness.unsettled_requests)
        ));
    }
    lines
}

pub fn session_model_lines(breakdown: &[(String, f64)]) -> Vec<String> {
    if breakdown.is_empty() {
        return Vec::new();
    }
    let mut lines = vec!["By model:".to_string()];
    lines.extend(breakdown.iter().map(|(model, usd)| {
        format!(
            "  {}: {}",
            crate::model_catalog::display_name(model),
            format_usd_as_credits(*usd)
        )
    }));
    lines
}

#[derive(Debug, Clone, Default)]
pub struct SessionEstimate {
    pub turns: u32,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_write_tokens: u32,
    pub estimated_cost_usd: f64,
    pub by_model: Vec<(String, f64)>,
    pub model: String,
}

pub fn render_session_estimate(estimate: &SessionEstimate) -> Vec<String> {
    let mut lines = vec![
        "Session estimate (this CLI session, priced locally, not the billed figure)".to_string(),
        format!("  turns: {}", estimate.turns),
        format!(
            "  tokens: {} in, {} out, {} cache read, {} cache write",
            estimate.input_tokens,
            estimate.output_tokens,
            estimate.cache_read_tokens,
            estimate.cache_write_tokens
        ),
        format!(
            "  estimated: {}",
            format_usd_as_credits(estimate.estimated_cost_usd)
        ),
    ];
    lines.extend(
        session_model_lines(&estimate.by_model)
            .into_iter()
            .map(|line| format!("  {line}")),
    );
    lines.push(format!("  model: {}", estimate.model));
    lines
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
        assert!(rendered.contains("Plan: Max 20x"), "{rendered}");
        assert!(
            rendered
                .contains("5-hour window: 10.25 of 200 credits used, 189.75 left, resets in 3h 0m"),
            "{rendered}"
        );
        assert!(
            rendered.contains("Weekly: 450 of 2,500 credits used, 2,050 left, resets in 1d 12h"),
            "{rendered}"
        );
        assert!(
            rendered.contains("Monthly: 4,200.5 of 10,000 credits used"),
            "{rendered}"
        );
        assert!(
            rendered.contains("Flagship weekly: 15 of 500 credits used"),
            "{rendered}"
        );
        assert!(
            rendered.contains("Purchased credits: 120.5 credits, overage on"),
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
        assert!(rendered.contains("Monthly: 61% used"), "{rendered}");
        assert!(
            rendered.contains("Credits: not reported by this server"),
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
            subscription_status: None,
            usage_allocation: None,
            credits: None,
        };
        let rendered = render_account_usage(&usage, fixture_now()).join("\n");
        assert!(rendered.contains("No allowance remaining"), "{rendered}");
    }

    #[test]
    fn a_pending_allocation_is_not_reported_as_spent() {
        let mut usage =
            parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        usage.usage_allocation = Some("pending".to_string());
        let rendered = render_account_usage(&usage, fixture_now()).join("\n");
        assert!(
            rendered.contains("Allowance: not provisioned yet"),
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
            by_model: Vec::new(),
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
            let message = UsageFetchError::entitlement(status).to_string();
            assert!(!message.is_empty(), "HTTP {status} must explain itself");
            assert_eq!(unavailable_lines(&message).len(), 2);
        }
        assert!(!tier_cache::status_invalidates_tier(500));
    }

    /// A revoked account and a missing scope both answer 403, so the server's
    /// sentence has to reach the user instead of one fixed guess.
    #[test]
    fn a_revoked_account_keeps_its_own_explanation() {
        let revoked = entitlement_detail(
            r#"{"error":{"code":"FORBIDDEN","message":"Your account has been suspended. Please contact support."},"requestId":"r1"}"#,
        );
        let message = UsageFetchError::EntitlementChanged {
            status: 403,
            detail: revoked,
        }
        .to_string();
        assert_eq!(
            message,
            "Your account has been suspended. Please contact support."
        );

        let deleted = entitlement_detail(
            r#"{"error":{"code":"FORBIDDEN","message":"This account has been deleted."}}"#,
        );
        assert_eq!(
            UsageFetchError::EntitlementChanged {
                status: 403,
                detail: deleted,
            }
            .to_string(),
            "This account has been deleted."
        );

        assert_ne!(
            UsageFetchError::entitlement(403).to_string(),
            "Your account has been suspended. Please contact support."
        );
    }

    #[test]
    fn a_body_with_no_error_message_adds_no_detail() {
        assert_eq!(entitlement_detail(""), None);
        assert_eq!(entitlement_detail("<html>502</html>"), None);
        assert_eq!(
            entitlement_detail(r#"{"error":{"code":"FORBIDDEN"}}"#),
            None
        );
        assert_eq!(entitlement_detail(r#"{"error":{"message":"  "}}"#), None);
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
