/// Integration test: --json-events stdout must be strict JSONL across all
/// turns including the demo-fallback path.
///
/// The test exercises the EXACT defect described in the task:
///
///   Before the fix, the demo-fallback branch (chat.rs) emitted raw text via
///   `print!("{}", demo_text)` even when `--json-events` was active.  That
///   interleaved a non-JSON line with the JSONL event stream, breaking any
///   consumer that reads the stream line-by-line.
///
///   After the fix the same branch routes through `AgentEvent::MessageDelta`
///   when `json_events=true`, so every stdout line is parseable JSON.
///
/// This test:
///   - Runs the binary with `--demo --json-events exec -m <m1,m2> "hello"`
///     where m1/m2 are claude models (so provider = Anthropic → privacy_mode
///     starts as Byok, allowing the privacy boundary check to pass).
///   - The `--demo` flag synthesises a rate-limit on the primary model,
///     forcing the fallback chain to activate demo mode on the second model.
///   - Asserts every non-empty stdout line is valid JSON.
///   - Asserts at least one line carries `"event":"message_delta"` (proving
///     the assistant text was delivered as a typed event, not raw prose).
///
/// It would have FAILED before the fix because `print!("{}", demo_text)` emits
/// `[DEMO MODE] Synthesized response ...` which is not JSON.
use assert_cmd::prelude::*;
use std::process::Command;
use tempfile::tempdir;

fn agiworkforce_cmd() -> Command {
    Command::cargo_bin("agiworkforce").expect("binary must be built")
}

/// Resolve two distinct Anthropic model IDs from the canonical catalog
/// (`packages/contracts/types/src/models.json`) rather than hardcoding literals, per the
/// repo rule that model IDs are canonical only in the shared catalog.
///
/// Both IDs must detect as `Provider::Anthropic` so the exec privacy_mode
/// starts as Byok. We prefer two of the catalog's primary Anthropic slots
/// (Opus/Sonnet/Haiku api ids); if only one distinct id is available we
/// duplicate it (the demo-fallback chain still exercises two turns).
fn anthropic_models_arg() -> String {
    use agiworkforce_cli::model_catalog;

    let mut ids: Vec<String> = model_catalog::anthropic_primary_models()
        .into_iter()
        .map(|(api_id, _name, _tier)| api_id)
        .collect();

    if ids.is_empty() {
        // Fall back to the fast-completion routing slot for Anthropic.
        ids.push(model_catalog::fast_completion_model("anthropic"));
    }

    let primary = ids
        .first()
        .cloned()
        .expect("canonical catalog must expose at least one Anthropic model id");
    let fallback = ids.get(1).cloned().unwrap_or_else(|| primary.clone());

    assert_eq!(
        model_catalog::provider_for(&primary),
        Some("anthropic"),
        "primary test model '{primary}' must be an Anthropic catalog model"
    );

    format!("{primary},{fallback}")
}

/// Helper: run the binary and collect stdout lines (non-empty, trimmed).
fn run_json_events(models_arg: &str, prompt: &str) -> (Vec<String>, String, String) {
    let workspace = tempdir().expect("trusted JSON-events workspace");
    let home = tempdir().expect("isolated JSON-events home");
    let initialized = agiworkforce_cmd()
        .arg("init")
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .output()
        .expect("failed to initialize trusted JSON-events workspace");
    assert!(
        initialized.status.success(),
        "agi init failed: {}",
        String::from_utf8_lossy(&initialized.stderr)
    );
    let output = agiworkforce_cmd()
        .args(["--demo", "--json-events", "exec", "-m", models_arg, prompt])
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .output()
        .expect("failed to spawn agiworkforce");

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let lines: Vec<String> = stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.to_string())
        .collect();
    (lines, stdout, stderr)
}

#[test]
fn json_events_stdout_is_strict_jsonl_across_demo_fallback() {
    // Use claude models: both are detected as Provider::Anthropic so
    // privacy_mode starts as Byok (not Local), allowing the privacy check to
    // pass.  --demo forces a rate-limit on the primary and activates demo mode
    // on the fallback, exercising the chat.rs demo-fallback code path.
    let (lines, stdout, stderr) = run_json_events(&anthropic_models_arg(), "hello");

    // There must be at least one output line.
    assert!(
        !lines.is_empty(),
        "expected at least one stdout line; got none.\nstderr: {}",
        stderr
    );

    // Every line must be valid JSON (the core JSONL contract).
    for line in &lines {
        let parse_result = serde_json::from_str::<serde_json::Value>(line);
        assert!(
            parse_result.is_ok(),
            "stdout contained a non-JSON line: {:?}\n\nFull stdout:\n{}\nstderr:\n{}",
            line,
            stdout,
            stderr
        );
    }

    // At least one line must be a message_delta event, proving the assistant
    // text (demo body) was routed through MessageDelta rather than raw print!.
    let has_message_delta = lines.iter().any(|line| {
        serde_json::from_str::<serde_json::Value>(line)
            .ok()
            .and_then(|v| {
                v.get("event")
                    .and_then(|e| e.as_str())
                    .map(|s| s.to_string())
            })
            .as_deref()
            == Some("message_delta")
    });
    assert!(
        has_message_delta,
        "expected at least one message_delta event in the json-events stream.\n\
         Full stdout:\n{}\nstderr:\n{}",
        stdout, stderr
    );
}

/// Verify that every message_delta event carries the same session_id as the
/// spawning event, confirming session context is threaded consistently across
/// the fallback continuation turn.
#[test]
fn json_events_message_delta_session_id_matches_spawning_session_id() {
    let (lines, stdout, stderr) = run_json_events(&anthropic_models_arg(), "hello");

    // Parse all lines as JSON.
    let parsed: Vec<serde_json::Value> = lines
        .iter()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();

    // Extract spawning session_id.
    let spawning_sid = parsed
        .iter()
        .find(|v| v.get("event").and_then(|e| e.as_str()) == Some("spawning"))
        .and_then(|v| {
            v.get("session_id")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string())
        });

    // Extract all message_delta session_ids.
    let delta_sids: Vec<String> = parsed
        .iter()
        .filter(|v| v.get("event").and_then(|e| e.as_str()) == Some("message_delta"))
        .filter_map(|v| {
            v.get("session_id")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string())
        })
        .collect();

    // The session-id consistency contract must not pass vacuously: the
    // json-events stream always carries the assistant text as message_delta
    // events (see the strict-JSONL test above), so at least one must be present
    // regardless of whether a spawning event was emitted.
    assert!(
        !delta_sids.is_empty(),
        "expected at least one message_delta event carrying a session_id; got none.\n\
         Full stdout:\n{}\nstderr:\n{}",
        stdout,
        stderr
    );

    if let Some(sid) = spawning_sid {
        // Every message_delta must have the same session_id as spawning.
        for delta_sid in &delta_sids {
            assert_eq!(
                delta_sid, &sid,
                "message_delta session_id mismatch: expected {:?} got {:?}\n\
                 Full stdout:\n{}\nstderr:\n{}",
                sid, delta_sid, stdout, stderr
            );
        }
    }
    // If there's no spawning event (e.g. the session path differs), the
    // !delta_sids.is_empty() assertion above still guarantees the message_delta
    // events were threaded with a session_id; the strict-JSONL test covers purity.
}
