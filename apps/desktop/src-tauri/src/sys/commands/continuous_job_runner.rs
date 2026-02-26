use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{command, AppHandle, Emitter, Manager};
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout, Duration};
use url::Url;

use crate::automation::browser::CdpClient;
use crate::core::llm::job_autofill_runtime::{
    build_job_autofill_eval_script, encode_file_as_data_url,
};
use crate::core::llm::llm_router::{
    CostPriority, RouterContext, RouterPreferences, RoutingStrategy,
};
use crate::core::llm::{ChatMessage, LLMRequest, ResponseFormat};
use crate::sys::account::{get_access_token, get_api_base_url, CreditBalanceResponse};
use crate::sys::api::{ApiRequest, AuthType, HttpMethod};
use crate::sys::commands::api::ApiState;
use crate::sys::commands::browser::BrowserStateWrapper;
use crate::sys::commands::llm::LLMState;
use crate::sys::utils::app_data_dir;

const DEFAULT_SCAN_INTERVAL_SECS: u64 = 90;
const DEFAULT_MAX_JOBS_PER_CYCLE: usize = 8;
const DEFAULT_AUTOFILL_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_MAX_ATTEMPTS_PER_JOB: u32 = 3;
const DEFAULT_RETRY_BACKOFF_BASE_SECS: u64 = 300;
const DEFAULT_RETRY_BACKOFF_MAX_SECS: u64 = 21_600;
const DEFAULT_AGENTIC_MAX_ITERATIONS: u32 = 6;
const DEFAULT_AGENTIC_MAX_ACTIONS_PER_ITERATION: u32 = 3;
const DEFAULT_AGENTIC_PLANNING_TIMEOUT_MS: u64 = 20_000;
const DEFAULT_AGENTIC_WAIT_AFTER_ACTION_MS: u64 = 900;
const LEDGER_FILE_NAME: &str = "continuous_job_runner_ledger.json";
const LEDGER_VERSION: u32 = 1;

const DISCOVER_JOB_LINKS_SCRIPT: &str = r#"(() => {
  const links = new Set();

  const collect = (href) => {
    if (!href || typeof href !== 'string') return;
    try {
      links.add(new URL(href, window.location.href).toString());
    } catch {
      // ignore malformed links
    }
  };

  collect(window.location.href);

  for (const node of document.querySelectorAll('a[href]')) {
    collect(node.getAttribute('href'));
  }

  for (const node of document.querySelectorAll('[data-job-url]')) {
    collect(node.getAttribute('data-job-url'));
  }

  return Array.from(links);
})()"#;

const OBSERVE_GENERIC_APPLICATION_STATE_SCRIPT: &str = r#"(() => {
  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const textOf = (node) =>
    String((node && (node.textContent || node.innerText)) || '')
      .replace(/\s+/g, ' ')
      .trim();

  const isVisible = (el) => {
    if (!el || !(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  const safeEscape = (value) => {
    try {
      return CSS.escape(String(value));
    } catch {
      return String(value);
    }
  };

  const unique = (selector) => {
    try {
      return selector && document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };

  const buildSelector = (el) => {
    if (!el || !(el instanceof Element)) return null;

    if (el.id) {
      const byId = `#${safeEscape(el.id)}`;
      if (unique(byId)) return byId;
    }

    for (const attr of ['data-automation-id', 'data-testid', 'name']) {
      const raw = el.getAttribute(attr);
      if (!raw) continue;
      const selector = `${el.tagName.toLowerCase()}[${attr}="${safeEscape(raw)}"]`;
      if (unique(selector)) return selector;
    }

    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
      const tag = node.tagName.toLowerCase();
      let part = tag;

      if (node.id) {
        part = `${tag}#${safeEscape(node.id)}`;
        parts.unshift(part);
        break;
      }

      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (sibling) => sibling.tagName === node.tagName,
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part = `${tag}:nth-of-type(${idx})`;
        }
      }

      parts.unshift(part);
      node = node.parentElement;
    }

    const selector = parts.join(' > ');
    return selector || null;
  };

  const fieldLabel = (el) => {
    const direct =
      el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name');
    if (direct && direct.trim()) return direct.trim();

    if (el.id) {
      const label = document.querySelector(`label[for="${safeEscape(el.id)}"]`);
      if (label) {
        const text = textOf(label);
        if (text) return text;
      }
    }

    if (el.labels && el.labels.length > 0) {
      const value = Array.from(el.labels)
        .map(textOf)
        .filter(Boolean)
        .join(' ')
        .trim();
      if (value) return value;
    }

    const closest = el.closest('label');
    if (closest) {
      const text = textOf(closest);
      if (text) return text;
    }

    return '';
  };

  const parseRequired = (el) => {
    if (el.required) return true;
    const aria = normalize(el.getAttribute('aria-required'));
    return aria === 'true';
  };

  const isFilled = (el) => {
    if (el instanceof HTMLInputElement) {
      const t = normalize(el.type);
      if (t === 'checkbox' || t === 'radio') return !!el.checked;
      if (t === 'file') return !!(el.files && el.files.length > 0);
      if (t === 'password') return !!String(el.value || '').trim();
      return !!String(el.value || '').trim();
    }
    if (el instanceof HTMLSelectElement) return !!String(el.value || '').trim();
    if (el instanceof HTMLTextAreaElement) return !!String(el.value || '').trim();
    return false;
  };

  const fieldValuePreview = (el) => {
    if (el instanceof HTMLInputElement && normalize(el.type) === 'password') {
      return '';
    }
    const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? String(el.value || '')
      : el instanceof HTMLSelectElement
        ? String(el.value || '')
        : '';
    return value.trim().slice(0, 120);
  };

  const allFieldsRaw = Array.from(document.querySelectorAll('form input, form textarea, form select'));
  const fallbackFieldsRaw = allFieldsRaw.length > 0
    ? allFieldsRaw
    : Array.from(document.querySelectorAll('input, textarea, select'));
  const fields = [];
  const seenFieldSelectors = new Set();

  for (const el of fallbackFieldsRaw) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
    if (!isVisible(el) || el.disabled) continue;
    const inputType = el instanceof HTMLInputElement ? normalize(el.type) : '';
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(inputType)) continue;

    const selector = buildSelector(el);
    if (!selector || seenFieldSelectors.has(selector)) continue;
    seenFieldSelectors.add(selector);

    const item = {
      selector,
      label: fieldLabel(el).slice(0, 160),
      tag: el.tagName.toLowerCase(),
      inputType,
      required: parseRequired(el),
      filled: isFilled(el),
      valuePreview: fieldValuePreview(el),
      options:
        el instanceof HTMLSelectElement
          ? Array.from(el.options || [])
              .slice(0, 8)
              .map((option) => String(option.textContent || option.value || '').trim())
              .filter(Boolean)
          : null,
    };
    fields.push(item);
    if (fields.length >= 36) break;
  }

  const isButtonDisabled = (el) => {
    if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
      return !!el.disabled;
    }
    const aria = normalize(el.getAttribute('aria-disabled'));
    return aria === 'true';
  };

  const buttonLabel = (el) => {
    const text =
      textOf(el) ||
      String(el.getAttribute('aria-label') || '').trim() ||
      String(el.getAttribute('value') || '').trim();
    return text.slice(0, 200);
  };

  const buttonCandidates = Array.from(
    document.querySelectorAll(
      'form button, form input[type="submit"], form input[type="button"], button, [role="button"], a[href*="apply"]',
    ),
  );
  const buttons = [];
  const seenButtonSelectors = new Set();

  for (const el of buttonCandidates) {
    if (!(el instanceof HTMLElement)) continue;
    if (!isVisible(el) || isButtonDisabled(el)) continue;
    const selector = buildSelector(el);
    if (!selector || seenButtonSelectors.has(selector)) continue;
    seenButtonSelectors.add(selector);

    const label = buttonLabel(el);
    if (!label) continue;

    buttons.push({
      selector,
      label,
      kind:
        el instanceof HTMLInputElement
          ? normalize(el.type || '')
          : normalize(el.getAttribute('type') || ''),
      href: el instanceof HTMLAnchorElement ? String(el.href || '') : null,
    });

    if (buttons.length >= 24) break;
  }

  const bodyText = normalize(document.body ? document.body.innerText : '');
  const submittedLikely =
    bodyText.includes('application submitted') ||
    bodyText.includes('thank you for applying') ||
    bodyText.includes('thanks for applying') ||
    bodyText.includes('your application has been received') ||
    bodyText.includes('application received') ||
    normalize(window.location.href).includes('/submitted') ||
    normalize(window.location.href).includes('/confirmation');

  const missingRequiredCount = fields.filter((field) => field.required && !field.filled).length;

  return {
    url: window.location.href,
    title: String(document.title || ''),
    submittedLikely,
    missingRequiredCount,
    fieldCount: fields.length,
    buttonCount: buttons.length,
    pageTextSnippet: String(document.body ? document.body.innerText : '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200),
    fields,
    buttons,
  };
})()"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuousJobRunnerRequest {
    #[serde(default)]
    pub seed_urls: Vec<String>,
    #[serde(default)]
    pub profile: Value,
    #[serde(default)]
    pub options: Value,
    #[serde(default)]
    pub resume_path: Option<String>,
    #[serde(default)]
    pub cover_letter_path: Option<String>,
    #[serde(default = "default_scan_interval_secs")]
    pub scan_interval_secs: u64,
    #[serde(default = "default_max_jobs_per_cycle")]
    pub max_jobs_per_cycle: usize,
    #[serde(default = "default_true")]
    pub auto_submit: bool,
    #[serde(default)]
    pub allow_submit_with_missing_required: bool,
    #[serde(default = "default_true")]
    pub stop_on_credit_exhaustion: bool,
    #[serde(default)]
    pub max_total_applications: Option<u64>,
    #[serde(default)]
    pub max_cycles: Option<u64>,
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default = "default_true")]
    pub enable_generic_fallback: bool,
    #[serde(default = "default_true")]
    pub enable_agentic_fallback: bool,
    #[serde(default = "default_agentic_max_iterations")]
    pub agentic_max_iterations: u32,
    #[serde(default = "default_agentic_max_actions_per_iteration")]
    pub agentic_max_actions_per_iteration: u32,
    #[serde(default = "default_agentic_planning_timeout_ms")]
    pub agentic_planning_timeout_ms: u64,
    #[serde(default = "default_agentic_wait_after_action_ms")]
    pub agentic_wait_after_action_ms: u64,
    #[serde(default)]
    pub agentic_model_hint: Option<String>,
    #[serde(default = "default_max_attempts_per_job")]
    pub max_attempts_per_job: u32,
    #[serde(default = "default_retry_backoff_base_secs")]
    pub retry_backoff_base_secs: u64,
    #[serde(default = "default_retry_backoff_max_secs")]
    pub retry_backoff_max_secs: u64,
    #[serde(default = "default_true")]
    pub skip_previously_applied: bool,
    #[serde(default = "default_true")]
    pub persist_ledger: bool,
    #[serde(default)]
    pub reset_ledger_on_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuousJobRunnerStatus {
    pub is_running: bool,
    pub session_id: Option<String>,
    pub started_at_ms: Option<u64>,
    pub last_activity_at_ms: Option<u64>,
    pub current_phase: String,
    pub stop_reason: Option<String>,
    pub last_error: Option<String>,
    pub last_job_url: Option<String>,
    pub cycle_count: u64,
    pub pages_scanned: u64,
    pub jobs_discovered: u64,
    pub jobs_attempted: u64,
    pub jobs_applied: u64,
    pub jobs_failed: u64,
    pub jobs_skipped_duplicate: u64,
    pub jobs_skipped_applied: u64,
    pub jobs_skipped_backoff: u64,
    pub jobs_skipped_retry_limit: u64,
    pub jobs_fallback_attempted: u64,
    pub jobs_fallback_applied: u64,
    pub jobs_fallback_failed: u64,
    #[serde(default)]
    pub jobs_agentic_fallback_attempted: u64,
    #[serde(default)]
    pub jobs_agentic_fallback_applied: u64,
    #[serde(default)]
    pub jobs_agentic_fallback_failed: u64,
    pub ledger_entries: u64,
    pub credits_monthly_remaining_cents: Option<i32>,
    pub credits_daily_remaining_cents: Option<i32>,
}

impl Default for ContinuousJobRunnerStatus {
    fn default() -> Self {
        Self {
            is_running: false,
            session_id: None,
            started_at_ms: None,
            last_activity_at_ms: None,
            current_phase: "idle".to_string(),
            stop_reason: None,
            last_error: None,
            last_job_url: None,
            cycle_count: 0,
            pages_scanned: 0,
            jobs_discovered: 0,
            jobs_attempted: 0,
            jobs_applied: 0,
            jobs_failed: 0,
            jobs_skipped_duplicate: 0,
            jobs_skipped_applied: 0,
            jobs_skipped_backoff: 0,
            jobs_skipped_retry_limit: 0,
            jobs_fallback_attempted: 0,
            jobs_fallback_applied: 0,
            jobs_fallback_failed: 0,
            jobs_agentic_fallback_attempted: 0,
            jobs_agentic_fallback_applied: 0,
            jobs_agentic_fallback_failed: 0,
            ledger_entries: 0,
            credits_monthly_remaining_cents: None,
            credits_daily_remaining_cents: None,
        }
    }
}

struct ContinuousJobRunnerControl {
    is_running: AtomicBool,
    handle: Mutex<Option<JoinHandle<()>>>,
    status: RwLock<ContinuousJobRunnerStatus>,
    job_ledger: RwLock<JobAttemptLedger>,
    persist_ledger: AtomicBool,
}

impl ContinuousJobRunnerControl {
    fn new() -> Self {
        Self {
            is_running: AtomicBool::new(false),
            handle: Mutex::new(None),
            status: RwLock::new(ContinuousJobRunnerStatus::default()),
            job_ledger: RwLock::new(JobAttemptLedger::default()),
            persist_ledger: AtomicBool::new(true),
        }
    }
}

static RUNNER: Lazy<Arc<ContinuousJobRunnerControl>> =
    Lazy::new(|| Arc::new(ContinuousJobRunnerControl::new()));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JobPlatform {
    Greenhouse,
    Workday,
    Generic,
    Unknown,
}

impl JobPlatform {
    fn as_str(self) -> &'static str {
        match self {
            Self::Greenhouse => "greenhouse",
            Self::Workday => "workday",
            Self::Generic => "generic",
            Self::Unknown => "unknown",
        }
    }

    fn priority(self) -> u8 {
        match self {
            Self::Greenhouse => 0,
            Self::Workday => 1,
            Self::Generic => 2,
            Self::Unknown => 3,
        }
    }

    fn is_supported_native(self) -> bool {
        matches!(self, Self::Greenhouse | Self::Workday)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FallbackMode {
    None,
    GenericRuntime,
    Agentic,
}

impl FallbackMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::GenericRuntime => "generic_runtime",
            Self::Agentic => "agentic",
        }
    }
}

#[derive(Debug, Clone)]
struct JobCandidate {
    url: String,
    canonical_url: String,
    platform: JobPlatform,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobAttemptRecord {
    canonical_url: String,
    display_url: String,
    first_seen_at_ms: u64,
    last_seen_at_ms: u64,
    last_attempt_at_ms: Option<u64>,
    next_retry_at_ms: Option<u64>,
    attempt_count: u32,
    success_count: u32,
    failure_count: u32,
    applied_at_ms: Option<u64>,
    last_status: String,
    last_error: Option<String>,
    last_platform: String,
    last_seed_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JobAttemptLedger {
    version: u32,
    updated_at_ms: u64,
    entries: HashMap<String, JobAttemptRecord>,
}

impl Default for JobAttemptLedger {
    fn default() -> Self {
        Self {
            version: LEDGER_VERSION,
            updated_at_ms: now_ms(),
            entries: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AttemptDecision {
    Attempt,
    SkipAlreadyApplied,
    SkipRetryLimit,
    SkipBackoff { next_retry_at_ms: u64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenericObservedField {
    selector: String,
    label: String,
    tag: String,
    input_type: String,
    required: bool,
    filled: bool,
    value_preview: String,
    #[serde(default)]
    options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenericObservedButton {
    selector: String,
    label: String,
    kind: String,
    #[serde(default)]
    href: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenericPageObservation {
    url: String,
    title: String,
    submitted_likely: bool,
    missing_required_count: usize,
    field_count: usize,
    button_count: usize,
    page_text_snippet: String,
    #[serde(default)]
    fields: Vec<GenericObservedField>,
    #[serde(default)]
    buttons: Vec<GenericObservedButton>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AgenticFallbackAction {
    action: String,
    #[serde(default)]
    selector: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    checked: Option<bool>,
    #[serde(default)]
    clear_first: Option<bool>,
    #[serde(default)]
    wait_ms: Option<u64>,
    #[serde(default)]
    amount_px: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AgenticFallbackPlan {
    #[serde(default)]
    task_complete: bool,
    #[serde(default = "default_true")]
    making_progress: bool,
    #[serde(default)]
    reasoning: Option<String>,
    #[serde(default)]
    actions: Vec<AgenticFallbackAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgenticFallbackResult {
    attempted: bool,
    submitted: bool,
    iterations: u32,
    actions_executed: u32,
    #[serde(default)]
    last_error: Option<String>,
    #[serde(default)]
    reasoning: Option<String>,
    outcome: String,
}

#[derive(Debug, Default)]
struct AgenticSelectorScope {
    field_selectors: HashSet<String>,
    action_selectors: HashSet<String>,
    submit_selectors: HashSet<String>,
}

fn default_true() -> bool {
    true
}

fn default_scan_interval_secs() -> u64 {
    DEFAULT_SCAN_INTERVAL_SECS
}

fn default_max_jobs_per_cycle() -> usize {
    DEFAULT_MAX_JOBS_PER_CYCLE
}

fn default_max_attempts_per_job() -> u32 {
    DEFAULT_MAX_ATTEMPTS_PER_JOB
}

fn default_retry_backoff_base_secs() -> u64 {
    DEFAULT_RETRY_BACKOFF_BASE_SECS
}

fn default_retry_backoff_max_secs() -> u64 {
    DEFAULT_RETRY_BACKOFF_MAX_SECS
}

fn default_agentic_max_iterations() -> u32 {
    DEFAULT_AGENTIC_MAX_ITERATIONS
}

fn default_agentic_max_actions_per_iteration() -> u32 {
    DEFAULT_AGENTIC_MAX_ACTIONS_PER_ITERATION
}

fn default_agentic_planning_timeout_ms() -> u64 {
    DEFAULT_AGENTIC_PLANNING_TIMEOUT_MS
}

fn default_agentic_wait_after_action_ms() -> u64 {
    DEFAULT_AGENTIC_WAIT_AFTER_ACTION_MS
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(std::time::Duration::ZERO)
        .as_millis() as u64
}

fn detect_job_platform(url: &str) -> JobPlatform {
    let value = url.to_lowercase();

    let greenhouse = (value.contains("greenhouse.io") || value.contains("boards.greenhouse.io"))
        && (value.contains("/jobs/")
            || value.contains("/job/")
            || value.contains("/job_app")
            || value.contains("/embed/job"));

    if greenhouse {
        return JobPlatform::Greenhouse;
    }

    let workday = (value.contains("myworkdayjobs.com")
        || value.contains("workdayjobs.com")
        || value.contains(".myworkday.com")
        || value.contains("wd1.myworkday")
        || value.contains("wd3.myworkday")
        || value.contains("wd5.myworkday"))
        && (value.contains("/job/")
            || value.contains("/jobs/")
            || value.contains("/en-us/recruiting/"));

    if workday {
        return JobPlatform::Workday;
    }

    JobPlatform::Unknown
}

fn looks_like_generic_job_url(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("mailto:")
        || trimmed.starts_with("tel:")
        || trimmed.starts_with("javascript:")
    {
        return false;
    }

    let parsed = match Url::parse(trimmed) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };

    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }

    let host = parsed.host_str().unwrap_or("").to_lowercase();
    let path = parsed.path().to_lowercase();
    let query = parsed.query().unwrap_or("").to_lowercase();

    let host_signals = [
        "lever.co",
        "ashbyhq.com",
        "smartrecruiters.com",
        "icims.com",
        "jobvite.com",
        "recruitee.com",
        "greenhouse.io",
        "workdayjobs.com",
        "myworkdayjobs.com",
        "careers.",
        "jobs.",
    ]
    .iter()
    .any(|needle| host.contains(needle));

    let path_signals = [
        "/job/",
        "/jobs/",
        "/careers/",
        "/careers",
        "/positions/",
        "/openings/",
        "/vacancies/",
        "/apply/",
        "/requisition/",
    ]
    .iter()
    .any(|needle| path.contains(needle));

    let query_signals = [
        "gh_jid",
        "jobid",
        "job_id",
        "requisitionid",
        "requisition_id",
    ]
    .iter()
    .any(|needle| query.contains(needle));

    host_signals || path_signals || query_signals
}

fn classify_job_platform(url: &str, include_generic_fallback: bool) -> Option<JobPlatform> {
    let platform = detect_job_platform(url);
    if platform.is_supported_native() {
        return Some(platform);
    }

    if include_generic_fallback && looks_like_generic_job_url(url) {
        return Some(JobPlatform::Generic);
    }

    None
}

fn is_tracking_query_param(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    normalized.starts_with("utm_")
        || matches!(
            normalized.as_str(),
            "gclid"
                | "fbclid"
                | "mc_cid"
                | "mc_eid"
                | "mkt_tok"
                | "ref"
                | "referrer"
                | "source"
                | "campaign"
        )
}

fn canonicalize_job_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut parsed = Url::parse(trimmed).ok()?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return None;
    }

    parsed.set_fragment(None);

    let path = parsed.path().to_string();
    if path.len() > 1 && path.ends_with('/') {
        let normalized_path = path.trim_end_matches('/');
        parsed.set_path(normalized_path);
    }

    let mut retained_pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .filter_map(|(key, value)| {
            if is_tracking_query_param(&key) {
                None
            } else {
                Some((key.into_owned(), value.into_owned()))
            }
        })
        .collect();

    retained_pairs.sort_unstable();
    parsed.set_query(None);

    if !retained_pairs.is_empty() {
        let mut serializer = url::form_urlencoded::Serializer::new(String::new());
        for (key, value) in retained_pairs {
            serializer.append_pair(&key, &value);
        }
        let query = serializer.finish();
        parsed.set_query(Some(&query));
    }

    Some(parsed.to_string())
}

fn normalize_seed_urls(seed_urls: Vec<String>) -> Vec<String> {
    let normalized: Vec<String> = seed_urls
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect();

    if normalized.is_empty() {
        vec![
            "https://boards.greenhouse.io/".to_string(),
            "https://www.myworkdayjobs.com/".to_string(),
        ]
    } else {
        normalized
    }
}

fn extract_links_from_value(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}

async fn update_status<F>(mutator: F)
where
    F: FnOnce(&mut ContinuousJobRunnerStatus),
{
    let mut status = RUNNER.status.write().await;
    mutator(&mut status);
    status.last_activity_at_ms = Some(now_ms());
}

async fn read_status() -> ContinuousJobRunnerStatus {
    RUNNER.status.read().await.clone()
}

async fn sync_ledger_entry_count_to_status() {
    let count = RUNNER.job_ledger.read().await.entries.len() as u64;
    update_status(|status| {
        status.ledger_entries = count;
    })
    .await;
}

fn emit_runner_event(
    app_handle: &AppHandle,
    event_type: &str,
    message: &str,
    status: &ContinuousJobRunnerStatus,
    data: Option<Value>,
) {
    let payload = serde_json::json!({
        "eventType": event_type,
        "message": message,
        "status": status,
        "data": data,
        "timestamp": now_ms()
    });

    if let Err(err) = app_handle.emit("continuous-job-runner:event", payload) {
        tracing::warn!("[ContinuousJobRunner] Failed to emit event: {}", err);
    }
}

fn ledger_file_path() -> Result<PathBuf, String> {
    app_data_dir()
        .map(|dir| dir.join(LEDGER_FILE_NAME))
        .map_err(|e| {
            format!(
                "Failed to resolve app data dir for job runner ledger: {}",
                e
            )
        })
}

async fn load_ledger_from_disk() -> Result<JobAttemptLedger, String> {
    let path = ledger_file_path()?;
    let content = match tokio::fs::read_to_string(&path).await {
        Ok(content) => content,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(JobAttemptLedger::default())
        }
        Err(err) => {
            tracing::warn!(
                "[ContinuousJobRunner] Failed to read ledger file '{}': {}. Starting with empty ledger.",
                path.display(),
                err
            );
            return Ok(JobAttemptLedger::default());
        }
    };

    match serde_json::from_str::<JobAttemptLedger>(&content) {
        Ok(mut ledger) => {
            if ledger.version == 0 {
                ledger.version = LEDGER_VERSION;
            }
            if ledger.updated_at_ms == 0 {
                ledger.updated_at_ms = now_ms();
            }
            Ok(ledger)
        }
        Err(err) => {
            tracing::warn!(
                "[ContinuousJobRunner] Failed to parse ledger file '{}': {}. Starting with empty ledger.",
                path.display(),
                err
            );
            Ok(JobAttemptLedger::default())
        }
    }
}

async fn persist_ledger_to_disk(ledger: &JobAttemptLedger) -> Result<(), String> {
    let path = ledger_file_path()?;
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| {
            format!(
                "Failed to create ledger directory '{}': {}",
                parent.display(),
                e
            )
        })?;
    }

    let payload = serde_json::to_vec_pretty(ledger)
        .map_err(|e| format!("Failed to serialize ledger for persistence: {}", e))?;

    tokio::fs::write(&path, payload)
        .await
        .map_err(|e| format!("Failed to write ledger file '{}': {}", path.display(), e))
}

async fn persist_runner_ledger_if_enabled() {
    if !RUNNER.persist_ledger.load(Ordering::SeqCst) {
        return;
    }

    let snapshot = RUNNER.job_ledger.read().await.clone();
    if let Err(err) = persist_ledger_to_disk(&snapshot).await {
        tracing::warn!(
            "[ContinuousJobRunner] Failed to persist ledger snapshot to disk: {}",
            err
        );
    }
}

fn upsert_record<'a>(
    ledger: &'a mut JobAttemptLedger,
    canonical_url: &str,
    display_url: &str,
    seed_url: &str,
    platform: JobPlatform,
    now: u64,
) -> &'a mut JobAttemptRecord {
    let record = ledger
        .entries
        .entry(canonical_url.to_string())
        .or_insert_with(|| JobAttemptRecord {
            canonical_url: canonical_url.to_string(),
            display_url: display_url.to_string(),
            first_seen_at_ms: now,
            last_seen_at_ms: now,
            last_attempt_at_ms: None,
            next_retry_at_ms: None,
            attempt_count: 0,
            success_count: 0,
            failure_count: 0,
            applied_at_ms: None,
            last_status: "discovered".to_string(),
            last_error: None,
            last_platform: platform.as_str().to_string(),
            last_seed_url: Some(seed_url.to_string()),
        });

    record.display_url = display_url.to_string();
    record.last_seen_at_ms = now;
    record.last_platform = platform.as_str().to_string();
    record.last_seed_url = Some(seed_url.to_string());
    record
}

fn calculate_backoff_ms(failure_count: u32, request: &ContinuousJobRunnerRequest) -> u64 {
    let base_secs = request.retry_backoff_base_secs.max(30);
    let max_secs = request.retry_backoff_max_secs.max(base_secs);
    let exponent = failure_count.saturating_sub(1).min(16);
    let multiplier = 1u64.checked_shl(exponent).unwrap_or(u64::MAX);
    let delay_secs = base_secs.saturating_mul(multiplier).min(max_secs);
    delay_secs.saturating_mul(1000)
}

fn decide_attempt(
    record: &JobAttemptRecord,
    request: &ContinuousJobRunnerRequest,
    now: u64,
) -> AttemptDecision {
    if request.skip_previously_applied && record.applied_at_ms.is_some() {
        return AttemptDecision::SkipAlreadyApplied;
    }

    if record.attempt_count >= request.max_attempts_per_job {
        return AttemptDecision::SkipRetryLimit;
    }

    if let Some(next_retry_at_ms) = record.next_retry_at_ms {
        if now < next_retry_at_ms {
            return AttemptDecision::SkipBackoff { next_retry_at_ms };
        }
    }

    AttemptDecision::Attempt
}

async fn record_discovery_and_decide(
    canonical_url: &str,
    display_url: &str,
    seed_url: &str,
    platform: JobPlatform,
    request: &ContinuousJobRunnerRequest,
) -> AttemptDecision {
    let now = now_ms();
    let mut ledger = RUNNER.job_ledger.write().await;
    let record = upsert_record(
        &mut ledger,
        canonical_url,
        display_url,
        seed_url,
        platform,
        now,
    );

    let decision = decide_attempt(record, request, now);
    record.last_status = match decision {
        AttemptDecision::Attempt => "queued".to_string(),
        AttemptDecision::SkipAlreadyApplied => "skipped_applied".to_string(),
        AttemptDecision::SkipRetryLimit => "skipped_retry_limit".to_string(),
        AttemptDecision::SkipBackoff { .. } => "skipped_backoff".to_string(),
    };
    ledger.updated_at_ms = now;
    decision
}

async fn mark_attempt_started(
    canonical_url: &str,
    display_url: &str,
    seed_url: &str,
    platform: JobPlatform,
) {
    let now = now_ms();
    let mut ledger = RUNNER.job_ledger.write().await;
    let record = upsert_record(
        &mut ledger,
        canonical_url,
        display_url,
        seed_url,
        platform,
        now,
    );
    record.attempt_count = record.attempt_count.saturating_add(1);
    record.last_attempt_at_ms = Some(now);
    record.last_status = "attempting".to_string();
    record.last_error = None;
    ledger.updated_at_ms = now;
}

async fn mark_attempt_success(
    canonical_url: &str,
    display_url: &str,
    seed_url: &str,
    platform: JobPlatform,
) {
    let now = now_ms();
    let mut ledger = RUNNER.job_ledger.write().await;
    let record = upsert_record(
        &mut ledger,
        canonical_url,
        display_url,
        seed_url,
        platform,
        now,
    );
    record.success_count = record.success_count.saturating_add(1);
    record.applied_at_ms = Some(now);
    record.next_retry_at_ms = None;
    record.last_status = "applied".to_string();
    record.last_error = None;
    ledger.updated_at_ms = now;
}

async fn mark_attempt_failure(
    canonical_url: &str,
    display_url: &str,
    seed_url: &str,
    platform: JobPlatform,
    error: String,
    request: &ContinuousJobRunnerRequest,
) {
    let now = now_ms();
    let mut ledger = RUNNER.job_ledger.write().await;
    let record = upsert_record(
        &mut ledger,
        canonical_url,
        display_url,
        seed_url,
        platform,
        now,
    );

    if record.last_attempt_at_ms.is_none() {
        record.attempt_count = record.attempt_count.saturating_add(1);
        record.last_attempt_at_ms = Some(now);
    }

    record.failure_count = record.failure_count.saturating_add(1);
    record.last_status = "failed".to_string();
    record.last_error = Some(error);
    if record.attempt_count >= request.max_attempts_per_job {
        record.next_retry_at_ms = None;
    } else {
        let backoff_ms = calculate_backoff_ms(record.failure_count, request);
        record.next_retry_at_ms = Some(now.saturating_add(backoff_ms));
    }

    ledger.updated_at_ms = now;
}

async fn fetch_credit_balance_for_runner(
    app_handle: &AppHandle,
) -> Result<CreditBalanceResponse, String> {
    let token = get_access_token()?;
    let api_base = get_api_base_url();
    let url = format!("{}/api/llm/v1/credits/balance", api_base);

    let api_state = app_handle.state::<ApiState>();

    let request = ApiRequest {
        method: HttpMethod::Get,
        url,
        auth: AuthType::Bearer { token },
        ..Default::default()
    };

    let response = api_state
        .get_client()?
        .execute(request)
        .await
        .map_err(|e| format!("Failed to fetch credit balance: {}", e))?;

    if !response.success {
        return Err(format!(
            "Credit balance request failed (status {}): {}",
            response.status, response.body
        ));
    }

    serde_json::from_str::<CreditBalanceResponse>(&response.body)
        .map_err(|e| format!("Failed to parse credit balance response: {}", e))
}

async fn attach_profile_file_from_path(
    profile: &mut Map<String, Value>,
    path: Option<&str>,
    data_key: &str,
    file_name_key: &str,
    default_file_name: &str,
) -> Result<(), String> {
    let Some(raw_path) = path.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };

    let (data_url, file_name) = encode_file_as_data_url(raw_path, default_file_name)
        .await
        .map_err(|e| e.to_string())?;

    let files_value = profile
        .entry("files".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !files_value.is_object() {
        *files_value = Value::Object(Map::new());
    }

    if let Some(files_map) = files_value.as_object_mut() {
        files_map.insert(data_key.to_string(), Value::String(data_url));
        files_map.insert(file_name_key.to_string(), Value::String(file_name));
    }

    Ok(())
}

fn build_autofill_options(
    request: &ContinuousJobRunnerRequest,
    platform: JobPlatform,
) -> Map<String, Value> {
    let mut options = request.options.as_object().cloned().unwrap_or_default();

    options
        .entry("autoSubmit".to_string())
        .or_insert(Value::Bool(request.auto_submit));
    options
        .entry("allowSubmitWithMissingRequired".to_string())
        .or_insert(Value::Bool(request.allow_submit_with_missing_required));
    options
        .entry("includeOptionalFields".to_string())
        .or_insert(Value::Bool(true));

    if let Some(timeout_ms) = request.timeout_ms {
        options
            .entry("timeoutMs".to_string())
            .or_insert(Value::Number(serde_json::Number::from(timeout_ms)));
    }

    if platform != JobPlatform::Unknown {
        options.insert(
            "platform".to_string(),
            Value::String(platform.as_str().to_string()),
        );
    }

    options
}

async fn run_autofill_on_current_page(
    client: &CdpClient,
    request: &ContinuousJobRunnerRequest,
    platform: JobPlatform,
) -> Result<Value, String> {
    let mut profile = request
        .profile
        .as_object()
        .cloned()
        .ok_or_else(|| "profile must be a JSON object".to_string())?;

    attach_profile_file_from_path(
        &mut profile,
        request.resume_path.as_deref(),
        "resumeDataUrl",
        "resumeFileName",
        "resume.pdf",
    )
    .await?;
    attach_profile_file_from_path(
        &mut profile,
        request.cover_letter_path.as_deref(),
        "coverLetterDataUrl",
        "coverLetterFileName",
        "cover-letter.pdf",
    )
    .await?;

    let options = build_autofill_options(request, platform);
    let script = build_job_autofill_eval_script(
        &Value::Object(profile),
        &Value::Object(options),
        request.timeout_ms.unwrap_or(DEFAULT_AUTOFILL_TIMEOUT_MS),
    )
    .map_err(|e| format!("Failed to build autofill script: {}", e))?;

    client
        .evaluate(&script)
        .await
        .map_err(|e| format!("Autofill script execution failed: {}", e))
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    let mut out = String::new();
    for ch in value.chars().take(max_chars) {
        out.push(ch);
    }
    out.push_str("...");
    out
}

fn summarize_profile_for_agentic(profile: &Value) -> Value {
    let Some(source) = profile.as_object() else {
        return Value::Object(Map::new());
    };

    let keys = [
        "firstName",
        "lastName",
        "fullName",
        "email",
        "phone",
        "locationCity",
        "locationState",
        "locationCountry",
        "linkedinUrl",
        "githubUrl",
        "portfolioUrl",
        "websiteUrl",
        "currentCompany",
        "currentTitle",
        "yearsOfExperience",
        "workAuthorization",
        "requiresSponsorship",
        "salaryExpectation",
    ];

    let mut summary = Map::new();
    for key in keys {
        if let Some(value) = source.get(key) {
            summary.insert(key.to_string(), value.clone());
        }
    }

    if let Some(Value::String(resume_text)) = source.get("resumeText") {
        summary.insert(
            "resumeText".to_string(),
            Value::String(truncate_text(resume_text, 1200)),
        );
    }
    if let Some(Value::String(cover_letter_text)) = source.get("coverLetterText") {
        summary.insert(
            "coverLetterText".to_string(),
            Value::String(truncate_text(cover_letter_text, 800)),
        );
    }

    if let Some(custom_answers) = source.get("customAnswers").and_then(Value::as_object) {
        let mut compact_answers = Map::new();
        for (idx, (question, answer)) in custom_answers.iter().enumerate() {
            if idx >= 12 {
                break;
            }
            let compact_answer = match answer {
                Value::String(text) => Value::String(truncate_text(text, 200)),
                other => other.clone(),
            };
            compact_answers.insert(truncate_text(question, 120), compact_answer);
        }
        if !compact_answers.is_empty() {
            summary.insert("customAnswers".to_string(), Value::Object(compact_answers));
        }
    }

    Value::Object(summary)
}

fn is_submit_button_label(label: &str) -> bool {
    let normalized = label.to_ascii_lowercase();
    [
        "submit",
        "apply",
        "send application",
        "finish",
        "complete application",
        "review and submit",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

fn normalize_selector(selector: &str) -> Option<String> {
    let normalized = selector.trim();
    if normalized.is_empty() || normalized.len() > 600 {
        return None;
    }
    Some(normalized.to_string())
}

fn normalize_action_name(action: &str) -> String {
    action.trim().to_ascii_lowercase().replace(['-', ' '], "_")
}

fn extract_json_like_payload(response: &str) -> Result<String, String> {
    if let Some(start) = response.find("```json") {
        let payload_start = start + 7;
        if let Some(end_offset) = response[payload_start..].find("```") {
            return Ok(response[payload_start..payload_start + end_offset]
                .trim()
                .to_string());
        }
    }

    if let Some(start) = response.find("```") {
        let content_start = start + 3;
        let json_start = response[content_start..]
            .find('\n')
            .map(|offset| content_start + offset + 1)
            .unwrap_or(content_start);
        if let Some(end_offset) = response[json_start..].find("```") {
            return Ok(response[json_start..json_start + end_offset]
                .trim()
                .to_string());
        }
    }

    if let Some(start) = response.find('{') {
        if let Some(end) = response.rfind('}') {
            if end > start {
                return Ok(response[start..=end].to_string());
            }
        }
    }

    Err("Planner response did not contain a valid JSON payload".to_string())
}

fn parse_agentic_plan_from_llm(
    response: &str,
    max_actions: usize,
) -> Result<AgenticFallbackPlan, String> {
    let payload = extract_json_like_payload(response)?;
    let parsed: Value =
        serde_json::from_str(&payload).map_err(|e| format!("Invalid planner JSON: {}", e))?;

    let mut plan: AgenticFallbackPlan = serde_json::from_value(parsed)
        .map_err(|e| format!("Planner JSON schema mismatch: {}", e))?;

    plan.actions
        .retain(|action| !action.action.trim().is_empty());
    if plan.actions.len() > max_actions {
        plan.actions.truncate(max_actions);
    }

    Ok(plan)
}

async fn observe_generic_application_state(
    client: &CdpClient,
) -> Result<GenericPageObservation, String> {
    let raw = client
        .evaluate(OBSERVE_GENERIC_APPLICATION_STATE_SCRIPT)
        .await
        .map_err(|e| format!("Failed to observe generic application page: {}", e))?;

    serde_json::from_value(raw)
        .map_err(|e| format!("Failed to parse generic page observation payload: {}", e))
}

fn build_agentic_selector_scope(observation: &GenericPageObservation) -> AgenticSelectorScope {
    let mut scope = AgenticSelectorScope::default();

    for field in &observation.fields {
        if let Some(selector) = normalize_selector(&field.selector) {
            scope.field_selectors.insert(selector.clone());
            scope.action_selectors.insert(selector);
        }
    }

    for button in &observation.buttons {
        if let Some(selector) = normalize_selector(&button.selector) {
            scope.action_selectors.insert(selector.clone());
            if button.kind == "submit" || is_submit_button_label(&button.label) {
                scope.submit_selectors.insert(selector);
            }
        }
    }

    scope
}

fn is_autofill_result_successful(result: &Value, request: &ContinuousJobRunnerRequest) -> bool {
    let success = result
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !success {
        return false;
    }

    let submitted = result
        .get("submitted")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if submitted {
        return true;
    }

    if !request.auto_submit {
        let missing_count = result
            .get("missingRequiredFields")
            .and_then(Value::as_array)
            .map(std::vec::Vec::len)
            .unwrap_or(0);
        return missing_count == 0 || request.allow_submit_with_missing_required;
    }

    false
}

fn autofill_failure_reason(result: &Value) -> String {
    result
        .get("error")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            let missing_count = result
                .get("missingRequiredFields")
                .and_then(Value::as_array)
                .map(std::vec::Vec::len)
                .unwrap_or(0);
            if missing_count > 0 {
                Some(format!(
                    "Autofill incomplete: {} required fields are still missing",
                    missing_count
                ))
            } else {
                None
            }
        })
        .unwrap_or_else(|| "Autofill did not submit the application".to_string())
}

fn resolve_fallback_mode(platform: JobPlatform, agentic_fallback_applied: bool) -> FallbackMode {
    if platform != JobPlatform::Generic {
        return FallbackMode::None;
    }

    if agentic_fallback_applied {
        FallbackMode::Agentic
    } else {
        FallbackMode::GenericRuntime
    }
}

fn record_agentic_fallback_metrics(
    status: &mut ContinuousJobRunnerStatus,
    attempted: bool,
    applied: bool,
) {
    if !attempted {
        return;
    }

    status.jobs_agentic_fallback_attempted += 1;
    if applied {
        status.jobs_agentic_fallback_applied += 1;
    } else {
        status.jobs_agentic_fallback_failed += 1;
    }
}

fn with_agentic_result_payload(
    base_result: &Value,
    fallback_result: &AgenticFallbackResult,
) -> Value {
    let mut merged = base_result.as_object().cloned().unwrap_or_default();
    if fallback_result.submitted {
        merged.insert("success".to_string(), Value::Bool(true));
        merged.insert("submitted".to_string(), Value::Bool(true));
    }

    merged.insert(
        "agenticFallback".to_string(),
        serde_json::to_value(fallback_result).unwrap_or(Value::Null),
    );
    Value::Object(merged)
}

async fn run_dom_action_script(
    client: &CdpClient,
    payload: Value,
    body: &str,
    context: &str,
) -> Result<Value, String> {
    let payload_json = serde_json::to_string(&payload)
        .map_err(|e| format!("Failed to serialize {} payload: {}", context, e))?;
    let script = format!(
        r#"(() => {{
  const args = {};
  {}
}})()"#,
        payload_json, body
    );

    client
        .evaluate(&script)
        .await
        .map_err(|e| format!("{} action script failed: {}", context, e))
}

fn parse_dom_action_result(result: &Value, context: &str) -> Result<(), String> {
    if result.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        return Ok(());
    }

    let reason = result
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("Unknown browser action error");
    Err(format!("{} action rejected: {}", context, reason))
}

async fn dom_click_selector(client: &CdpClient, selector: &str) -> Result<(), String> {
    let result = run_dom_action_script(
        client,
        serde_json::json!({ "selector": selector }),
        r#"
const selector = String(args.selector || '');
const element = document.querySelector(selector);
if (!element) {
  return { ok: false, error: `Element not found for selector: ${selector}` };
}
if (typeof element.scrollIntoView === 'function') {
  element.scrollIntoView({ block: 'center', inline: 'center' });
}
element.click();
return { ok: true };
"#,
        "click",
    )
    .await?;

    parse_dom_action_result(&result, "Click")
}

async fn dom_type_selector(
    client: &CdpClient,
    selector: &str,
    text: &str,
    clear_first: bool,
) -> Result<(), String> {
    let result = run_dom_action_script(
        client,
        serde_json::json!({
            "selector": selector,
            "text": text,
            "clearFirst": clear_first,
        }),
        r#"
const selector = String(args.selector || '');
const value = String(args.text || '');
const clearFirst = Boolean(args.clearFirst);
const element = document.querySelector(selector);
if (!element) {
  return { ok: false, error: `Element not found for selector: ${selector}` };
}
if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
  return { ok: false, error: `Selector is not a text input: ${selector}` };
}
if (typeof element.scrollIntoView === 'function') {
  element.scrollIntoView({ block: 'center', inline: 'center' });
}
element.focus();
if (clearFirst) {
  element.value = '';
}
element.value = value;
element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
return { ok: true };
"#,
        "type",
    )
    .await?;

    parse_dom_action_result(&result, "Type")
}

async fn dom_select_option(client: &CdpClient, selector: &str, value: &str) -> Result<(), String> {
    let result = run_dom_action_script(
        client,
        serde_json::json!({
            "selector": selector,
            "value": value,
        }),
        r#"
const selector = String(args.selector || '');
const target = String(args.value || '');
const normalize = (v) => String(v || '').toLowerCase().trim();
const element = document.querySelector(selector);
if (!element) {
  return { ok: false, error: `Element not found for selector: ${selector}` };
}
if (!(element instanceof HTMLSelectElement)) {
  return { ok: false, error: `Selector is not a select input: ${selector}` };
}
const normalizedTarget = normalize(target);
const options = Array.from(element.options || []);
const exact = options.find((opt) => normalize(opt.value) === normalizedTarget);
const byLabel = options.find((opt) => normalize(opt.textContent || '') === normalizedTarget);
const contains = options.find(
  (opt) =>
    normalize(opt.value).includes(normalizedTarget) ||
    normalize(opt.textContent || '').includes(normalizedTarget),
);
const match = exact || byLabel || contains;
if (!match) {
  return { ok: false, error: `No matching option for selector ${selector}` };
}
element.value = match.value;
element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
return { ok: true };
"#,
        "select",
    )
    .await?;

    parse_dom_action_result(&result, "Select")
}

async fn dom_set_checked(client: &CdpClient, selector: &str, checked: bool) -> Result<(), String> {
    let result = run_dom_action_script(
        client,
        serde_json::json!({
            "selector": selector,
            "checked": checked,
        }),
        r#"
const selector = String(args.selector || '');
const checked = Boolean(args.checked);
const element = document.querySelector(selector);
if (!element) {
  return { ok: false, error: `Element not found for selector: ${selector}` };
}
if (!(element instanceof HTMLInputElement)) {
  return { ok: false, error: `Selector is not an input element: ${selector}` };
}
if (element.type !== 'checkbox' && element.type !== 'radio') {
  return { ok: false, error: `Selector is not checkbox/radio: ${selector}` };
}
element.checked = checked;
element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
return { ok: true };
"#,
        "toggle",
    )
    .await?;

    parse_dom_action_result(&result, "Toggle")
}

async fn dom_scroll_page(client: &CdpClient, amount_px: i64) -> Result<(), String> {
    let result = run_dom_action_script(
        client,
        serde_json::json!({
            "amountPx": amount_px,
        }),
        r#"
const amount = Number(args.amountPx || 0);
window.scrollBy({ top: amount, left: 0, behavior: 'smooth' });
return { ok: true };
"#,
        "scroll",
    )
    .await?;

    parse_dom_action_result(&result, "Scroll")
}

fn build_agentic_planning_prompt(
    request: &ContinuousJobRunnerRequest,
    observation: &GenericPageObservation,
    previous_result: &Value,
    iteration: u32,
) -> String {
    let profile_summary = summarize_profile_for_agentic(&request.profile);
    let profile_json =
        serde_json::to_string_pretty(&profile_summary).unwrap_or_else(|_| "{}".to_string());
    let previous_json = serde_json::to_string(previous_result)
        .unwrap_or_else(|_| "{\"success\":false}".to_string());
    let observation_json = serde_json::to_string(observation).unwrap_or_else(|_| "{}".to_string());

    format!(
        r#"You are AGI Workforce's browser fallback planner for job applications.

Goal: complete this application flow safely and submit only when it is appropriate.
Iteration: {iteration}
Auto-submit enabled: {auto_submit}
Allow submit with missing required fields: {allow_missing}
Max actions allowed this iteration: {max_actions}

Rules:
1) Return strictly valid JSON and nothing else.
2) Use only selectors from the observation JSON.
3) Prefer filling missing required fields before clicking submit.
4) If page already looks submitted, return task_complete=true and no actions.
5) If you cannot make safe progress, return making_progress=false and no actions.
6) Keep actions minimal and high-confidence.

Allowed action names:
- click
- type
- select
- toggle
- submit
- scroll
- wait
- finish

Output schema:
{{
  "taskComplete": false,
  "makingProgress": true,
  "reasoning": "short reason",
  "actions": [
    {{ "action": "type", "selector": "input[name=email]", "text": "user@example.com", "clearFirst": true, "waitMs": 600 }},
    {{ "action": "click", "selector": "button[type=submit]", "waitMs": 900 }}
  ]
}}

Profile summary JSON:
{profile_json}

Previous deterministic autofill result JSON:
{previous_json}

Current page observation JSON:
{observation_json}"#,
        iteration = iteration,
        auto_submit = request.auto_submit,
        allow_missing = request.allow_submit_with_missing_required,
        max_actions = request.agentic_max_actions_per_iteration,
        profile_json = profile_json,
        previous_json = previous_json,
        observation_json = observation_json,
    )
}

async fn plan_agentic_fallback_actions(
    app_handle: &AppHandle,
    request: &ContinuousJobRunnerRequest,
    observation: &GenericPageObservation,
    previous_result: &Value,
    iteration: u32,
) -> Result<AgenticFallbackPlan, String> {
    let prompt = build_agentic_planning_prompt(request, observation, previous_result, iteration);
    let llm_state = app_handle.state::<LLMState>();

    let llm_request = LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: request.agentic_model_hint.clone().unwrap_or_default(),
        temperature: Some(0.1),
        max_tokens: Some(1200),
        stream: false,
        response_format: Some(ResponseFormat {
            format_type: "json_object".to_string(),
            json_schema: None,
        }),
        ..Default::default()
    };

    let preferences = RouterPreferences {
        provider: None,
        model: request.agentic_model_hint.clone(),
        strategy: RoutingStrategy::Auto,
        context: Some(RouterContext {
            intents: vec![
                "agentic".to_string(),
                "automation".to_string(),
                "job_application".to_string(),
            ],
            token_estimate: 2600,
            cost_priority: CostPriority::Low,
            ..Default::default()
        }),
        prefer_cloud_credits: true,
    };

    let router = llm_state.router.read().await;
    let candidates = router.candidates(&llm_request, &preferences);
    if candidates.is_empty() {
        return Err("No configured LLM candidates are available for agentic fallback".to_string());
    }

    let planning_timeout = Duration::from_millis(request.agentic_planning_timeout_ms);
    let outcome = timeout(
        planning_timeout,
        router.invoke_candidate(&candidates[0], &llm_request),
    )
    .await
    .map_err(|_| {
        format!(
            "Agentic fallback planning timed out after {}ms",
            request.agentic_planning_timeout_ms
        )
    })?
    .map_err(|e| format!("Agentic fallback planning failed: {}", e))?;

    parse_agentic_plan_from_llm(
        &outcome.response.content,
        request.agentic_max_actions_per_iteration as usize,
    )
}

async fn execute_agentic_action(
    client: &CdpClient,
    action: &AgenticFallbackAction,
    scope: &AgenticSelectorScope,
    request: &ContinuousJobRunnerRequest,
) -> Result<(), String> {
    let name = normalize_action_name(&action.action);

    match name.as_str() {
        "click" => {
            let selector = action
                .selector
                .as_deref()
                .and_then(normalize_selector)
                .ok_or_else(|| "Click action requires a selector".to_string())?;
            if !scope.action_selectors.contains(&selector) {
                return Err(format!(
                    "Blocked click on selector outside observed action scope: {}",
                    selector
                ));
            }
            dom_click_selector(client, &selector).await?;
        }
        "type" | "fill" | "input" => {
            let selector = action
                .selector
                .as_deref()
                .and_then(normalize_selector)
                .ok_or_else(|| "Type action requires a selector".to_string())?;
            if !scope.field_selectors.contains(&selector) {
                return Err(format!(
                    "Blocked type on selector outside observed field scope: {}",
                    selector
                ));
            }
            let text = action
                .text
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Type action requires text".to_string())?;
            dom_type_selector(client, &selector, text, action.clear_first.unwrap_or(true)).await?;
        }
        "select" => {
            let selector = action
                .selector
                .as_deref()
                .and_then(normalize_selector)
                .ok_or_else(|| "Select action requires a selector".to_string())?;
            if !scope.field_selectors.contains(&selector) {
                return Err(format!(
                    "Blocked select on selector outside observed field scope: {}",
                    selector
                ));
            }
            let value = action
                .value
                .as_deref()
                .or(action.text.as_deref())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Select action requires a value".to_string())?;
            dom_select_option(client, &selector, value).await?;
        }
        "toggle" | "set_checked" | "check" | "uncheck" => {
            let selector = action
                .selector
                .as_deref()
                .and_then(normalize_selector)
                .ok_or_else(|| "Toggle action requires a selector".to_string())?;
            if !scope.field_selectors.contains(&selector) {
                return Err(format!(
                    "Blocked toggle on selector outside observed field scope: {}",
                    selector
                ));
            }
            let checked = match name.as_str() {
                "check" => true,
                "uncheck" => false,
                _ => action.checked.unwrap_or(true),
            };
            dom_set_checked(client, &selector, checked).await?;
        }
        "submit" | "apply" => {
            if !request.auto_submit {
                return Err("Submit action blocked because auto_submit is disabled".to_string());
            }

            let selector =
                if let Some(selector) = action.selector.as_deref().and_then(normalize_selector) {
                    if !scope.submit_selectors.contains(&selector)
                        && !scope.action_selectors.contains(&selector)
                    {
                        return Err(format!(
                            "Blocked submit on selector outside observed submit scope: {}",
                            selector
                        ));
                    }
                    selector
                } else {
                    scope
                        .submit_selectors
                        .iter()
                        .next()
                        .cloned()
                        .ok_or_else(|| {
                            "No submit selector is available in current observation".to_string()
                        })?
                };

            dom_click_selector(client, &selector).await?;
        }
        "scroll" => {
            let amount = action.amount_px.unwrap_or(750).clamp(-2500, 2500);
            dom_scroll_page(client, amount).await?;
        }
        "wait" => {}
        "finish" | "done" | "complete" => return Ok(()),
        other => {
            return Err(format!("Unsupported agentic action: {}", other));
        }
    }

    let wait_ms = action
        .wait_ms
        .unwrap_or(request.agentic_wait_after_action_ms)
        .clamp(50, 5_000);
    if wait_ms > 0 {
        sleep(Duration::from_millis(wait_ms)).await;
    }

    Ok(())
}

async fn run_agentic_generic_fallback(
    app_handle: &AppHandle,
    client: &CdpClient,
    request: &ContinuousJobRunnerRequest,
    initial_autofill_result: &Value,
) -> Result<AgenticFallbackResult, String> {
    let max_iterations = request.agentic_max_iterations.clamp(1, 20);
    let max_actions = request.agentic_max_actions_per_iteration.clamp(1, 6) as usize;
    let mut fallback_result = AgenticFallbackResult {
        attempted: true,
        submitted: false,
        iterations: 0,
        actions_executed: 0,
        last_error: None,
        reasoning: None,
        outcome: "max_iterations_reached".to_string(),
    };

    let mut previous_result = initial_autofill_result.clone();

    for iteration in 1..=max_iterations {
        if !RUNNER.is_running.load(Ordering::SeqCst) {
            fallback_result.outcome = "runner_stopped".to_string();
            return Ok(fallback_result);
        }

        fallback_result.iterations = iteration;

        let observation = observe_generic_application_state(client).await?;
        if observation.submitted_likely {
            fallback_result.submitted = true;
            fallback_result.outcome = "submission_detected".to_string();
            return Ok(fallback_result);
        }

        let selector_scope = build_agentic_selector_scope(&observation);
        let mut plan = plan_agentic_fallback_actions(
            app_handle,
            request,
            &observation,
            &previous_result,
            iteration,
        )
        .await?;

        fallback_result.reasoning = plan.reasoning.clone();

        if plan.task_complete {
            fallback_result.submitted = observation.submitted_likely;
            fallback_result.outcome = if fallback_result.submitted {
                "planner_marked_complete_after_submit".to_string()
            } else {
                "planner_marked_complete".to_string()
            };
            return Ok(fallback_result);
        }

        if plan.actions.is_empty() {
            fallback_result.outcome = if plan.making_progress {
                "no_actions_returned".to_string()
            } else {
                "planner_not_making_progress".to_string()
            };
            return Ok(fallback_result);
        }

        if plan.actions.len() > max_actions {
            plan.actions.truncate(max_actions);
        }

        let mut executed_in_iteration = 0u32;
        for action in &plan.actions {
            if !RUNNER.is_running.load(Ordering::SeqCst) {
                fallback_result.outcome = "runner_stopped".to_string();
                return Ok(fallback_result);
            }

            match execute_agentic_action(client, action, &selector_scope, request).await {
                Ok(()) => {
                    executed_in_iteration = executed_in_iteration.saturating_add(1);
                    fallback_result.actions_executed =
                        fallback_result.actions_executed.saturating_add(1);
                }
                Err(error) => {
                    fallback_result.last_error = Some(error);
                }
            }
        }

        if executed_in_iteration == 0 {
            fallback_result.outcome = "all_actions_failed".to_string();
            return Ok(fallback_result);
        }

        match run_autofill_on_current_page(client, request, JobPlatform::Generic).await {
            Ok(post_action_result) => {
                if is_autofill_result_successful(&post_action_result, request) {
                    fallback_result.submitted = true;
                    fallback_result.outcome = "submitted_after_agentic_actions".to_string();
                    return Ok(fallback_result);
                }
                previous_result = post_action_result;
            }
            Err(error) => {
                fallback_result.last_error =
                    Some(format!("Post-agentic autofill pass failed: {}", error));
            }
        }

        let confirmation_observation = observe_generic_application_state(client).await?;
        if confirmation_observation.submitted_likely {
            fallback_result.submitted = true;
            fallback_result.outcome = "submission_detected_after_actions".to_string();
            return Ok(fallback_result);
        }
    }

    Ok(fallback_result)
}

async fn get_or_open_client(
    app_handle: &AppHandle,
    preferred_tab_id: Option<&str>,
    first_url: &str,
) -> Result<(Arc<CdpClient>, String), String> {
    let browser_state = app_handle.state::<BrowserStateWrapper>();

    if let Some(tab_id) = preferred_tab_id {
        if let Ok(pair) = browser_state
            .get_client_for_tab(Some(tab_id.to_string()))
            .await
        {
            return Ok(pair);
        }
    }

    if let Ok(pair) = browser_state.get_active_client().await {
        return Ok(pair);
    }

    let tab_manager = browser_state.get_tab_manager()?;
    let tab_id = tab_manager
        .lock()
        .await
        .open_tab(first_url)
        .await
        .map_err(|e| format!("Failed to open browser tab: {}", e))?;
    let client = browser_state.get_cdp_client_for_tab(&tab_id).await?;

    Ok((client, tab_id))
}

async fn discover_job_candidates(
    client: &CdpClient,
    include_generic_fallback: bool,
) -> Result<Vec<JobCandidate>, String> {
    let raw_links = client
        .evaluate(DISCOVER_JOB_LINKS_SCRIPT)
        .await
        .map_err(|e| format!("Failed to discover links: {}", e))?;

    let mut dedup = HashSet::new();
    let mut result = Vec::new();

    for link in extract_links_from_value(&raw_links) {
        let Some(canonical_url) = canonicalize_job_url(&link) else {
            continue;
        };

        if !dedup.insert(canonical_url.clone()) {
            continue;
        }

        let Some(platform) = classify_job_platform(&canonical_url, include_generic_fallback) else {
            continue;
        };

        result.push(JobCandidate {
            url: canonical_url.clone(),
            canonical_url,
            platform,
        });
    }

    result.sort_by_key(|candidate| candidate.platform.priority());
    Ok(result)
}

async fn wait_with_cancellation(seconds: u64) {
    for _ in 0..seconds {
        if !RUNNER.is_running.load(Ordering::SeqCst) {
            return;
        }
        sleep(Duration::from_secs(1)).await;
    }
}

async fn run_continuous_loop(
    app_handle: AppHandle,
    mut request: ContinuousJobRunnerRequest,
    session_id: String,
) {
    let mut working_tab_id = request.tab_id.clone();
    request.seed_urls = normalize_seed_urls(request.seed_urls);

    emit_runner_event(
        &app_handle,
        "runner_started",
        "Continuous job runner started",
        &read_status().await,
        Some(serde_json::json!({
            "seedUrls": request.seed_urls,
            "sessionId": session_id,
            "genericFallbackEnabled": request.enable_generic_fallback,
            "agenticFallbackEnabled": request.enable_agentic_fallback,
            "agenticMaxIterations": request.agentic_max_iterations,
            "agenticMaxActionsPerIteration": request.agentic_max_actions_per_iteration,
            "maxAttemptsPerJob": request.max_attempts_per_job,
            "ledgerPersistenceEnabled": request.persist_ledger,
        })),
    );

    loop {
        if !RUNNER.is_running.load(Ordering::SeqCst) {
            break;
        }

        let current_cycle = {
            update_status(|status| {
                status.cycle_count += 1;
                status.current_phase = "credit_check".to_string();
            })
            .await;
            RUNNER.status.read().await.cycle_count
        };

        if let Some(max_cycles) = request.max_cycles {
            if current_cycle > max_cycles {
                update_status(|status| {
                    status.stop_reason = Some(format!("Reached max cycles ({})", max_cycles));
                    status.current_phase = "stopping".to_string();
                })
                .await;
                RUNNER.is_running.store(false, Ordering::SeqCst);
                break;
            }
        }

        if request.stop_on_credit_exhaustion {
            match fetch_credit_balance_for_runner(&app_handle).await {
                Ok(balance) => {
                    let monthly_remaining = balance.credits.monthly_remaining_cents;
                    let daily_remaining = balance.credits.daily_remaining_cents;

                    update_status(|status| {
                        status.credits_monthly_remaining_cents = Some(monthly_remaining);
                        status.credits_daily_remaining_cents = Some(daily_remaining);
                        status.last_error = None;
                    })
                    .await;

                    if !balance.has_credits() {
                        update_status(|status| {
                            status.stop_reason = Some(
                                "Credits exhausted (monthly or daily remaining is zero)"
                                    .to_string(),
                            );
                            status.current_phase = "stopping".to_string();
                        })
                        .await;
                        RUNNER.is_running.store(false, Ordering::SeqCst);
                        break;
                    }
                }
                Err(error) => {
                    update_status(|status| {
                        status.last_error = Some(error.clone());
                    })
                    .await;

                    emit_runner_event(
                        &app_handle,
                        "warning",
                        "Credit check failed; continuing run",
                        &read_status().await,
                        Some(serde_json::json!({ "error": error })),
                    );
                }
            }
        }

        update_status(|status| {
            status.current_phase = "discovering".to_string();
        })
        .await;

        let mut processed_this_cycle = 0usize;
        let mut cycle_seen_urls: HashSet<String> = HashSet::new();

        for seed_url in &request.seed_urls {
            if !RUNNER.is_running.load(Ordering::SeqCst) {
                break;
            }

            if processed_this_cycle >= request.max_jobs_per_cycle {
                break;
            }

            let (client, tab_id) =
                match get_or_open_client(&app_handle, working_tab_id.as_deref(), seed_url).await {
                    Ok(pair) => pair,
                    Err(error) => {
                        update_status(|status| {
                            status.last_error = Some(error.clone());
                            status.jobs_failed += 1;
                        })
                        .await;
                        continue;
                    }
                };
            working_tab_id = Some(tab_id.clone());

            if let Err(error) = client.navigate(seed_url).await {
                update_status(|status| {
                    status.last_error = Some(format!(
                        "Failed to navigate to seed url '{}': {}",
                        seed_url, error
                    ));
                    status.jobs_failed += 1;
                })
                .await;
                continue;
            }

            sleep(Duration::from_millis(1500)).await;

            update_status(|status| {
                status.pages_scanned += 1;
            })
            .await;

            let candidates =
                match discover_job_candidates(&client, request.enable_generic_fallback).await {
                    Ok(values) => values,
                    Err(error) => {
                        update_status(|status| {
                            status.last_error = Some(error);
                        })
                        .await;
                        continue;
                    }
                };

            for candidate in candidates {
                if !RUNNER.is_running.load(Ordering::SeqCst) {
                    break;
                }

                if processed_this_cycle >= request.max_jobs_per_cycle {
                    break;
                }

                if !cycle_seen_urls.insert(candidate.canonical_url.clone()) {
                    update_status(|status| {
                        status.jobs_skipped_duplicate += 1;
                    })
                    .await;
                    continue;
                }

                update_status(|status| {
                    status.jobs_discovered += 1;
                    status.last_job_url = Some(candidate.url.clone());
                })
                .await;

                let decision = record_discovery_and_decide(
                    &candidate.canonical_url,
                    &candidate.url,
                    seed_url,
                    candidate.platform,
                    &request,
                )
                .await;

                match decision {
                    AttemptDecision::Attempt => {}
                    AttemptDecision::SkipAlreadyApplied => {
                        update_status(|status| {
                            status.jobs_skipped_applied += 1;
                        })
                        .await;
                        continue;
                    }
                    AttemptDecision::SkipRetryLimit => {
                        update_status(|status| {
                            status.jobs_skipped_retry_limit += 1;
                        })
                        .await;
                        continue;
                    }
                    AttemptDecision::SkipBackoff { .. } => {
                        update_status(|status| {
                            status.jobs_skipped_backoff += 1;
                        })
                        .await;
                        continue;
                    }
                }

                processed_this_cycle += 1;

                update_status(|status| {
                    status.jobs_attempted += 1;
                    status.last_job_url = Some(candidate.url.clone());
                    if candidate.platform == JobPlatform::Generic {
                        status.jobs_fallback_attempted += 1;
                    }
                })
                .await;

                mark_attempt_started(
                    &candidate.canonical_url,
                    &candidate.url,
                    seed_url,
                    candidate.platform,
                )
                .await;
                persist_runner_ledger_if_enabled().await;
                sync_ledger_entry_count_to_status().await;

                if let Err(error) = client.navigate(&candidate.url).await {
                    let failure = format!("Failed to open job url '{}': {}", candidate.url, error);
                    mark_attempt_failure(
                        &candidate.canonical_url,
                        &candidate.url,
                        seed_url,
                        candidate.platform,
                        failure.clone(),
                        &request,
                    )
                    .await;
                    persist_runner_ledger_if_enabled().await;

                    update_status(|status| {
                        status.jobs_failed += 1;
                        status.last_error = Some(failure.clone());
                        if candidate.platform == JobPlatform::Generic {
                            status.jobs_fallback_failed += 1;
                        }
                    })
                    .await;

                    continue;
                }

                sleep(Duration::from_millis(1500)).await;

                match run_autofill_on_current_page(&client, &request, candidate.platform).await {
                    Ok(result) => {
                        let mut final_result = result.clone();
                        let mut applied = is_autofill_result_successful(&final_result, &request);
                        let mut agentic_fallback_attempted = false;
                        let mut agentic_fallback_applied = false;

                        if !applied
                            && candidate.platform == JobPlatform::Generic
                            && request.enable_agentic_fallback
                        {
                            agentic_fallback_attempted = true;
                            match run_agentic_generic_fallback(
                                &app_handle,
                                &client,
                                &request,
                                &final_result,
                            )
                            .await
                            {
                                Ok(fallback_result) => {
                                    agentic_fallback_applied = fallback_result.submitted;
                                    applied = agentic_fallback_applied;
                                    final_result = with_agentic_result_payload(
                                        &final_result,
                                        &fallback_result,
                                    );
                                }
                                Err(fallback_error) => {
                                    let mut merged =
                                        final_result.as_object().cloned().unwrap_or_default();
                                    merged.insert(
                                        "agenticFallback".to_string(),
                                        serde_json::json!({
                                            "attempted": true,
                                            "submitted": false,
                                            "iterations": 0,
                                            "actionsExecuted": 0,
                                            "lastError": fallback_error,
                                            "outcome": "planning_error",
                                        }),
                                    );
                                    final_result = Value::Object(merged);
                                }
                            }
                        }

                        if applied {
                            let fallback_mode =
                                resolve_fallback_mode(candidate.platform, agentic_fallback_applied);
                            mark_attempt_success(
                                &candidate.canonical_url,
                                &candidate.url,
                                seed_url,
                                candidate.platform,
                            )
                            .await;
                            persist_runner_ledger_if_enabled().await;
                            sync_ledger_entry_count_to_status().await;

                            update_status(|status| {
                                status.jobs_applied += 1;
                                status.last_error = None;
                                if candidate.platform == JobPlatform::Generic {
                                    status.jobs_fallback_applied += 1;
                                }
                                record_agentic_fallback_metrics(
                                    status,
                                    agentic_fallback_attempted,
                                    agentic_fallback_applied,
                                );
                            })
                            .await;

                            emit_runner_event(
                                &app_handle,
                                "job_applied",
                                "Job application submitted",
                                &read_status().await,
                                Some(serde_json::json!({
                                    "jobUrl": candidate.url,
                                    "platform": candidate.platform.as_str(),
                                    "fallbackMode": fallback_mode.as_str(),
                                    "result": final_result,
                                })),
                            );
                        } else {
                            let mut failure = autofill_failure_reason(&final_result);
                            if let Some(fallback_error) = final_result
                                .pointer("/agenticFallback/lastError")
                                .and_then(Value::as_str)
                            {
                                failure = format!(
                                    "{}; agentic fallback error: {}",
                                    failure, fallback_error
                                );
                            }

                            mark_attempt_failure(
                                &candidate.canonical_url,
                                &candidate.url,
                                seed_url,
                                candidate.platform,
                                failure.clone(),
                                &request,
                            )
                            .await;
                            persist_runner_ledger_if_enabled().await;
                            sync_ledger_entry_count_to_status().await;

                            update_status(|status| {
                                status.jobs_failed += 1;
                                status.last_error = Some(failure.clone());
                                if candidate.platform == JobPlatform::Generic {
                                    status.jobs_fallback_failed += 1;
                                }
                                record_agentic_fallback_metrics(
                                    status,
                                    agentic_fallback_attempted,
                                    false,
                                );
                            })
                            .await;
                        }
                    }
                    Err(error) => {
                        let mut failure = error.clone();
                        let mut final_result = serde_json::json!({
                            "success": false,
                            "submitted": false,
                            "error": error,
                        });
                        let mut applied = false;
                        let mut agentic_fallback_attempted = false;
                        let mut agentic_fallback_applied = false;

                        if candidate.platform == JobPlatform::Generic
                            && request.enable_agentic_fallback
                        {
                            agentic_fallback_attempted = true;
                            match run_agentic_generic_fallback(
                                &app_handle,
                                &client,
                                &request,
                                &final_result,
                            )
                            .await
                            {
                                Ok(fallback_result) => {
                                    agentic_fallback_applied = fallback_result.submitted;
                                    applied = agentic_fallback_applied;
                                    if let Some(last_error) = fallback_result.last_error.clone() {
                                        failure = last_error;
                                    }
                                    final_result = with_agentic_result_payload(
                                        &final_result,
                                        &fallback_result,
                                    );
                                }
                                Err(fallback_error) => {
                                    failure = format!(
                                        "Autofill script failed: {}. Agentic fallback failed: {}",
                                        failure, fallback_error
                                    );
                                }
                            }
                        }

                        if applied {
                            let fallback_mode =
                                resolve_fallback_mode(candidate.platform, agentic_fallback_applied);
                            mark_attempt_success(
                                &candidate.canonical_url,
                                &candidate.url,
                                seed_url,
                                candidate.platform,
                            )
                            .await;
                            persist_runner_ledger_if_enabled().await;
                            sync_ledger_entry_count_to_status().await;

                            update_status(|status| {
                                status.jobs_applied += 1;
                                status.last_error = None;
                                if candidate.platform == JobPlatform::Generic {
                                    status.jobs_fallback_applied += 1;
                                }
                                record_agentic_fallback_metrics(
                                    status,
                                    agentic_fallback_attempted,
                                    agentic_fallback_applied,
                                );
                            })
                            .await;

                            emit_runner_event(
                                &app_handle,
                                "job_applied",
                                "Job application submitted through agentic fallback",
                                &read_status().await,
                                Some(serde_json::json!({
                                    "jobUrl": candidate.url,
                                    "platform": candidate.platform.as_str(),
                                    "fallbackMode": fallback_mode.as_str(),
                                    "result": final_result,
                                })),
                            );
                        } else {
                            mark_attempt_failure(
                                &candidate.canonical_url,
                                &candidate.url,
                                seed_url,
                                candidate.platform,
                                failure.clone(),
                                &request,
                            )
                            .await;
                            persist_runner_ledger_if_enabled().await;
                            sync_ledger_entry_count_to_status().await;

                            update_status(|status| {
                                status.jobs_failed += 1;
                                status.last_error = Some(failure.clone());
                                if candidate.platform == JobPlatform::Generic {
                                    status.jobs_fallback_failed += 1;
                                }
                                record_agentic_fallback_metrics(
                                    status,
                                    agentic_fallback_attempted,
                                    false,
                                );
                            })
                            .await;
                        }
                    }
                }

                if let Some(max_total) = request.max_total_applications {
                    let applied_count = RUNNER.status.read().await.jobs_applied;
                    if applied_count >= max_total {
                        update_status(|status| {
                            status.stop_reason =
                                Some(format!("Reached max total applications ({})", max_total));
                            status.current_phase = "stopping".to_string();
                        })
                        .await;
                        RUNNER.is_running.store(false, Ordering::SeqCst);
                        break;
                    }
                }
            }
        }

        if RUNNER.is_running.load(Ordering::SeqCst) {
            update_status(|status| {
                status.current_phase = "sleeping".to_string();
            })
            .await;
            wait_with_cancellation(request.scan_interval_secs).await;
        }
    }

    persist_runner_ledger_if_enabled().await;
    sync_ledger_entry_count_to_status().await;

    update_status(|status| {
        status.is_running = false;
        if status.stop_reason.is_none() {
            status.stop_reason = Some("Runner stopped".to_string());
        }
        status.current_phase = "idle".to_string();
    })
    .await;

    emit_runner_event(
        &app_handle,
        "runner_stopped",
        "Continuous job runner stopped",
        &read_status().await,
        Some(serde_json::json!({
            "sessionId": session_id,
        })),
    );

    RUNNER.is_running.store(false, Ordering::SeqCst);
    let mut handle = RUNNER.handle.lock().await;
    handle.take();
}

#[command]
pub async fn continuous_job_runner_start(
    app_handle: AppHandle,
    mut request: ContinuousJobRunnerRequest,
) -> Result<ContinuousJobRunnerStatus, String> {
    if RUNNER.is_running.swap(true, Ordering::SeqCst) {
        return Err("Continuous job runner is already active".to_string());
    }

    let browser_state = app_handle.state::<BrowserStateWrapper>();
    if !browser_state.is_available() {
        RUNNER.is_running.store(false, Ordering::SeqCst);
        return Err(browser_state.get_error_message());
    }

    request.seed_urls = normalize_seed_urls(request.seed_urls);

    if !request.profile.is_object() {
        RUNNER.is_running.store(false, Ordering::SeqCst);
        return Err("profile must be a JSON object".to_string());
    }

    request.scan_interval_secs = request.scan_interval_secs.max(10);
    request.max_jobs_per_cycle = request.max_jobs_per_cycle.clamp(1, 50);
    request.max_attempts_per_job = request.max_attempts_per_job.clamp(1, 20);
    request.agentic_max_iterations = request.agentic_max_iterations.clamp(1, 20);
    request.agentic_max_actions_per_iteration =
        request.agentic_max_actions_per_iteration.clamp(1, 6);
    request.agentic_planning_timeout_ms = request.agentic_planning_timeout_ms.clamp(5_000, 120_000);
    request.agentic_wait_after_action_ms = request.agentic_wait_after_action_ms.clamp(50, 5_000);
    request.retry_backoff_base_secs = request.retry_backoff_base_secs.max(30);
    request.retry_backoff_max_secs = request
        .retry_backoff_max_secs
        .max(request.retry_backoff_base_secs);

    if request.stop_on_credit_exhaustion {
        if let Err(error) = get_access_token() {
            RUNNER.is_running.store(false, Ordering::SeqCst);
            return Err(format!(
                "Cannot start credit-gated runner without auth token: {}",
                error
            ));
        }
    }

    RUNNER
        .persist_ledger
        .store(request.persist_ledger, Ordering::SeqCst);

    let ledger = if request.persist_ledger {
        let mut loaded = load_ledger_from_disk().await?;
        if request.reset_ledger_on_start {
            loaded = JobAttemptLedger::default();
            if let Err(error) = persist_ledger_to_disk(&loaded).await {
                tracing::warn!(
                    "[ContinuousJobRunner] Failed to persist cleared ledger during start: {}",
                    error
                );
            }
        }
        loaded
    } else {
        JobAttemptLedger::default()
    };

    let ledger_entries = ledger.entries.len() as u64;
    {
        let mut ledger_lock = RUNNER.job_ledger.write().await;
        *ledger_lock = ledger;
    }

    {
        let mut status = RUNNER.status.write().await;
        *status = ContinuousJobRunnerStatus {
            is_running: true,
            session_id: Some(uuid::Uuid::new_v4().to_string()),
            started_at_ms: Some(now_ms()),
            last_activity_at_ms: Some(now_ms()),
            current_phase: "initializing".to_string(),
            stop_reason: None,
            last_error: None,
            last_job_url: None,
            cycle_count: 0,
            pages_scanned: 0,
            jobs_discovered: 0,
            jobs_attempted: 0,
            jobs_applied: 0,
            jobs_failed: 0,
            jobs_skipped_duplicate: 0,
            jobs_skipped_applied: 0,
            jobs_skipped_backoff: 0,
            jobs_skipped_retry_limit: 0,
            jobs_fallback_attempted: 0,
            jobs_fallback_applied: 0,
            jobs_fallback_failed: 0,
            jobs_agentic_fallback_attempted: 0,
            jobs_agentic_fallback_applied: 0,
            jobs_agentic_fallback_failed: 0,
            ledger_entries,
            credits_monthly_remaining_cents: None,
            credits_daily_remaining_cents: None,
        };
    }

    let session_id = RUNNER
        .status
        .read()
        .await
        .session_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let loop_handle = tokio::spawn(run_continuous_loop(app_handle.clone(), request, session_id));

    {
        let mut handle = RUNNER.handle.lock().await;
        *handle = Some(loop_handle);
    }

    Ok(read_status().await)
}

#[command]
pub async fn continuous_job_runner_stop(
    reason: Option<String>,
) -> Result<ContinuousJobRunnerStatus, String> {
    let was_running = RUNNER.is_running.swap(false, Ordering::SeqCst);

    if was_running {
        update_status(|status| {
            status.stop_reason = Some(reason.unwrap_or_else(|| "Stopped by user".to_string()));
            status.current_phase = "stopping".to_string();
            status.is_running = false;
        })
        .await;

        persist_runner_ledger_if_enabled().await;

        if let Some(handle) = RUNNER.handle.lock().await.take() {
            handle.abort();
        }
    }

    Ok(read_status().await)
}

#[command]
pub async fn continuous_job_runner_status() -> Result<ContinuousJobRunnerStatus, String> {
    Ok(read_status().await)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_request() -> ContinuousJobRunnerRequest {
        ContinuousJobRunnerRequest {
            seed_urls: vec![],
            profile: serde_json::json!({}),
            options: serde_json::json!({}),
            resume_path: None,
            cover_letter_path: None,
            scan_interval_secs: default_scan_interval_secs(),
            max_jobs_per_cycle: default_max_jobs_per_cycle(),
            auto_submit: true,
            allow_submit_with_missing_required: false,
            stop_on_credit_exhaustion: true,
            max_total_applications: None,
            max_cycles: None,
            tab_id: None,
            timeout_ms: None,
            enable_generic_fallback: true,
            enable_agentic_fallback: true,
            agentic_max_iterations: default_agentic_max_iterations(),
            agentic_max_actions_per_iteration: default_agentic_max_actions_per_iteration(),
            agentic_planning_timeout_ms: default_agentic_planning_timeout_ms(),
            agentic_wait_after_action_ms: default_agentic_wait_after_action_ms(),
            agentic_model_hint: None,
            max_attempts_per_job: default_max_attempts_per_job(),
            retry_backoff_base_secs: default_retry_backoff_base_secs(),
            retry_backoff_max_secs: default_retry_backoff_max_secs(),
            skip_previously_applied: true,
            persist_ledger: true,
            reset_ledger_on_start: false,
        }
    }

    #[test]
    fn test_supported_job_url_detection() {
        assert_eq!(
            detect_job_platform("https://boards.greenhouse.io/company/jobs/123456"),
            JobPlatform::Greenhouse
        );
        assert_eq!(
            detect_job_platform(
                "https://wd5.myworkdayjobs.com/en-US/recruiting/acme/careers/job/123"
            ),
            JobPlatform::Workday
        );
        assert_eq!(
            detect_job_platform("https://example.com/not-a-job"),
            JobPlatform::Unknown
        );
    }

    #[test]
    fn test_classify_generic_job_url() {
        let candidate = "https://jobs.lever.co/company/abcdef";
        assert_eq!(
            classify_job_platform(candidate, true),
            Some(JobPlatform::Generic)
        );
        assert_eq!(classify_job_platform(candidate, false), None);
    }

    #[test]
    fn test_normalize_seed_urls_defaults() {
        let normalized = normalize_seed_urls(vec![]);
        assert!(!normalized.is_empty());
    }

    #[test]
    fn test_canonicalize_job_url_strips_tracking_params() {
        let canonical = canonicalize_job_url(
            "https://example.com/jobs/123?utm_source=x&job_id=42&gclid=abc&utm_campaign=y",
        )
        .expect("canonical url");
        assert!(canonical.contains("job_id=42"));
        assert!(!canonical.contains("utm_source"));
        assert!(!canonical.contains("gclid"));
    }

    #[test]
    fn test_backoff_grows_and_caps() {
        let request = ContinuousJobRunnerRequest {
            retry_backoff_base_secs: 60,
            retry_backoff_max_secs: 600,
            ..test_request()
        };

        assert_eq!(calculate_backoff_ms(1, &request), 60_000);
        assert_eq!(calculate_backoff_ms(2, &request), 120_000);
        assert_eq!(calculate_backoff_ms(3, &request), 240_000);
        assert_eq!(calculate_backoff_ms(20, &request), 600_000);
    }

    #[test]
    fn test_decide_attempt_skips_applied_and_backoff_and_retry_limit() {
        let request = test_request();
        let now = now_ms();

        let applied_record = JobAttemptRecord {
            canonical_url: "https://example.com/jobs/1".to_string(),
            display_url: "https://example.com/jobs/1".to_string(),
            first_seen_at_ms: now,
            last_seen_at_ms: now,
            last_attempt_at_ms: Some(now),
            next_retry_at_ms: None,
            attempt_count: 1,
            success_count: 1,
            failure_count: 0,
            applied_at_ms: Some(now),
            last_status: "applied".to_string(),
            last_error: None,
            last_platform: "generic".to_string(),
            last_seed_url: None,
        };
        assert_eq!(
            decide_attempt(&applied_record, &request, now),
            AttemptDecision::SkipAlreadyApplied
        );

        let backoff_record = JobAttemptRecord {
            applied_at_ms: None,
            next_retry_at_ms: Some(now + 10_000),
            ..applied_record.clone()
        };
        assert_eq!(
            decide_attempt(&backoff_record, &request, now),
            AttemptDecision::SkipBackoff {
                next_retry_at_ms: now + 10_000
            }
        );

        let retry_limit_record = JobAttemptRecord {
            applied_at_ms: None,
            next_retry_at_ms: None,
            attempt_count: request.max_attempts_per_job,
            ..applied_record
        };
        assert_eq!(
            decide_attempt(&retry_limit_record, &request, now),
            AttemptDecision::SkipRetryLimit
        );
    }

    #[test]
    fn test_extract_json_like_payload_from_fenced_response() {
        let response = r#"
Here is your plan:
```json
{
  "taskComplete": false,
  "makingProgress": true,
  "actions": [{"action":"wait","waitMs":300}]
}
```
"#;
        let extracted = extract_json_like_payload(response).expect("json payload");
        assert!(extracted.contains("\"taskComplete\""));
    }

    #[test]
    fn test_parse_agentic_plan_truncates_actions() {
        let response = r#"{"taskComplete":false,"makingProgress":true,"actions":[{"action":"wait"},{"action":"scroll"},{"action":"finish"}]}"#;
        let plan = parse_agentic_plan_from_llm(response, 2).expect("plan");
        assert_eq!(plan.actions.len(), 2);
    }

    #[test]
    fn test_is_autofill_result_successful_respects_auto_submit() {
        let request = test_request();
        let result = serde_json::json!({
            "success": true,
            "submitted": true,
            "missingRequiredFields": []
        });
        assert!(is_autofill_result_successful(&result, &request));

        let result_not_submitted = serde_json::json!({
            "success": true,
            "submitted": false,
            "missingRequiredFields": []
        });
        assert!(!is_autofill_result_successful(
            &result_not_submitted,
            &request
        ));

        let mut non_submit_request = test_request();
        non_submit_request.auto_submit = false;
        assert!(is_autofill_result_successful(
            &result_not_submitted,
            &non_submit_request
        ));
    }

    #[test]
    fn test_resolve_fallback_mode() {
        assert_eq!(
            resolve_fallback_mode(JobPlatform::Greenhouse, false),
            FallbackMode::None
        );
        assert_eq!(
            resolve_fallback_mode(JobPlatform::Workday, true),
            FallbackMode::None
        );
        assert_eq!(
            resolve_fallback_mode(JobPlatform::Generic, false),
            FallbackMode::GenericRuntime
        );
        assert_eq!(
            resolve_fallback_mode(JobPlatform::Generic, true),
            FallbackMode::Agentic
        );
    }

    #[test]
    fn test_record_agentic_fallback_metrics_distinct_counters() {
        let mut status = ContinuousJobRunnerStatus::default();

        record_agentic_fallback_metrics(&mut status, false, false);
        assert_eq!(status.jobs_agentic_fallback_attempted, 0);
        assert_eq!(status.jobs_agentic_fallback_applied, 0);
        assert_eq!(status.jobs_agentic_fallback_failed, 0);

        record_agentic_fallback_metrics(&mut status, true, true);
        assert_eq!(status.jobs_agentic_fallback_attempted, 1);
        assert_eq!(status.jobs_agentic_fallback_applied, 1);
        assert_eq!(status.jobs_agentic_fallback_failed, 0);

        record_agentic_fallback_metrics(&mut status, true, false);
        assert_eq!(status.jobs_agentic_fallback_attempted, 2);
        assert_eq!(status.jobs_agentic_fallback_applied, 1);
        assert_eq!(status.jobs_agentic_fallback_failed, 1);
    }
}
