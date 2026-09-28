//! Server-authoritative account usage read.
//!
//! Mirrors `ManagedUsageSummaryResponse` in
//! `packages/contracts/types/src/managed-usage-balance.ts`, so the CLI reports
//! the same remaining allowance the web app reports from the same ledger.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::time::Duration;

use crate::cost_ledger::{credit_amount, format_credits, format_usd_as_credits};
use crate::tier_cache::{self, UserTier};

const USAGE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const USAGE_PATH: &str = "/api/usage";
const USAGE_HISTORY_PATH: &str = "/api/usage/history";
const USAGE_TURNS_PATH: &str = "/api/usage/turns/";
const TURN_SETTLEMENT_POLL_DELAYS_MS: [u64; 4] = [0, 500, 1_000, 2_000];
const BILLING_PATH: &str = "/settings/billing";
const PRICING_PATH: &str = "/pricing";
const USAGE_SETTINGS_PATH: &str = "/settings/usage";
const FLAGSHIP_LIMIT_CODE: &str = "flagship_weekly_limit_reached";
const ENTITLED_SUBSCRIPTION_STATUSES: [&str; 2] = ["active", "trialing"];
const PAYMENT_FAILED_SUBSCRIPTION_STATUSES: [&str; 3] = ["past_due", "unpaid", "incomplete"];
const HISTORY_MODEL_LIMIT: usize = 8;
const USAGE_WORKLOAD_LABELS: [(&str, &str); 6] = [
    ("chat", "Chat"),
    ("work", "AGI Work"),
    ("research", "Deep Research"),
    ("code", "AGI Code"),
    ("browser", "Browser"),
    ("unknown", "Not attributed"),
];
const HISTORY_PERIOD_LIMIT: usize = 7;
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
    pub credits: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryPeriod {
    pub start: String,
    pub requests: u64,
    pub credits: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryBreakdown {
    pub key: String,
    #[serde(default)]
    pub label: Option<String>,
    pub requests: u64,
    pub credits: f64,
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
    pub granularity: String,
    pub totals: UsageHistoryTotals,
    pub periods: Vec<UsageHistoryPeriod>,
    pub by_workload: Vec<UsageHistoryBreakdown>,
    pub by_model: Vec<UsageHistoryBreakdown>,
    pub freshness: UsageHistoryFreshness,
}

fn usage_workload_label(key: &str) -> &str {
    USAGE_WORKLOAD_LABELS
        .iter()
        .find(|(id, _)| *id == key)
        .map(|(_, label)| *label)
        .unwrap_or(key)
}

pub fn parse_usage_history(body: &str) -> Result<UsageHistory, serde_json::Error> {
    serde_json::from_str(body)
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnSettlement {
    pub request_id: String,
    pub status: String,
    #[serde(default)]
    pub credits: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct BilledTurn {
    pub credits: f64,
    pub settled: usize,
    pub pending: usize,
    pub unavailable: usize,
}

enum TurnSettlementOutcome {
    Settled(f64),
    Pending,
    Unavailable,
}

fn web_link(path: &str) -> String {
    format!("{}{path}", tier_cache::default_api_base())
}

pub fn recovery_link(href: &str) -> String {
    if href.starts_with("https://") {
        href.to_string()
    } else {
        web_link(href)
    }
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
    pub resets_at: Option<String>,
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
    let reset_at = limit_window_reset(usage, code);
    let resets_in = reset_at.and_then(|reset_at| time_until(reset_at, now));
    UsageLimitContext {
        resets_at: resets_in.as_ref().and(reset_at).map(str::to_string),
        resets_in,
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
                    Some(detail) => write!(f, "{detail} Settings > Billing: {billing}"),
                    None => write!(
                        f,
                        "your last payment did not go through. Update your payment method in Settings > Billing: {billing}"
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

pub async fn fetch_turn_settlement(
    jwt: &str,
    request_id: &str,
) -> Result<TurnSettlement, UsageFetchError> {
    let path = format!("{USAGE_TURNS_PATH}{}", urlencoding::encode(request_id));
    let body = fetch_account_body(jwt, &path).await?;
    serde_json::from_str(&body).map_err(|e| UsageFetchError::Other(anyhow::anyhow!(e)))
}

async fn settle_turn_request(jwt: &str, request_id: &str) -> TurnSettlementOutcome {
    for delay_ms in TURN_SETTLEMENT_POLL_DELAYS_MS {
        if delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }
        match fetch_turn_settlement(jwt, request_id).await {
            Ok(settlement) if settlement.status == "settled" => {
                return TurnSettlementOutcome::Settled(settlement.credits.unwrap_or(0.0));
            }
            Ok(_) => continue,
            Err(_) => return TurnSettlementOutcome::Unavailable,
        }
    }
    TurnSettlementOutcome::Pending
}

pub async fn billed_turn(request_ids: &[String]) -> Option<BilledTurn> {
    if request_ids.is_empty() {
        return None;
    }
    let UsageMode::Managed(jwt) = usage_mode() else {
        return None;
    };
    let outcomes = futures_util::future::join_all(
        request_ids
            .iter()
            .map(|request_id| settle_turn_request(&jwt, request_id)),
    )
    .await;
    let mut billed = BilledTurn::default();
    for outcome in outcomes {
        match outcome {
            TurnSettlementOutcome::Settled(credits) => {
                billed.credits += credits;
                billed.settled += 1;
            }
            TurnSettlementOutcome::Pending => billed.pending += 1,
            TurnSettlementOutcome::Unavailable => billed.unavailable += 1,
        }
    }
    Some(billed)
}

pub fn render_billed_turn(billed: &BilledTurn) -> String {
    if billed.settled == 0 {
        return "billed credits are not available yet, run `agi usage` later".to_string();
    }
    let open = billed.pending + billed.unavailable;
    if open == 0 {
        format!("{} billed", format_credits(billed.credits))
    } else {
        format!(
            "{} billed so far, {} not settled yet",
            format_credits(billed.credits),
            request_count(open as u64)
        )
    }
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
        lines.push(format!(
            "  Your last payment did not go through, so this subscription is {}. Until it is settled this account is on Free, and plan features and purchased credits are paused.",
            subscription_status_label(&status)
        ));
        lines.push(format!(
            "  Update your payment method in Settings > Billing: {}",
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

fn history_period_heading(granularity: &str) -> &'static str {
    match granularity {
        "week" => "  By week (UTC):",
        "month" => "  By month (UTC):",
        _ => "  By day (UTC):",
    }
}

fn history_period_label(start: &str, granularity: &str) -> String {
    let Ok(parsed) = DateTime::parse_from_rfc3339(start) else {
        return start.to_string();
    };
    let start = parsed.with_timezone(&Utc);
    match granularity {
        "week" => format!("Week of {}", start.format("%Y-%m-%d")),
        "month" => start.format("%Y-%m").to_string(),
        _ => start.format("%Y-%m-%d").to_string(),
    }
}

pub fn render_usage_history(history: &UsageHistory) -> Vec<String> {
    let window = history_window_days(history)
        .map(|days| format!("last {days} {}", if days == 1 { "day" } else { "days" }))
        .unwrap_or_else(|| format!("{} to {}", history.from, history.to));
    let mut lines = vec![format!(
        "Usage history, {window}: {}, {}",
        format_credits(history.totals.credits),
        request_count(history.totals.requests)
    )];
    if history.by_model.is_empty() && history.by_workload.is_empty() && history.periods.is_empty() {
        lines.push("  No settled usage in this window".to_string());
    }
    if !history.by_workload.is_empty() {
        lines.push("  By product area:".to_string());
        lines.extend(history.by_workload.iter().map(|row| {
            format!(
                "    {}: {}, {}",
                row.label
                    .as_deref()
                    .unwrap_or_else(|| usage_workload_label(&row.key)),
                format_credits(row.credits),
                request_count(row.requests)
            )
        }));
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
                        row.label
                            .clone()
                            .unwrap_or_else(|| crate::model_catalog::display_name(&row.key)),
                        format_credits(row.credits),
                        request_count(row.requests)
                    )
                }),
        );
    }
    if !history.periods.is_empty() {
        lines.push(history_period_heading(&history.granularity).to_string());
        lines.extend(
            history
                .periods
                .iter()
                .rev()
                .take(HISTORY_PERIOD_LIMIT)
                .map(|period| {
                    format!(
                        "    {}: {}, {}",
                        history_period_label(&period.start, &history.granularity),
                        format_credits(period.credits),
                        request_count(period.requests)
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
    fn a_refusing_window_states_its_own_reset() {
        let usage = parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        for (code, resets_in) in [
            ("rolling_five_hour_limit_reached", "3h 0m"),
            ("rolling_weekly_limit_reached", "1d 12h"),
            ("flagship_weekly_limit_reached", "1d 12h"),
            ("monthly_credit_limit_reached", "16d 12h"),
            ("insufficient_credits", "16d 12h"),
            ("free_trial_token_budget_reached", "16d 12h"),
        ] {
            assert_eq!(
                usage_limit_context_from(&usage, code, fixture_now())
                    .resets_in
                    .as_deref(),
                Some(resets_in),
                "{code}"
            );
        }
        assert_eq!(
            usage_limit_context_from(&usage, "plan_upgrade_required", fixture_now()),
            UsageLimitContext::default(),
            "a capability the plan lacks has no window to reset"
        );
    }

    #[test]
    fn a_reset_is_read_from_the_percentage_fields_when_no_credits_are_stated() {
        let mut usage =
            parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        usage.credits = None;
        usage.session_reset_at = Some("2026-09-13T12:45:00Z".to_string());
        assert_eq!(
            usage_limit_context_from(&usage, "rolling_five_hour_limit_reached", fixture_now())
                .resets_in
                .as_deref(),
            Some("45m")
        );
        usage.session_reset_at = Some("2026-09-13T11:00:00Z".to_string());
        assert_eq!(
            usage_limit_context_from(&usage, "rolling_five_hour_limit_reached", fixture_now())
                .resets_in,
            None,
            "a window that already reset promises no wait"
        );
    }

    #[test]
    fn only_the_flagship_limit_names_a_standard_model_the_plan_includes() {
        let usage = parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        let flagship =
            usage_limit_context_from(&usage, "flagship_weekly_limit_reached", fixture_now());
        let model = flagship
            .alternative_model
            .expect("a Max 20x plan includes a standard model");
        assert_eq!(
            Some(model.as_str()),
            crate::model_catalog::standard_model_for_tier(&UserTier::Max15x).as_deref()
        );
        assert!(crate::model_catalog::can_access_model_for_tier(
            &model,
            &UserTier::Max15x
        ));
        assert!(
            !crate::model_catalog::tier_allowed_models("flagship_additions").contains(&model),
            "{model} is itself a flagship model"
        );

        for code in [
            "rolling_five_hour_limit_reached",
            "rolling_weekly_limit_reached",
            "monthly_credit_limit_reached",
        ] {
            assert_eq!(
                usage_limit_context_from(&usage, code, fixture_now()).alternative_model,
                None,
                "{code}: a standard model spends the same window"
            );
        }
    }

    #[test]
    fn a_settled_turn_states_the_credits_it_was_billed() {
        let billed = |credits, settled, pending, unavailable| {
            render_billed_turn(&BilledTurn {
                credits,
                settled,
                pending,
                unavailable,
            })
        };
        assert_eq!(billed(1.25, 2, 0, 0), "1.25 credits billed");
        assert_eq!(billed(1.0, 1, 0, 0), "1 credit billed");
        assert_eq!(
            billed(0.5, 1, 1, 0),
            "0.5 credits billed so far, 1 request not settled yet"
        );
        assert_eq!(
            billed(3.0, 1, 1, 1),
            "3 credits billed so far, 2 requests not settled yet"
        );
        assert_eq!(
            billed(0.0, 0, 2, 0),
            "billed credits are not available yet, run `agi usage` later"
        );
    }

    #[tokio::test]
    async fn a_turn_with_no_managed_request_reports_no_bill() {
        assert_eq!(billed_turn(&[]).await, None);
    }

    fn history_fixture() -> &'static str {
        r#"{
            "userId": "user_fixture",
            "from": "2026-08-28T00:00:00.000Z",
            "to": "2026-09-27T00:00:00.000Z",
            "granularity": "day",
            "totals": { "requests": 42, "inputTokens": 910000, "outputTokens": 120000, "credits": 1234.5 },
            "periods": [
                { "start": "2026-09-17T00:00:00.000Z", "requests": 1, "credits": 0.5 },
                { "start": "2026-09-18T00:00:00.000Z", "requests": 2, "credits": 1 },
                { "start": "2026-09-19T00:00:00.000Z", "requests": 3, "credits": 2 },
                { "start": "2026-09-20T00:00:00.000Z", "requests": 4, "credits": 3 },
                { "start": "2026-09-21T00:00:00.000Z", "requests": 5, "credits": 4 },
                { "start": "2026-09-22T00:00:00.000Z", "requests": 6, "credits": 5 },
                { "start": "2026-09-23T00:00:00.000Z", "requests": 7, "credits": 6 },
                { "start": "2026-09-24T00:00:00.000Z", "requests": 8, "credits": 7 }
            ],
            "byWorkload": [
                { "key": "chat", "label": null, "requests": 30, "inputTokens": 1, "outputTokens": 1, "credits": 1000 },
                { "key": "work", "label": null, "requests": 10, "inputTokens": 1, "outputTokens": 1, "credits": 200.5 },
                { "key": "unknown", "label": null, "requests": 1, "inputTokens": 1, "outputTokens": 1, "credits": 30 },
                { "key": "sheets", "label": "Spreadsheets", "requests": 1, "inputTokens": 1, "outputTokens": 1, "credits": 4 }
            ],
            "byModel": [
                { "key": "fixture-unlisted-model", "label": null, "requests": 40, "inputTokens": 1, "outputTokens": 1, "credits": 1200 },
                { "key": "fixture-labelled-model", "label": "Fixture Model", "requests": 2, "inputTokens": 1, "outputTokens": 1, "credits": 34.5 }
            ],
            "byProject": [
                { "key": "proj_fixture", "label": "Launch", "requests": 12, "inputTokens": 1, "outputTokens": 1, "credits": 500 }
            ],
            "freshness": { "asOf": "2026-09-27T00:00:00.000Z", "latestActivityAt": null, "unsettledRequests": 3 }
        }"#
    }

    #[test]
    fn parses_the_usage_history_body_the_server_sends() {
        let history = parse_usage_history(history_fixture()).expect("server history must parse");
        assert_eq!(history.totals.credits, 1_234.5);
        assert_eq!(history.periods.len(), 8);
        assert_eq!(history.by_workload.len(), 4);
        assert_eq!(history.by_model[1].label.as_deref(), Some("Fixture Model"));
        assert_eq!(history.freshness.unsettled_requests, 3);
        assert!(parse_usage_history(r#"{"from":"x","to":"y"}"#).is_err());
    }

    #[test]
    fn usage_history_is_broken_down_by_product_area_and_model_in_credits() {
        let history = parse_usage_history(history_fixture()).expect("server history must parse");
        let lines = render_usage_history(&history);
        assert_eq!(
            lines[..10],
            [
                "Usage history, last 30 days: 1,234.5 credits, 42 requests",
                "  By product area:",
                "    Chat: 1,000 credits, 30 requests",
                "    AGI Work: 200.5 credits, 10 requests",
                "    Not attributed: 30 credits, 1 request",
                "    Spreadsheets: 4 credits, 1 request",
                "  By model:",
                "    fixture-unlisted-model: 1,200 credits, 40 requests",
                "    Fixture Model: 34.5 credits, 2 requests",
                "  By day (UTC):",
            ]
        );
        assert_eq!(lines[10], "    2026-09-24: 7 credits, 8 requests");
        assert_eq!(
            lines[10..17].last().map(String::as_str),
            Some("    2026-09-18: 1 credit, 2 requests"),
            "newest seven days first"
        );
        assert_eq!(
            lines.last().map(String::as_str),
            Some("  3 requests still settling, not counted yet")
        );
        assert_eq!(lines.len(), 18);
        assert!(lines.iter().all(|line| !line.contains('$')), "{lines:?}");
    }

    #[test]
    fn a_weekly_or_monthly_history_labels_its_periods_by_that_window() {
        let mut history =
            parse_usage_history(history_fixture()).expect("server history must parse");
        history.periods.truncate(1);
        history.granularity = "week".to_string();
        let weekly = render_usage_history(&history);
        assert!(
            weekly.contains(&"  By week (UTC):".to_string()),
            "{weekly:?}"
        );
        assert!(
            weekly.contains(&"    Week of 2026-09-17: 0.5 credits, 1 request".to_string()),
            "{weekly:?}"
        );
        history.granularity = "month".to_string();
        let monthly = render_usage_history(&history);
        assert!(
            monthly.contains(&"  By month (UTC):".to_string()),
            "{monthly:?}"
        );
        assert!(
            monthly.contains(&"    2026-09: 0.5 credits, 1 request".to_string()),
            "{monthly:?}"
        );
    }

    #[test]
    fn an_empty_history_says_nothing_has_settled() {
        let mut history =
            parse_usage_history(history_fixture()).expect("server history must parse");
        history.totals.credits = 0.0;
        history.totals.requests = 0;
        history.periods.clear();
        history.by_workload.clear();
        history.by_model.clear();
        history.freshness.unsettled_requests = 0;
        assert_eq!(
            render_usage_history(&history),
            [
                "Usage history, last 30 days: 0 credits, 0 requests",
                "  No settled usage in this window",
            ]
        );
    }

    #[test]
    fn the_session_estimate_is_stated_in_credits() {
        let rendered = render_session_estimate(&SessionEstimate {
            turns: 2,
            input_tokens: 1_000,
            output_tokens: 200,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            estimated_cost_usd: 0.0125,
            by_model: vec![("fixture-unlisted-model".to_string(), 0.0125)],
            model: "fixture-unlisted-model".to_string(),
        });
        assert!(
            rendered.contains(&"  estimated: 2.5 credits".to_string()),
            "{rendered:?}"
        );
        assert!(
            rendered.contains(&"    fixture-unlisted-model: 2.5 credits".to_string()),
            "{rendered:?}"
        );
        assert!(
            rendered.iter().all(|line| !line.contains('$')),
            "{rendered:?}"
        );
    }

    #[test]
    fn a_failed_payment_is_worded_like_billing_and_points_at_settings() {
        let mut usage =
            parse_account_usage(contract_fixture()).expect("contract fixture must parse");
        usage.subscription_status = Some("past_due".to_string());
        let rendered = render_account_usage(&usage, fixture_now());
        let billing = web_link(BILLING_PATH);
        assert_eq!(rendered[2], "  Subscription: past due");
        assert_eq!(
            rendered[3],
            "  Your last payment did not go through, so this subscription is past due. Until it is settled this account is on Free, and plan features and purchased credits are paused."
        );
        assert_eq!(
            rendered[4],
            format!("  Update your payment method in Settings > Billing: {billing}")
        );
        assert_eq!(
            UsageFetchError::entitlement(402).to_string(),
            format!(
                "your last payment did not go through. Update your payment method in Settings > Billing: {billing}"
            )
        );
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
