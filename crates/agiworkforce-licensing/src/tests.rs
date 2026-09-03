
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;

use crate::LicenseClaims;
use crate::org_policy::{
    OrgPolicyErrorCode, OrgPolicyVerifyResult, POLICY_CONTAINER_FORMAT, PolicyPermissions,
    verify_org_policy,
};
use crate::test_support::{derive_keypair_from_seed_label, make_signed_container};
use crate::verify::{
    LICENSE_CONTAINER_FORMAT, LicenseErrorCode, LicenseVerifyResult, verify_license,
};

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn license_fixtures_dir() -> PathBuf {
    manifest_dir().join("../../packages/contracts/licensing/src/__fixtures__")
}

fn org_policy_fixtures_dir() -> PathBuf {
    manifest_dir().join("../../packages/contracts/licensing/src/__fixtures__/org-policy")
}

fn read_fixture(dir: &Path, file: &str) -> Vec<u8> {
    fs::read(dir.join(file)).unwrap_or_else(|e| panic!("read fixture {file}: {e}"))
}

fn license_code_str(code: LicenseErrorCode) -> &'static str {
    match code {
        LicenseErrorCode::Malformed => "malformed",
        LicenseErrorCode::BadSignature => "bad_signature",
        LicenseErrorCode::NotYetValid => "not_yet_valid",
        LicenseErrorCode::Expired => "expired",
    }
}

fn org_policy_code_str(code: OrgPolicyErrorCode) -> &'static str {
    match code {
        OrgPolicyErrorCode::Malformed => "malformed",
        OrgPolicyErrorCode::BadSignature => "bad_signature",
        OrgPolicyErrorCode::OrgMismatch => "org_mismatch",
        OrgPolicyErrorCode::NotYetValid => "not_yet_valid",
        OrgPolicyErrorCode::NotTightening => "not_tightening",
    }
}

// ---------------------------------------------------------------------------
// License corpus replay
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseManifest {
    root_public_keys: Vec<String>,
    cases: Vec<LicenseFixtureCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseFixtureCase {
    file: String,
    now_ms: i64,
    expect: Value,
}

#[test]
fn license_fixture_corpus_replays_identically() {
    let dir = license_fixtures_dir();
    let manifest: LicenseManifest =
        serde_json::from_slice(&read_fixture(&dir, "manifest.json")).expect("license manifest");

    // The corpus must exercise the full verdict surface (matches the TS guard).
    let mut seen: Vec<&str> = Vec::new();
    for case in &manifest.cases {
        seen.push(if case.expect["ok"].as_bool() == Some(true) {
            "ok"
        } else {
            case.expect["code"].as_str().expect("error case has a code")
        });
    }
    for required in [
        "ok",
        "bad_signature",
        "expired",
        "not_yet_valid",
        "malformed",
    ] {
        assert!(
            seen.contains(&required),
            "corpus is missing a {required} case"
        );
    }

    assert!(!manifest.cases.is_empty());
    for case in &manifest.cases {
        let bytes = read_fixture(&dir, &case.file);
        let result = verify_license(&bytes, &manifest.root_public_keys, case.now_ms);
        if case.expect["ok"].as_bool() == Some(true) {
            match result {
                LicenseVerifyResult::Ok {
                    claims,
                    grace_active,
                } => {
                    let expected_grace = case.expect["graceActive"].as_bool().expect("graceActive");
                    assert_eq!(
                        grace_active, expected_grace,
                        "{}: graceActive mismatch",
                        case.file
                    );
                    assert!(
                        !claims.org_id.is_empty(),
                        "{}: orgId should be present",
                        case.file
                    );
                }
                LicenseVerifyResult::Err(error) => panic!(
                    "{}: expected ok, got error {:?}",
                    case.file,
                    license_code_str(error.code)
                ),
            }
        } else {
            let expected_code = case.expect["code"].as_str().expect("error case code");
            match result {
                LicenseVerifyResult::Err(error) => assert_eq!(
                    license_code_str(error.code),
                    expected_code,
                    "{}: error code mismatch",
                    case.file
                ),
                LicenseVerifyResult::Ok { .. } => {
                    panic!("{}: expected error {expected_code}, got ok", case.file)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Org-policy corpus replay
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgPolicyManifest {
    license_claims: LicenseClaims,
    cases: Vec<OrgPolicyFixtureCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrgPolicyFixtureCase {
    file: String,
    now_ms: i64,
    #[serde(default)]
    baseline: Option<PolicyPermissions>,
    expect: Value,
}

#[test]
fn org_policy_fixture_corpus_replays_identically() {
    let dir = org_policy_fixtures_dir();
    let manifest: OrgPolicyManifest =
        serde_json::from_slice(&read_fixture(&dir, "manifest.json")).expect("org-policy manifest");

    // Exercise the full verdict surface (matches the TS guard).
    let mut seen: Vec<&str> = Vec::new();
    for case in &manifest.cases {
        seen.push(if case.expect["ok"].as_bool() == Some(true) {
            "ok"
        } else {
            case.expect["code"].as_str().expect("error case has a code")
        });
    }
    for required in [
        "ok",
        "bad_signature",
        "org_mismatch",
        "not_yet_valid",
        "not_tightening",
        "malformed",
    ] {
        assert!(
            seen.contains(&required),
            "corpus is missing a {required} case"
        );
    }

    assert!(!manifest.cases.is_empty());
    for case in &manifest.cases {
        let bytes = read_fixture(&dir, &case.file);
        let result = verify_org_policy(
            &bytes,
            &manifest.license_claims,
            case.now_ms,
            case.baseline.as_ref(),
        );
        if case.expect["ok"].as_bool() == Some(true) {
            match result {
                OrgPolicyVerifyResult::Ok { policy } => {
                    assert_eq!(
                        policy.org_id, manifest.license_claims.org_id,
                        "{}: policy should bind the license org",
                        case.file
                    );
                }
                OrgPolicyVerifyResult::Err(error) => panic!(
                    "{}: expected ok, got error {:?}",
                    case.file,
                    org_policy_code_str(error.code)
                ),
            }
        } else {
            let expected_code = case.expect["code"].as_str().expect("error case code");
            match result {
                OrgPolicyVerifyResult::Err(error) => assert_eq!(
                    org_policy_code_str(error.code),
                    expected_code,
                    "{}: error code mismatch",
                    case.file
                ),
                OrgPolicyVerifyResult::Ok { .. } => {
                    panic!("{}: expected error {expected_code}, got ok", case.file)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Expiry / grace boundaries (direct, minting real signatures)
// ---------------------------------------------------------------------------

fn boundary_claims(issued_at: i64, expires_at: i64, grace_days: u64) -> Value {
    serde_json::json!({
        "licenseId": "lic_b",
        "orgId": "org_b",
        "orgName": "Boundary Co",
        "edition": "team",
        "seats": 1,
        "issuedAt": issued_at,
        "expiresAt": expires_at,
        "graceDays": grace_days,
        "features": [],
        "policyKeys": [],
    })
}

#[test]
fn expiry_and_grace_boundaries() {
    let root = derive_keypair_from_seed_label("boundary-root");
    let issued_at = 1_000_000_000_000i64;
    let expires_at = issued_at + 30 * 86_400_000;
    let grace_days = 7u64;
    let grace_cutoff = expires_at + (grace_days as i64) * 86_400_000;
    let file = make_signed_container(
        &boundary_claims(issued_at, expires_at, grace_days),
        &root,
        LICENSE_CONTAINER_FORMAT,
    );
    let roots = vec![root.public_key_b64];

    // one ms before issuedAt → not_yet_valid
    match verify_license(&file, &roots, issued_at - 1) {
        LicenseVerifyResult::Err(e) => assert_eq!(e.code, LicenseErrorCode::NotYetValid),
        _ => panic!("expected not_yet_valid"),
    }
    // exactly at issuedAt → valid, no grace
    match verify_license(&file, &roots, issued_at) {
        LicenseVerifyResult::Ok { grace_active, .. } => assert!(!grace_active),
        _ => panic!("expected valid at issuedAt"),
    }
    // exactly at expiresAt → valid, no grace
    match verify_license(&file, &roots, expires_at) {
        LicenseVerifyResult::Ok { grace_active, .. } => assert!(!grace_active),
        _ => panic!("expected valid at expiresAt"),
    }
    // one ms after expiresAt → valid-in-grace
    match verify_license(&file, &roots, expires_at + 1) {
        LicenseVerifyResult::Ok { grace_active, .. } => assert!(grace_active),
        _ => panic!("expected grace"),
    }
    // exactly at grace cutoff → still valid-in-grace
    match verify_license(&file, &roots, grace_cutoff) {
        LicenseVerifyResult::Ok { grace_active, .. } => assert!(grace_active),
        _ => panic!("expected grace at cutoff"),
    }
    // one ms past grace cutoff → expired
    match verify_license(&file, &roots, grace_cutoff + 1) {
        LicenseVerifyResult::Err(e) => assert_eq!(e.code, LicenseErrorCode::Expired),
        _ => panic!("expected expired"),
    }
}

// ---------------------------------------------------------------------------
// Key rotation + never-panic
// ---------------------------------------------------------------------------

fn rotation_claims() -> Value {
    serde_json::json!({
        "licenseId": "lic_r",
        "orgId": "org_r",
        "orgName": "Rotate Co",
        "edition": "enterprise",
        "seats": 10,
        "issuedAt": 1_000_000_000_000i64,
        "expiresAt": 2_000_000_000_000i64,
        "graceDays": 0,
        "features": [],
        "policyKeys": [],
    })
}

#[test]
fn accepts_any_key_in_the_rotatable_root_list() {
    let old_key = derive_keypair_from_seed_label("rotate-old");
    let new_key = derive_keypair_from_seed_label("rotate-new");
    let now = 1_500_000_000_000i64;
    let signed_by_new =
        make_signed_container(&rotation_claims(), &new_key, LICENSE_CONTAINER_FORMAT);
    let result = verify_license(
        &signed_by_new,
        &[old_key.public_key_b64, new_key.public_key_b64],
        now,
    );
    assert!(result.is_ok());
}

#[test]
fn rejects_once_the_signing_key_is_dropped() {
    let old_key = derive_keypair_from_seed_label("rotate-old");
    let new_key = derive_keypair_from_seed_label("rotate-new");
    let now = 1_500_000_000_000i64;
    let signed_by_old =
        make_signed_container(&rotation_claims(), &old_key, LICENSE_CONTAINER_FORMAT);
    match verify_license(&signed_by_old, &[new_key.public_key_b64], now) {
        LicenseVerifyResult::Err(e) => assert_eq!(e.code, LicenseErrorCode::BadSignature),
        _ => panic!("expected bad_signature"),
    }
}

#[test]
fn never_panics_on_garbage_input() {
    let key = derive_keypair_from_seed_label("rotate-new");
    match verify_license(&[0, 1, 2, 3, 255], &[key.public_key_b64], 1_500_000_000_000) {
        LicenseVerifyResult::Err(e) => assert_eq!(e.code, LicenseErrorCode::Malformed),
        _ => panic!("expected malformed"),
    }
}

#[test]
fn empty_root_keys_is_bad_signature_not_malformed() {
    let root = derive_keypair_from_seed_label("empty-root");
    let file = make_signed_container(&rotation_claims(), &root, LICENSE_CONTAINER_FORMAT);
    // A well-formed container with no configured keys cannot verify: bad_signature.
    match verify_license(&file, &[], 1_500_000_000_000) {
        LicenseVerifyResult::Err(e) => assert_eq!(e.code, LicenseErrorCode::BadSignature),
        _ => panic!("expected bad_signature"),
    }
}

#[test]
fn tampered_payload_is_bad_signature() {
    let root = derive_keypair_from_seed_label("tamper-root");
    let file = make_signed_container(&rotation_claims(), &root, LICENSE_CONTAINER_FORMAT);
    let tampered = crate::test_support::tamper_container_payload(&file);
    match verify_license(&tampered, &[root.public_key_b64], 1_500_000_000_000) {
        LicenseVerifyResult::Err(e) => assert_eq!(e.code, LicenseErrorCode::BadSignature),
        _ => panic!("expected bad_signature"),
    }
}

#[test]
fn org_policy_wrong_format_is_malformed() {
    // A license-format container handed to the policy verifier must not verify as
    // a policy (format discriminator mismatch → malformed), even when signed by a
    // policy key.
    let policy_key = derive_keypair_from_seed_label("policy-key");
    let license = LicenseClaims {
        license_id: "lic_x".to_string(),
        org_id: "org_x".to_string(),
        org_name: "X".to_string(),
        edition: crate::Edition::Enterprise,
        seats: 1,
        issued_at: 0,
        expires_at: 0,
        grace_days: 0,
        features: vec![],
        policy_keys: vec![policy_key.public_key_b64.clone()],
    };
    let container = make_signed_container(
        &serde_json::json!({ "hello": "world" }),
        &policy_key,
        LICENSE_CONTAINER_FORMAT, // wrong format for a policy
    );
    match verify_org_policy(&container, &license, 0, None) {
        OrgPolicyVerifyResult::Err(e) => assert_eq!(e.code, OrgPolicyErrorCode::Malformed),
        _ => panic!("expected malformed"),
    }
    // Sanity: the correct policy format with a non-policy payload fails schema,
    // still malformed (never a panic).
    let policy_container = make_signed_container(
        &serde_json::json!({ "hello": "world" }),
        &policy_key,
        POLICY_CONTAINER_FORMAT,
    );
    match verify_org_policy(&policy_container, &license, 0, None) {
        OrgPolicyVerifyResult::Err(e) => assert_eq!(e.code, OrgPolicyErrorCode::Malformed),
        _ => panic!("expected malformed"),
    }
}
