use serde_json::Value;
use std::path::Path;
use std::process::{Command, Output};
use tempfile::tempdir;

fn run_init(workspace: &Path, home: &Path, managed_policy: Option<&Path>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_agi"));
    command
        .arg("init")
        .current_dir(workspace)
        .env("HOME", home)
        .env("AGIWORKFORCE_HOME", home.join(".agiworkforce"))
        .env("AGIWORKFORCE_NO_KEYRING", "1")
        .env_remove("AGIWORKFORCE_MANAGED_POLICY");
    if let Some(policy) = managed_policy {
        command.env("AGIWORKFORCE_MANAGED_POLICY", policy);
    }
    command.output().expect("run agi init")
}

fn registered_projects(home: &Path) -> Value {
    let path = home.join(".agiworkforce").join("projects.json");
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).expect("projects.json parses"),
        Err(_) => Value::Object(Default::default()),
    }
}

#[test]
fn init_records_no_trust_grant_when_managed_policy_forbids_new_grants() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    let policy = home.path().join("managed-policy.json");
    std::fs::write(&policy, r#"{"trust":{"allowGrant":false}}"#).expect("write policy");

    let output = run_init(workspace.path(), home.path(), Some(&policy));

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(!output.status.success(), "stderr: {stderr}");
    assert!(stderr.contains("managed policy"), "stderr: {stderr}");
    assert!(
        registered_projects(home.path())
            .as_object()
            .expect("registry is a map")
            .is_empty(),
        "no project may be registered"
    );
}

#[test]
fn init_records_an_identity_bound_trust_grant_when_policy_allows_it() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");

    let output = run_init(workspace.path(), home.path(), None);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "stderr: {stderr}");
    let projects = registered_projects(home.path());
    let entries = projects.as_object().expect("registry is a map");
    assert_eq!(entries.len(), 1, "registry: {projects}");
    let entry = entries.values().next().expect("one entry");
    assert_eq!(entry["trust_level"], "trusted");
    assert!(entry["identity"].is_string(), "entry: {entry}");
    assert!(entry["trusted_by"].is_string(), "entry: {entry}");
    assert!(entry["trusted_at"].is_string(), "entry: {entry}");
}

fn run_agi(workspace: &Path, home: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_agi"))
        .args(args)
        .current_dir(workspace)
        .env("HOME", home)
        .env("AGIWORKFORCE_HOME", home.join(".agiworkforce"))
        .env("AGIWORKFORCE_NO_KEYRING", "1")
        .env("AGIWORKFORCE_NO_UPDATE_CHECK", "1")
        .env_remove("AGIWORKFORCE_MANAGED_POLICY")
        .env_remove("AGIWORKFORCE_MODEL")
        .output()
        .expect("run agi")
}

#[test]
fn init_writes_a_config_that_sets_nothing_the_user_did_not_choose() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");

    let output = run_init(workspace.path(), home.path(), None);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "stderr: {stderr}");
    let written = std::fs::read_to_string(home.path().join(".agiworkforce").join("config.toml"))
        .expect("init writes config.toml");
    let set_lines: Vec<&str> = written
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .collect();
    assert!(set_lines.is_empty(), "values written: {set_lines:?}");
}

#[test]
fn doctor_and_init_run_and_name_the_file_when_the_config_does_not_parse() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    let agi_home = home.path().join(".agiworkforce");
    std::fs::create_dir_all(&agi_home).expect("create home");
    std::fs::write(agi_home.join("config.toml"), "[default]\nprovider = \"oll").expect("write");
    let named = Path::new(".agiworkforce")
        .join("config.toml")
        .display()
        .to_string();

    let init = run_agi(workspace.path(), home.path(), &["init"]);
    assert!(
        init.status.success(),
        "init must still run: {}",
        String::from_utf8_lossy(&init.stderr)
    );

    let doctor = run_agi(workspace.path(), home.path(), &["doctor", "--json"]);
    let stdout = String::from_utf8_lossy(&doctor.stdout);
    assert!(
        doctor.status.success(),
        "doctor must still run: {}",
        String::from_utf8_lossy(&doctor.stderr)
    );
    let report: Value = serde_json::from_str(&stdout[stdout.find('{').expect("a JSON report")..])
        .expect("doctor prints its report as JSON");
    let config_check = report["checks"]
        .as_array()
        .expect("checks")
        .iter()
        .find(|check| check["id"] == "config.file")
        .expect("a config file check");
    assert_eq!(config_check["status"], "fail", "{config_check}");
    assert!(
        config_check["message"]
            .as_str()
            .is_some_and(|message| message.contains(&named)),
        "{config_check}"
    );

    let other = run_agi(workspace.path(), home.path(), &["session", "list"]);
    let stderr = String::from_utf8_lossy(&other.stderr);
    assert!(!other.status.success());
    assert!(stderr.contains(&named), "stderr: {stderr}");
}
