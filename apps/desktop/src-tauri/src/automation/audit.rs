//! The gate every browser, computer-use and remote-control action passes, and
//! the trail it leaves.
//!
//! Nothing here decides policy on its own. It asks three questions that are
//! each answered elsewhere, in a fixed order, and writes one row per action
//! naming who asked, from which device, against which site, what they asked
//! for, and how it ended. The rows drain to the web outcome pipeline in the
//! shape that route already ingests, so a receipt survives the process.

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use uuid::Uuid;

/// Free text is capped everywhere it enters a row: an audit trail is not a
/// place for page content, and an unbounded reason is how it gets there.
pub const MAX_AUDIT_TEXT: usize = 300;

const MAX_BUFFERED_EVENTS: usize = 500;

/// The surface the platform ingest names for anything this app did.
const DESKTOP_REPORT_SURFACE: &str = "desktop";

pub const KILL_SWITCH_REFUSAL: &str = "Automation is stopped";
pub const PERMISSION_PROMPT_REFUSAL: &str =
    "A system permission prompt is waiting for your answer. Nothing is clicked or typed until you answer it yourself.";
pub const CONSENT_REFUSAL: &str =
    "Computer use has not been accepted on this installation, so no action runs.";
pub const NO_AUTHORITY_REFUSAL: &str =
    "Nothing grants this action: no permission profile covers the site and no app permission covers the app.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutomationSurface {
    Browser,
    ComputerUse,
    RemoteControl,
}

impl AutomationSurface {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Browser => "browser",
            Self::ComputerUse => "computer_use",
            Self::RemoteControl => "remote_control",
        }
    }
}

/// What was checked after the action and whether the check passed. A success
/// with no passing check is recorded as a failure, exactly as the platform does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditVerification {
    pub check: String,
    pub passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AuditOutcome {
    Succeeded { verification: AuditVerification },
    Refused { reason: String },
    Failed { reason: String },
}

impl AuditOutcome {
    pub fn claim(&self) -> &'static str {
        match self {
            Self::Succeeded { verification } if verification.passed => "succeeded",
            Self::Succeeded { .. } | Self::Failed { .. } => "failed",
            Self::Refused { .. } => "refused",
        }
    }

    pub fn reason(&self) -> String {
        match self {
            Self::Succeeded { verification } if verification.passed => {
                format!("Confirmed by: {}.", verification.check)
            }
            Self::Succeeded { verification } => format!(
                "The action reported success but the check did not pass: {}.",
                verification.check
            ),
            Self::Refused { reason } | Self::Failed { reason } => reason.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationAuditEvent {
    pub event_id: String,
    pub run_id: String,
    pub actor: String,
    pub device_id: String,
    pub surface: AutomationSurface,
    pub target: String,
    pub action: String,
    pub capability: String,
    pub profile_id: Option<String>,
    pub outcome: AuditOutcome,
    pub started_at: DateTime<Utc>,
    pub settled_at: DateTime<Utc>,
}

/// One receipt in the shape `POST /api/automation/outcomes` accepts. `claim` is
/// a report, not a verdict: the server settles it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationOutcomeReport {
    #[serde(rename = "eventId")]
    pub event_id: String,
    #[serde(rename = "runId")]
    pub run_id: String,
    pub action: String,
    pub surface: String,
    #[serde(rename = "deviceId")]
    pub device_id: Option<String>,
    #[serde(rename = "startedAtMs")]
    pub started_at_ms: i64,
    #[serde(rename = "settledAtMs")]
    pub settled_at_ms: i64,
    pub claim: String,
    pub reason: String,
    pub target: Option<String>,
    #[serde(rename = "profileId")]
    pub profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification: Option<AuditVerification>,
}

impl AutomationAuditEvent {
    pub fn outcome_report(&self) -> AutomationOutcomeReport {
        AutomationOutcomeReport {
            event_id: self.event_id.clone(),
            run_id: self.run_id.clone(),
            action: format!("{}.{}", self.surface.as_str(), self.action),
            surface: DESKTOP_REPORT_SURFACE.to_string(),
            device_id: (!self.device_id.is_empty()).then(|| self.device_id.clone()),
            started_at_ms: self.started_at.timestamp_millis(),
            settled_at_ms: self.settled_at.timestamp_millis(),
            claim: self.outcome.claim().to_string(),
            reason: clamp(&self.outcome.reason()),
            target: (!self.target.is_empty()).then(|| clamp(&self.target)),
            profile_id: self.profile_id.clone(),
            verification: match &self.outcome {
                AuditOutcome::Succeeded { verification } => Some(verification.clone()),
                _ => None,
            },
        }
    }
}

fn clamp(value: &str) -> String {
    value.chars().take(MAX_AUDIT_TEXT).collect()
}

/// A durable permission profile: which sites, which capabilities, until when.
/// Sessions reference one; revoking it ends every session that does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionProfile {
    pub id: String,
    pub sites: Vec<String>,
    pub capabilities: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub revoked: bool,
}

impl PermissionProfile {
    pub fn admits(&self, target: &str, capability: &str, now: DateTime<Utc>) -> Result<(), String> {
        if self.revoked {
            return Err(format!("Permission profile \"{}\" was revoked.", self.id));
        }
        if self.expires_at.is_some_and(|expiry| expiry <= now) {
            return Err(format!("Permission profile \"{}\" has expired.", self.id));
        }
        if !self.sites.iter().any(|site| site == target) {
            return Err(format!(
                "\"{}\" is not one of the sites profile \"{}\" covers.",
                clamp(target),
                self.id
            ));
        }
        if !self
            .capabilities
            .iter()
            .any(|granted| granted == capability)
        {
            return Err(format!(
                "Profile \"{}\" does not grant \"{}\".",
                self.id,
                clamp(capability)
            ));
        }
        Ok(())
    }
}

static KILL_SWITCH: RwLock<Option<String>> = RwLock::new(None);

/// Stops every automation surface at once until it is released. The reason
/// travels into each refusal so the user is told what stopped, not just that
/// something did.
pub fn engage_kill_switch(reason: impl Into<String>) {
    if let Ok(mut switch) = KILL_SWITCH.write() {
        *switch = Some(clamp(&reason.into()));
    }
}

pub fn release_kill_switch() {
    if let Ok(mut switch) = KILL_SWITCH.write() {
        *switch = None;
    }
}

pub fn kill_switch_reason() -> Option<String> {
    KILL_SWITCH.read().ok().and_then(|switch| switch.clone())
}

static AUDIT_STORE: OnceLock<Arc<Mutex<Connection>>> = OnceLock::new();
static FALLBACK_AUDIT_LOG: Mutex<VecDeque<AutomationAuditEvent>> = Mutex::new(VecDeque::new());

pub fn configure_audit_store(connection: Arc<Mutex<Connection>>) -> Result<(), &'static str> {
    AUDIT_STORE
        .set(connection)
        .map_err(|_| "automation audit store was already configured")
}

fn persist_event(connection: &Connection, event: &AutomationAuditEvent) -> Result<(), String> {
    let payload =
        serde_json::to_string(&event.outcome_report()).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO automation_audit_outbox (payload_json) VALUES (?1)",
            params![payload],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM automation_audit_outbox
             WHERE id IN (
                 SELECT id FROM automation_audit_outbox
                 ORDER BY id DESC
                 LIMIT -1 OFFSET ?1
             )",
            params![MAX_BUFFERED_EVENTS],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn record_event(event: AutomationAuditEvent) {
    if let Some(store) = AUDIT_STORE.get() {
        match store.lock() {
            Ok(connection) => {
                if let Err(error) = persist_event(&connection, &event) {
                    tracing::error!(error, "Failed to persist an automation audit receipt");
                }
            }
            Err(error) => tracing::error!(%error, "Automation audit store lock was poisoned"),
        }
        return;
    }

    let Ok(mut log) = FALLBACK_AUDIT_LOG.lock() else {
        return;
    };
    while log.len() >= MAX_BUFFERED_EVENTS {
        log.pop_front();
    }
    log.push_back(event);
}

/// Test-only access to receipts written before a durable store is configured.
pub fn drain_events(max: usize) -> Vec<AutomationAuditEvent> {
    let Ok(mut log) = FALLBACK_AUDIT_LOG.lock() else {
        return Vec::new();
    };
    let take = max.min(log.len());
    log.drain(..take).collect()
}

pub fn buffered_event_count() -> usize {
    FALLBACK_AUDIT_LOG.lock().map(|log| log.len()).unwrap_or(0)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationAuditOutboxRow {
    pub id: i64,
    pub report: AutomationOutcomeReport,
}

pub fn list_outbox(
    connection: &Connection,
    max: usize,
) -> Result<Vec<AutomationAuditOutboxRow>, String> {
    let limit = max.clamp(1, 200) as i64;
    let mut statement = connection
        .prepare(
            "SELECT id, payload_json
             FROM automation_audit_outbox
             ORDER BY id ASC
             LIMIT ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![limit], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;

    rows.map(|row| {
        let (id, payload) = row.map_err(|error| error.to_string())?;
        let report = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
        Ok(AutomationAuditOutboxRow { id, report })
    })
    .collect()
}

pub fn acknowledge_outbox(connection: &Connection, ids: &[i64]) -> Result<usize, String> {
    if ids.is_empty() || ids.len() > 200 || ids.iter().any(|id| *id <= 0) {
        return Err("automation audit acknowledgement ids are invalid".to_string());
    }
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    let deleted = {
        let mut statement = transaction
            .prepare("DELETE FROM automation_audit_outbox WHERE id = ?1")
            .map_err(|error| error.to_string())?;
        let mut deleted = 0usize;
        for id in ids {
            deleted += statement
                .execute(params![id])
                .map_err(|error| error.to_string())?;
        }
        deleted
    };
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(deleted)
}

#[derive(Debug, Clone)]
pub struct AutomationRequest {
    pub run_id: String,
    pub actor: String,
    pub device_id: String,
    pub surface: AutomationSurface,
    pub target: String,
    pub action: String,
    pub capability: String,
}

/// What grants this action. A browser action is covered by a site profile; a
/// computer-use action by the app permission the user already decided. Both
/// answer the same question, so the guard takes either and neither is optional.
#[derive(Debug, Clone, Copy)]
pub enum AutomationAuthority<'a> {
    Profile(&'a PermissionProfile),
    AppPermission { app: &'a str, granted: bool },
}

impl AutomationAuthority<'_> {
    fn id(&self) -> Option<String> {
        match self {
            Self::Profile(profile) => Some(profile.id.clone()),
            Self::AppPermission { app, .. } => Some(clamp(app)),
        }
    }

    fn admits(&self, target: &str, capability: &str, now: DateTime<Utc>) -> Result<(), String> {
        match self {
            Self::Profile(profile) => profile.admits(target, capability, now),
            Self::AppPermission { granted: true, .. } => Ok(()),
            Self::AppPermission { app, .. } => Err(format!(
                "\"{}\" has not been approved for computer use.",
                clamp(app)
            )),
        }
    }
}

/// The three answers the guard needs, each owned by the layer that knows it:
/// the consent gate, the OS prompt state, and whatever granted the target.
#[derive(Debug, Clone, Copy)]
pub struct AutomationGates<'a> {
    pub consent_accepted: bool,
    pub permission_prompt_on_screen: bool,
    pub authority: Option<AutomationAuthority<'a>>,
    pub now: DateTime<Utc>,
}

#[derive(Debug)]
pub enum AutomationDecision {
    Allowed(AuditTicket),
    Refused { reason: String },
}

impl AutomationDecision {
    pub fn refusal(&self) -> Option<&str> {
        match self {
            Self::Refused { reason } => Some(reason),
            Self::Allowed(_) => None,
        }
    }
}

/// An authorised action that has not finished yet. Dropping it records failure.
#[derive(Debug)]
pub struct AuditTicket {
    request: AutomationRequest,
    profile_id: Option<String>,
    started_at: DateTime<Utc>,
    settled: bool,
}

impl AuditTicket {
    pub fn profile_id(&self) -> Option<&str> {
        self.profile_id.as_deref()
    }

    pub fn succeeded(self, check: impl Into<String>, passed: bool, observed: Option<String>) {
        self.settle(AuditOutcome::Succeeded {
            verification: AuditVerification {
                check: clamp(&check.into()),
                passed,
                observed: observed.as_deref().map(clamp),
            },
        });
    }

    pub fn failed(self, reason: impl Into<String>) {
        self.settle(AuditOutcome::Failed {
            reason: clamp(&reason.into()),
        });
    }

    pub fn refused(self, reason: impl Into<String>) {
        self.settle(AuditOutcome::Refused {
            reason: clamp(&reason.into()),
        });
    }

    fn settle(mut self, outcome: AuditOutcome) {
        self.settled = true;
        record_event(AutomationAuditEvent {
            event_id: Uuid::new_v4().to_string(),
            run_id: self.request.run_id.clone(),
            actor: self.request.actor.clone(),
            device_id: self.request.device_id.clone(),
            surface: self.request.surface,
            target: self.request.target.clone(),
            action: self.request.action.clone(),
            capability: self.request.capability.clone(),
            profile_id: self.profile_id.clone(),
            outcome,
            started_at: self.started_at,
            settled_at: Utc::now(),
        });
    }
}

impl Drop for AuditTicket {
    fn drop(&mut self) {
        if self.settled {
            return;
        }
        record_event(AutomationAuditEvent {
            event_id: Uuid::new_v4().to_string(),
            run_id: self.request.run_id.clone(),
            actor: self.request.actor.clone(),
            device_id: self.request.device_id.clone(),
            surface: self.request.surface,
            target: self.request.target.clone(),
            action: self.request.action.clone(),
            capability: self.request.capability.clone(),
            profile_id: self.profile_id.clone(),
            outcome: AuditOutcome::Failed {
                reason: "The authorized action ended without reporting an outcome.".to_string(),
            },
            started_at: self.started_at,
            settled_at: Utc::now(),
        });
    }
}

/// The one gate. Order matters: the kill switch outranks consent, and a prompt
/// on screen outranks everything the app could answer for itself.
pub fn authorize_automation_action(
    request: AutomationRequest,
    gates: AutomationGates<'_>,
) -> AutomationDecision {
    if let Some(reason) = kill_switch_reason() {
        return refuse(
            request,
            gates.now,
            format!("{KILL_SWITCH_REFUSAL}: {reason}"),
        );
    }
    if gates.permission_prompt_on_screen {
        return refuse(request, gates.now, PERMISSION_PROMPT_REFUSAL.to_string());
    }
    if !gates.consent_accepted {
        return refuse(request, gates.now, CONSENT_REFUSAL.to_string());
    }

    let Some(authority) = gates.authority else {
        return refuse(request, gates.now, NO_AUTHORITY_REFUSAL.to_string());
    };
    if let Err(reason) = authority.admits(&request.target, &request.capability, gates.now) {
        return refuse(request, gates.now, reason);
    }

    AutomationDecision::Allowed(AuditTicket {
        request,
        profile_id: authority.id(),
        started_at: gates.now,
        settled: false,
    })
}

fn refuse(request: AutomationRequest, now: DateTime<Utc>, reason: String) -> AutomationDecision {
    let reason = clamp(&reason);
    record_event(AutomationAuditEvent {
        event_id: Uuid::new_v4().to_string(),
        run_id: request.run_id,
        actor: request.actor,
        device_id: request.device_id,
        surface: request.surface,
        target: request.target,
        action: request.action,
        capability: request.capability,
        profile_id: None,
        outcome: AuditOutcome::Refused {
            reason: reason.clone(),
        },
        started_at: now,
        settled_at: now,
    });
    AutomationDecision::Refused { reason }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex as StdMutex, MutexGuard};

    /// The kill switch and the buffer are process-wide.
    static SERIAL: StdMutex<()> = StdMutex::new(());

    fn serial() -> MutexGuard<'static, ()> {
        let guard = SERIAL
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        release_kill_switch();
        drain_events(MAX_BUFFERED_EVENTS);
        guard
    }

    fn profile() -> PermissionProfile {
        PermissionProfile {
            id: "profile_1".to_string(),
            sites: vec!["https://example.com".to_string()],
            capabilities: vec!["automation".to_string()],
            expires_at: None,
            revoked: false,
        }
    }

    fn request() -> AutomationRequest {
        AutomationRequest {
            run_id: "run_1".to_string(),
            actor: "user_1".to_string(),
            device_id: "device_1".to_string(),
            surface: AutomationSurface::Browser,
            target: "https://example.com".to_string(),
            action: "click".to_string(),
            capability: "automation".to_string(),
        }
    }

    fn gates(profile: Option<&PermissionProfile>) -> AutomationGates<'_> {
        AutomationGates {
            consent_accepted: true,
            permission_prompt_on_screen: false,
            authority: profile.map(AutomationAuthority::Profile),
            now: Utc::now(),
        }
    }

    #[test]
    fn an_allowed_action_leaves_one_row_naming_who_did_what_where() {
        let _serial = serial();
        let held = profile();
        let decision = authorize_automation_action(request(), gates(Some(&held)));
        let AutomationDecision::Allowed(ticket) = decision else {
            panic!("expected the action to be allowed");
        };
        assert_eq!(ticket.profile_id(), Some("profile_1"));
        assert_eq!(buffered_event_count(), 0);

        ticket.succeeded("the page shows the confirmation", true, None);

        let events = drain_events(10);
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event.actor, "user_1");
        assert_eq!(event.device_id, "device_1");
        assert_eq!(event.target, "https://example.com");
        assert_eq!(event.action, "click");
        assert_eq!(event.surface, AutomationSurface::Browser);
        assert_eq!(event.outcome.claim(), "succeeded");
        assert_eq!(drain_events(10).len(), 0);
    }

    /// L73051/L73520: the one thing the agent must never be able to do is
    /// answer the dialog that would widen its own access.
    #[test]
    fn computer_use_cannot_act_while_its_own_permission_prompt_is_on_screen() {
        let _serial = serial();
        let held = profile();
        let mut open = gates(Some(&held));
        open.permission_prompt_on_screen = true;

        let decision = authorize_automation_action(request(), open);
        assert_eq!(decision.refusal(), Some(PERMISSION_PROMPT_REFUSAL));

        let events = drain_events(10);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].outcome.claim(), "refused");
    }

    #[test]
    fn the_kill_switch_outranks_an_accepted_consent_and_a_valid_profile() {
        let _serial = serial();
        let held = profile();
        engage_kill_switch("an administrator turned browser automation off");

        let decision = authorize_automation_action(request(), gates(Some(&held)));
        let refusal = decision.refusal().expect("kill switch refuses").to_string();
        assert!(refusal.starts_with(KILL_SWITCH_REFUSAL));
        assert!(refusal.contains("administrator"));

        release_kill_switch();
        assert!(authorize_automation_action(request(), gates(Some(&held)))
            .refusal()
            .is_none());
    }

    #[test]
    fn an_action_without_consent_or_without_a_profile_is_refused() {
        let _serial = serial();
        let held = profile();
        let mut without_consent = gates(Some(&held));
        without_consent.consent_accepted = false;
        assert_eq!(
            authorize_automation_action(request(), without_consent).refusal(),
            Some(CONSENT_REFUSAL)
        );

        assert_eq!(
            authorize_automation_action(request(), gates(None)).refusal(),
            Some(NO_AUTHORITY_REFUSAL)
        );
        assert_eq!(drain_events(10).len(), 2);
    }

    /// Computer use is governed by the app permission the user decided, and an
    /// app they never approved is refused on the same gate a site is.
    #[test]
    fn an_unapproved_app_is_refused_the_way_an_uncovered_site_is() {
        let _serial = serial();
        let mut on_the_desktop = request();
        on_the_desktop.surface = AutomationSurface::ComputerUse;
        on_the_desktop.target = "com.example.banking".to_string();

        let denied = AutomationGates {
            consent_accepted: true,
            permission_prompt_on_screen: false,
            authority: Some(AutomationAuthority::AppPermission {
                app: "com.example.banking",
                granted: false,
            }),
            now: Utc::now(),
        };
        assert!(authorize_automation_action(on_the_desktop.clone(), denied)
            .refusal()
            .expect("refused")
            .contains("com.example.banking"));

        let approved = AutomationGates {
            authority: Some(AutomationAuthority::AppPermission {
                app: "com.example.banking",
                granted: true,
            }),
            ..denied
        };
        let AutomationDecision::Allowed(ticket) =
            authorize_automation_action(on_the_desktop, approved)
        else {
            panic!("approved app should be allowed");
        };
        ticket.succeeded("the input was delivered", true, None);
        assert_eq!(drain_events(10).len(), 2);
    }

    #[test]
    fn a_profile_covers_only_its_own_sites_capabilities_and_lifetime() {
        let _serial = serial();
        let held = profile();
        let now = Utc::now();

        assert!(held
            .admits("https://example.com", "automation", now)
            .is_ok());
        assert!(held
            .admits("https://evil.example", "automation", now)
            .is_err());
        assert!(held.admits("https://example.com", "download", now).is_err());

        let expired = PermissionProfile {
            expires_at: Some(now - chrono::Duration::seconds(1)),
            ..held.clone()
        };
        assert!(expired
            .admits("https://example.com", "automation", now)
            .is_err());

        let revoked = PermissionProfile {
            revoked: true,
            ..held
        };
        assert!(revoked
            .admits("https://example.com", "automation", now)
            .is_err());
    }

    /// A success nobody checked is reported as a failure, so the desktop cannot
    /// raise the platform success rate by not looking.
    #[test]
    fn an_unchecked_success_is_reported_as_a_failure() {
        let _serial = serial();
        let held = profile();
        let AutomationDecision::Allowed(ticket) =
            authorize_automation_action(request(), gates(Some(&held)))
        else {
            panic!("expected the action to be allowed");
        };
        ticket.succeeded("the confirmation never appeared", false, None);

        let report = drain_events(1)[0].outcome_report();
        assert_eq!(report.claim, "failed");
        assert_eq!(report.surface, DESKTOP_REPORT_SURFACE);
        assert_eq!(report.action, "browser.click");
        assert_eq!(report.device_id.as_deref(), Some("device_1"));
        assert_eq!(report.target.as_deref(), Some("https://example.com"));
        assert_eq!(report.profile_id.as_deref(), Some("profile_1"));
        assert!(report.settled_at_ms >= report.started_at_ms);
    }

    #[test]
    fn dropping_an_allowed_ticket_records_a_failed_outcome() {
        let _serial = serial();
        let held = profile();
        let AutomationDecision::Allowed(ticket) =
            authorize_automation_action(request(), gates(Some(&held)))
        else {
            panic!("expected the action to be allowed");
        };

        drop(ticket);

        let events = drain_events(1);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].outcome.claim(), "failed");
        assert!(events[0]
            .outcome
            .reason()
            .contains("without reporting an outcome"));
    }

    #[test]
    fn durable_outbox_is_read_without_deletion_and_acknowledged_explicitly() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        connection
            .execute_batch(
                "CREATE TABLE automation_audit_outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );",
            )
            .expect("outbox schema");
        let now = Utc::now();
        let event = AutomationAuditEvent {
            event_id: Uuid::new_v4().to_string(),
            run_id: "run_durable".to_string(),
            actor: "user_1".to_string(),
            device_id: "device_1".to_string(),
            surface: AutomationSurface::ComputerUse,
            target: "com.example.notes".to_string(),
            action: "type".to_string(),
            capability: "automation".to_string(),
            profile_id: Some("com.example.notes".to_string()),
            outcome: AuditOutcome::Failed {
                reason: "the target closed".to_string(),
            },
            started_at: now,
            settled_at: now,
        };

        persist_event(&connection, &event).expect("persist receipt");
        let first = list_outbox(&connection, 200).expect("first read");
        let second = list_outbox(&connection, 200).expect("retry read");
        assert_eq!(first.len(), 1);
        assert_eq!(second.len(), 1);
        assert_eq!(first[0].report.event_id, event.event_id);

        assert_eq!(
            acknowledge_outbox(&connection, &[first[0].id]).expect("ack receipt"),
            1
        );
        assert!(list_outbox(&connection, 200)
            .expect("read after ack")
            .is_empty());
    }

    #[test]
    fn a_reason_and_a_target_never_carry_a_page_into_the_trail() {
        let _serial = serial();
        let held = PermissionProfile {
            sites: vec!["https://example.com".to_string()],
            ..profile()
        };
        let mut long = request();
        long.target = "https://evil.example/".to_string() + &"a".repeat(2_000);

        let decision = authorize_automation_action(long, gates(Some(&held)));
        assert!(decision.refusal().expect("refused").chars().count() <= MAX_AUDIT_TEXT);
    }

    #[test]
    fn the_buffer_drops_the_oldest_rows_rather_than_growing_without_end() {
        let _serial = serial();
        let held = profile();
        for _ in 0..(MAX_BUFFERED_EVENTS + 25) {
            authorize_automation_action(request(), gates(None));
        }
        assert_eq!(buffered_event_count(), MAX_BUFFERED_EVENTS);
        let _ = held;
    }
}
