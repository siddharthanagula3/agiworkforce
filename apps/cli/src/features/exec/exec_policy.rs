//! Execution-policy gate (C3) — wires `agiworkforce-execpolicy` into the agent
//! loop so every shell command the agent runs is evaluated against a policy
//! *before* it executes.
//!
//! The policy engine (ported from codex-rs, Apache-2.0) returns one of three
//! decisions per command: `Allow` (run), `Prompt` (ask the user), or
//! `Forbidden` (never run, even with confirmation). This module:
//!   1. builds the default policy — a small set of catastrophic, irrecoverable
//!      command prefixes that are `Forbidden` outright; and
//!   2. bridges the CLI's existing `classify_command` heuristics in as the
//!      fallback decision when no explicit rule matches, so current behavior is
//!      preserved while the policy layer can override toward stricter blocking.
//!
//! The bash tool calls [`evaluate`] and hard-blocks any `Forbidden` command.

use agiworkforce_execpolicy::{
    blocking_append_allow_prefix_rule, Decision, Evaluation, Policy, PolicyParser,
};
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use crate::safety::{classify_command, CommandSafety};

/// Catastrophic command prefixes that must never run, even with explicit user
/// confirmation. Kept deliberately small and literal — broad heuristics live in
/// `classify_command` (the [`evaluate`] fallback); this list is for the
/// "no human should be able to approve this in an agent loop" cases.
const FORBIDDEN_PREFIXES: &[&[&str]] = &[
    &["rm", "-rf", "/"],
    &["rm", "-rf", "/*"],
    &["rm", "-rf", "--no-preserve-root", "/"],
    &["mkfs.ext4", "/dev/sda"],
    &["dd", "if=/dev/zero", "of=/dev/sda"],
    &[":(){", ":|:&};:"], // classic fork bomb (best-effort literal match)
];

/// Build the default execution policy. Cheap to construct; the bash tool builds
/// one per invocation, which keeps the gate stateless and the rule set easy to
/// reason about.
pub fn default_policy() -> Policy {
    let mut policy = Policy::empty();
    for prefix in FORBIDDEN_PREFIXES {
        let owned: Vec<String> = prefix.iter().map(|s| (*s).to_string()).collect();
        // add_prefix_rule only errors on an empty prefix; ours are all non-empty,
        // so a failure here is a programming error worth surfacing in tests.
        debug_assert!(!owned.is_empty());
        let _ = policy.add_prefix_rule(&owned, Decision::Forbidden);
    }
    policy
}

/// Load the canonical user execution-policy rules and overlay them on the
/// built-in catastrophic-command floor.
pub fn load_policy() -> Result<Policy> {
    let Some(home) = dirs::home_dir() else {
        return Ok(default_policy());
    };
    load_policy_from_dir(&home.join(".agiworkforce").join("rules"))
}

fn load_policy_from_dir(rules_dir: &Path) -> Result<Policy> {
    if !rules_dir.exists() {
        return Ok(default_policy());
    }

    let mut paths = std::fs::read_dir(rules_dir)
        .with_context(|| {
            format!(
                "failed to read exec policy directory {}",
                rules_dir.display()
            )
        })?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<std::io::Result<Vec<_>>>()
        .with_context(|| {
            format!(
                "failed to enumerate exec policy directory {}",
                rules_dir.display()
            )
        })?
        .into_iter()
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "rules")
        })
        .collect::<Vec<_>>();
    paths.sort();

    let mut parser = PolicyParser::new();
    let mut legacy_overlay = Policy::empty();
    for path in paths {
        let contents = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read exec policy {}", path.display()))?;
        if uses_legacy_line_format(&contents) {
            parse_legacy_rules(&mut legacy_overlay, &path, &contents)?;
        } else {
            parser
                .parse(&path.display().to_string(), &contents)
                .map_err(anyhow::Error::new)
                .with_context(|| format!("failed to parse exec policy {}", path.display()))?;
        }
    }

    Ok(default_policy()
        .merge_overlay(&legacy_overlay)
        .merge_overlay(&parser.build()))
}

fn uses_legacy_line_format(contents: &str) -> bool {
    contents.lines().any(|line| {
        let line = line.trim();
        !line.is_empty()
            && !line.starts_with('#')
            && (line.starts_with("allow ") || line.starts_with("deny "))
    })
}

fn parse_legacy_rules(policy: &mut Policy, path: &Path, contents: &str) -> Result<()> {
    for (index, line) in contents.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.splitn(3, ' ');
        let effect = parts.next().unwrap_or_default();
        let matcher = parts.next().unwrap_or_default();
        let value = parts.next().unwrap_or_default().trim();
        let decision = match effect {
            "allow" => Decision::Allow,
            "deny" => Decision::Forbidden,
            _ => anyhow::bail!(
                "{}:{} has invalid legacy exec-policy effect `{effect}`",
                path.display(),
                index + 1
            ),
        };
        let prefixes = match matcher {
            "prefix" => vec![shlex::split(value).ok_or_else(|| {
                anyhow::anyhow!(
                    "{}:{} has an invalid shell prefix",
                    path.display(),
                    index + 1
                )
            })?],
            "program" | "heuristic" if effect == "allow" && !value.is_empty() => {
                vec![vec![value.to_string()]]
            }
            "program" | "heuristic" => anyhow::bail!(
                "{}:{} uses a legacy deny-by-program rule whose path semantics cannot be represented safely; replace it with canonical forbidden prefix_rule entries",
                path.display(),
                index + 1
            ),
            "regex" => translate_legacy_regex(value).with_context(|| {
                format!(
                    "{}:{} uses a legacy regex that cannot be represented as canonical prefix rules",
                    path.display(),
                    index + 1
                )
            })?,
            _ => anyhow::bail!(
                "{}:{} has invalid legacy exec-policy matcher `{matcher}`",
                path.display(),
                index + 1
            ),
        };
        for prefix in prefixes {
            policy
                .add_prefix_rule(&prefix, decision)
                .map_err(anyhow::Error::new)
                .with_context(|| {
                    format!(
                        "failed to translate legacy exec policy {}:{}",
                        path.display(),
                        index + 1
                    )
                })?;
        }
    }
    Ok(())
}

fn translate_legacy_regex(value: &str) -> Result<Vec<Vec<String>>> {
    let anchored = value
        .strip_prefix('^')
        .ok_or_else(|| anyhow::anyhow!("regex is not start-anchored"))?;
    let expression = anchored.strip_suffix('$').unwrap_or(anchored);

    let (program, alternatives) = if let Some((program, group)) = expression.split_once(" (") {
        let alternatives = group
            .strip_suffix(')')
            .ok_or_else(|| anyhow::anyhow!("alternation group is not closed"))?;
        (program, Some(alternatives))
    } else {
        (expression, None)
    };

    if !is_literal_policy_token(program) {
        anyhow::bail!("program contains regex metacharacters");
    }

    let alternatives = alternatives.unwrap_or("");
    if alternatives.is_empty() {
        return Ok(vec![vec![program.to_string()]]);
    }

    alternatives
        .split('|')
        .map(|alternative| {
            if !is_literal_policy_token(alternative) {
                anyhow::bail!("alternative contains regex metacharacters");
            }
            Ok(vec![program.to_string(), alternative.to_string()])
        })
        .collect()
}

fn is_literal_policy_token(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn user_approved_policy_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("cannot persist exec policy: home directory unavailable"))?;
    Ok(home
        .join(".agiworkforce")
        .join("rules")
        .join("user-approved.rules"))
}

pub async fn persist_allow_command(command: &str) -> Result<()> {
    let path = user_approved_policy_path()?;
    persist_allow_command_to(path, command).await
}

async fn persist_allow_command_to(path: PathBuf, command: &str) -> Result<()> {
    let prefix = shlex::split(command)
        .filter(|tokens| !tokens.is_empty())
        .ok_or_else(|| anyhow::anyhow!("cannot persist an empty or invalid shell command"))?;
    let display_path = path.display().to_string();
    tokio::task::spawn_blocking(move || blocking_append_allow_prefix_rule(&path, &prefix))
        .await
        .context("exec-policy persistence task failed")?
        .map_err(anyhow::Error::new)
        .with_context(|| format!("failed to persist exec-policy rule to {display_path}"))
}

/// Map the CLI's coarse command heuristics into an execpolicy [`Decision`]. Used
/// as the fallback when no explicit policy rule matches the command.
fn heuristic_decision(command: &str) -> Decision {
    match classify_command(command) {
        CommandSafety::Safe => Decision::Allow,
        // Unknown and Dangerous both surface to the user today; the existing
        // confirmation flow handles the warning copy. The policy only escalates
        // to Forbidden via explicit rules.
        CommandSafety::Unknown | CommandSafety::Dangerous => Decision::Prompt,
    }
}

/// Evaluate a shell command string against the policy. Tokenizes the command
/// into argv (falling back to a single-token argv if it is not valid shell
/// syntax) and returns the resulting [`Decision`].
pub fn evaluate(policy: &Policy, command: &str) -> Decision {
    evaluate_policy(policy, command).decision
}

pub fn evaluate_policy(policy: &Policy, command: &str) -> Evaluation {
    let argv = shlex::split(command).unwrap_or_else(|| vec![command.to_string()]);
    if argv.is_empty() {
        return Evaluation {
            decision: Decision::Allow,
            matched_rules: Vec::new(),
        };
    }
    let fallback = |_: &[String]| heuristic_decision(command);
    policy.check(&argv, &fallback)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn forbids_catastrophic_rm_rf_root() {
        let policy = default_policy();
        assert_eq!(evaluate(&policy, "rm -rf /"), Decision::Forbidden);
    }

    #[test]
    fn forbids_disk_wipe() {
        let policy = default_policy();
        assert_eq!(
            evaluate(&policy, "dd if=/dev/zero of=/dev/sda"),
            Decision::Forbidden
        );
    }

    #[test]
    fn allows_safe_read_only_command() {
        let policy = default_policy();
        // `ls` is classified Safe by the heuristics fallback (no explicit rule).
        assert_eq!(evaluate(&policy, "ls -la"), Decision::Allow);
    }

    #[test]
    fn non_forbidden_rm_falls_through_to_prompt() {
        // A scoped delete is not in the Forbidden set; it must fall through to the
        // heuristics (which treat rm as needing confirmation), NOT be auto-blocked.
        let policy = default_policy();
        let decision = evaluate(&policy, "rm -rf ./build");
        assert_ne!(decision, Decision::Forbidden);
    }

    #[test]
    fn empty_command_is_allowed() {
        let policy = default_policy();
        assert_eq!(evaluate(&policy, ""), Decision::Allow);
    }

    #[test]
    fn loads_canonical_and_legacy_user_rules() {
        let temp = tempdir().expect("tempdir");
        std::fs::write(
            temp.path().join("canonical.rules"),
            r#"prefix_rule(pattern=["cargo", "test"], decision="allow")
"#,
        )
        .expect("canonical rule");
        std::fs::write(
            temp.path().join("legacy.rules"),
            "deny prefix git push --force\nallow regex ^cargo (check|clippy|test)\n",
        )
        .expect("legacy rule");

        let policy = load_policy_from_dir(temp.path()).expect("load policy");
        assert_eq!(evaluate(&policy, "cargo test"), Decision::Allow);
        assert_eq!(evaluate(&policy, "cargo check"), Decision::Allow);
        assert_eq!(evaluate(&policy, "cargo clippy"), Decision::Allow);
        assert_eq!(
            evaluate(&policy, "git push --force origin main"),
            Decision::Forbidden
        );
    }

    #[test]
    fn user_rule_cannot_override_catastrophic_floor() {
        let temp = tempdir().expect("tempdir");
        std::fs::write(
            temp.path().join("unsafe.rules"),
            r#"prefix_rule(pattern=["rm", "-rf", "/"], decision="allow")
"#,
        )
        .expect("canonical rule");

        let policy = load_policy_from_dir(temp.path()).expect("load policy");
        assert_eq!(evaluate(&policy, "rm -rf /"), Decision::Forbidden);
    }

    #[test]
    fn untranslatable_legacy_regex_fails_closed() {
        let temp = tempdir().expect("tempdir");
        std::fs::write(temp.path().join("legacy.rules"), "allow regex cargo .*\n")
            .expect("legacy rule");

        let error = load_policy_from_dir(temp.path()).expect_err("regex must be rejected");
        assert!(error.to_string().contains("cannot be represented"));
    }

    #[tokio::test]
    async fn persisted_allow_rule_is_loaded_and_enforced() {
        let temp = tempdir().expect("tempdir");
        let policy_path = temp.path().join("user-approved.rules");
        persist_allow_command_to(policy_path.clone(), "cargo test --workspace")
            .await
            .expect("persist rule");

        let contents = std::fs::read_to_string(&policy_path).expect("rule contents");
        assert!(contents.contains(r#"pattern=["cargo", "test", "--workspace"]"#));
        let policy = load_policy_from_dir(temp.path()).expect("load policy");
        assert_eq!(evaluate(&policy, "cargo test --workspace"), Decision::Allow);
    }
}
