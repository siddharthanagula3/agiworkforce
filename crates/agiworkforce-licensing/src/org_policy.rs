//! Signed **org policy** schema + offline verifier (design §2.2). Port of
//! `packages/contracts/licensing/src/org-policy.ts`.
//!
//! Root of trust: the org LICENSE. A policy signature must verify against a key
//! in the (already-verified) license's `policyKeys[]`, so a forged policy cannot
//! loosen anything the license did not authorize. Monotonic tightening: a policy
//! may only RESTRICT relative to a baseline (product defaults, or a prior
//! policy), never GRANT. Pure, no I/O, never panics.

use serde::Deserialize;

use crate::claims::LicenseClaims;
use crate::container::{ContainerErrorCode, VerifiedContainer, verify_signed_container};

/// The `format` discriminator for signed org-policy containers.
pub const POLICY_CONTAINER_FORMAT: &str = "agipolicy-v1";

/// BYOK posture. Permissiveness order: `allowed` > `allowlist` > `forbidden`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrgPolicyByok {
    Allowed,
    Forbidden,
    Allowlist,
}

fn byok_rank(byok: OrgPolicyByok) -> u8 {
    match byok {
        OrgPolicyByok::Forbidden => 0,
        OrgPolicyByok::Allowlist => 1,
        OrgPolicyByok::Allowed => 2,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrgPolicyEgress {
    /// Whether managed-cloud egress is permitted at all.
    pub managed_cloud: bool,
    /// BYOK provider domains the org permits. `["*"]` = unrestricted.
    pub byok_domains_allowlist: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrgPolicyAuditExport {
    /// Whether the org requires audit export (a compliance OBLIGATION).
    pub required: bool,
    /// Optional export destination path.
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrgPolicy {
    pub policy_id: String,
    pub org_id: String,
    /// Monotonic version counter for this org's policy series.
    pub version: u64,
    /// Unix epoch milliseconds when the policy was issued.
    pub issued_at: i64,
    pub allowed_providers: Vec<String>,
    pub allowed_models: Vec<String>,
    pub byok: OrgPolicyByok,
    pub egress: OrgPolicyEgress,
    /// Max local retention in days; absent = unbounded (product default).
    #[serde(default)]
    pub retention_days: Option<u64>,
    pub audit_export: OrgPolicyAuditExport,
    #[serde(default)]
    pub update_channel: Option<String>,
}

impl OrgPolicy {
    /// Mirror the TS zod `.min(1)` string constraints on `policyId`/`orgId`.
    fn validate(&self) -> Result<(), String> {
        if self.policy_id.is_empty() {
            return Err("org policy field \"policyId\" must be non-empty".to_string());
        }
        if self.org_id.is_empty() {
            return Err("org policy field \"orgId\" must be non-empty".to_string());
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Monotonic tightening
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyPermissions {
    pub allowed_providers: Vec<String>,
    pub allowed_models: Vec<String>,
    pub byok: OrgPolicyByok,
    pub egress: OrgPolicyEgress,
    /// `None` = unbounded retention (most permissive).
    #[serde(default)]
    pub retention_days: Option<u64>,
    pub audit_export: OrgPolicyAuditExport,
}

pub fn default_policy_baseline() -> PolicyPermissions {
    PolicyPermissions {
        allowed_providers: vec!["*".to_string()],
        allowed_models: vec!["*".to_string()],
        byok: OrgPolicyByok::Allowed,
        egress: OrgPolicyEgress {
            managed_cloud: true,
            byok_domains_allowlist: vec!["*".to_string()],
        },
        retention_days: None,
        audit_export: OrgPolicyAuditExport {
            required: false,
            path: None,
        },
    }
}

fn extract_permissions(policy: &OrgPolicy) -> PolicyPermissions {
    PolicyPermissions {
        allowed_providers: policy.allowed_providers.clone(),
        allowed_models: policy.allowed_models.clone(),
        byok: policy.byok,
        egress: OrgPolicyEgress {
            managed_cloud: policy.egress.managed_cloud,
            byok_domains_allowlist: policy.egress.byok_domains_allowlist.clone(),
        },
        retention_days: policy.retention_days,
        audit_export: OrgPolicyAuditExport {
            required: policy.audit_export.required,
            path: None,
        },
    }
}

/// Report a violation if `candidate`'s allowlist is broader than `baseline`'s.
/// `"*"` means unrestricted (broadest). Returns a message, or `None` if the
/// candidate list is a tightening (subset) of the baseline.
fn list_violation(field: &str, candidate: &[String], baseline: &[String]) -> Option<String> {
    let star = "*".to_string();
    if baseline.contains(&star) {
        return None; // baseline unrestricted → anything is ⊑
    }
    if candidate.contains(&star) {
        return Some(format!(
            "{field}: policy re-grants all (\"*\") but the baseline restricts to [{}]",
            baseline.join(", ")
        ));
    }
    let extra: Vec<&String> = candidate
        .iter()
        .filter(|value| !baseline.contains(value))
        .collect();
    if !extra.is_empty() {
        let extra_list = extra
            .iter()
            .map(|value| value.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        return Some(format!(
            "{field}: policy grants [{extra_list}] not permitted by the baseline"
        ));
    }
    None
}

/// The outcome of a tightening check: a verdict plus every field that loosened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TighteningResult {
    pub ok: bool,
    /// Human-readable reasons the candidate is more permissive than the baseline.
    pub violations: Vec<String>,
}

/// Pure monotonic-tightening check: is `candidate` no more permissive than
/// `baseline` on every lattice field? A policy may only restrict, never grant.
///
/// Lattice (candidate must be ⊑ baseline):
/// - allowedProviders / allowedModels / egress.byokDomainsAllowlist: subset,
///   with `"*"` as the unrestricted top.
/// - byok: `allowed` > `allowlist` > `forbidden`.
/// - egress.managedCloud: `true` (permit) > `false` (deny).
/// - retentionDays: shorter is tighter; `None` = unbounded (top).
/// - auditExport.required: `true` (required) is tighter than `false`.
pub fn check_policy_tightening(
    candidate: &PolicyPermissions,
    baseline: &PolicyPermissions,
) -> TighteningResult {
    let mut violations: Vec<String> = Vec::new();

    if let Some(v) = list_violation(
        "allowedProviders",
        &candidate.allowed_providers,
        &baseline.allowed_providers,
    ) {
        violations.push(v);
    }
    if let Some(v) = list_violation(
        "allowedModels",
        &candidate.allowed_models,
        &baseline.allowed_models,
    ) {
        violations.push(v);
    }
    if let Some(v) = list_violation(
        "egress.byokDomainsAllowlist",
        &candidate.egress.byok_domains_allowlist,
        &baseline.egress.byok_domains_allowlist,
    ) {
        violations.push(v);
    }

    // Mirrors the TS early-return: a looser BYOK posture short-circuits. The
    // manifest asserts only the verdict code, so this affects `violations`
    // ordering only, never `ok`.
    if byok_rank(candidate.byok) > byok_rank(baseline.byok) {
        violations.push(format!(
            "byok: \"{:?}\" is more permissive than baseline \"{:?}\"",
            candidate.byok, baseline.byok
        ));
        return TighteningResult {
            ok: false,
            violations,
        };
    }

    if candidate.egress.managed_cloud && !baseline.egress.managed_cloud {
        violations.push(
            "egress.managedCloud: policy re-enables managed-cloud egress the baseline forbids"
                .to_string(),
        );
    }

    // `None` = unbounded = top of the lattice.
    let candidate_retention = candidate.retention_days.map_or(i128::MAX, i128::from);
    let baseline_retention = baseline.retention_days.map_or(i128::MAX, i128::from);
    if candidate_retention > baseline_retention {
        violations.push(format!(
            "retentionDays: policy retains {} days, longer than the baseline {}",
            candidate
                .retention_days
                .map_or("unbounded".to_string(), |days| days.to_string()),
            baseline
                .retention_days
                .map_or("unbounded".to_string(), |days| days.to_string()),
        ));
    }

    if baseline.audit_export.required && !candidate.audit_export.required {
        violations.push(
            "auditExport.required: policy drops an audit export the baseline requires".to_string(),
        );
    }

    TighteningResult {
        ok: violations.is_empty(),
        violations,
    }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/// Org-policy failure taxonomy (identical to the TS `OrgPolicyErrorCode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrgPolicyErrorCode {
    /// Not a well-formed container, or policy JSON/schema invalid.
    Malformed,
    /// Well-formed, but no key in the license's `policyKeys[]` verifies it.
    BadSignature,
    /// Policy `orgId` does not match the license's `orgId`.
    OrgMismatch,
    /// Policy `issuedAt` is in the future relative to the local clock.
    NotYetValid,
    /// Policy grants beyond the baseline (violates monotonic tightening).
    NotTightening,
}

/// A structured org-policy failure. `violations` is populated for
/// `NotTightening`: each lattice field that was loosened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrgPolicyError {
    pub code: OrgPolicyErrorCode,
    pub message: String,
    pub violations: Option<Vec<String>>,
}

/// The verdict of `verify_org_policy`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrgPolicyVerifyResult {
    Ok { policy: OrgPolicy },
    Err(OrgPolicyError),
}

impl OrgPolicyVerifyResult {
    /// Convenience accessor mirroring the TS `result.ok` discriminant.
    pub fn is_ok(&self) -> bool {
        matches!(self, OrgPolicyVerifyResult::Ok { .. })
    }
}

fn err(code: OrgPolicyErrorCode, message: &str) -> OrgPolicyVerifyResult {
    OrgPolicyVerifyResult::Err(OrgPolicyError {
        code,
        message: message.to_string(),
        violations: None,
    })
}

pub fn verify_org_policy(
    file_bytes: &[u8],
    license_claims: &LicenseClaims,
    now_ms: i64,
    baseline: Option<&PolicyPermissions>,
) -> OrgPolicyVerifyResult {
    let payload = match verify_signed_container(
        file_bytes,
        &license_claims.policy_keys,
        POLICY_CONTAINER_FORMAT,
    ) {
        VerifiedContainer::Ok { payload } => payload,
        VerifiedContainer::Err(error) => {
            let code = match error.code {
                ContainerErrorCode::Malformed => OrgPolicyErrorCode::Malformed,
                ContainerErrorCode::BadSignature => OrgPolicyErrorCode::BadSignature,
            };
            return err(code, &error.message);
        }
    };

    let policy_text = match std::str::from_utf8(&payload) {
        Ok(text) => text,
        Err(_) => {
            return err(
                OrgPolicyErrorCode::Malformed,
                "org policy is not valid UTF-8",
            );
        }
    };

    let policy: OrgPolicy = match serde_json::from_str(policy_text) {
        Ok(policy) => policy,
        Err(_) => {
            return err(
                OrgPolicyErrorCode::Malformed,
                "org policy is not valid JSON or schema",
            );
        }
    };

    if let Err(message) = policy.validate() {
        return err(OrgPolicyErrorCode::Malformed, &message);
    }

    if policy.org_id != license_claims.org_id {
        return err(
            OrgPolicyErrorCode::OrgMismatch,
            "org policy orgId does not match the license orgId",
        );
    }

    if policy.issued_at > now_ms {
        return err(
            OrgPolicyErrorCode::NotYetValid,
            "org policy is not yet valid (issuedAt is in the future)",
        );
    }

    let default_baseline = default_policy_baseline();
    let effective_baseline = baseline.unwrap_or(&default_baseline);
    let candidate = extract_permissions(&policy);
    let tightening = check_policy_tightening(&candidate, effective_baseline);
    if !tightening.ok {
        return OrgPolicyVerifyResult::Err(OrgPolicyError {
            code: OrgPolicyErrorCode::NotTightening,
            message: "org policy grants beyond the baseline (monotonic tightening violated)"
                .to_string(),
            violations: Some(tightening.violations),
        });
    }

    OrgPolicyVerifyResult::Ok { policy }
}
