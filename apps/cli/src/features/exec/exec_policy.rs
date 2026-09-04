//! Execution-policy gate (C3), wires `agiworkforce-execpolicy` into the agent
//! loop so every shell command the agent runs is evaluated against a policy
//! *before* it executes.
//!
//! The policy engine (ported from codex-rs, Apache-2.0) returns one of three
//! decisions per command: `Allow` (run), `Prompt` (ask the user), or
//! `Forbidden` (never run, even with confirmation). This module:
//!   1. builds the default policy, a small set of catastrophic, irrecoverable
//!      command prefixes that are `Forbidden` outright; and
//!   2. bridges the CLI's existing `classify_command` heuristics in as the
//!      fallback decision when no explicit rule matches, so current behavior is
//!      preserved while the policy layer can override toward stricter blocking.
//!
//! The bash tool calls [`evaluate`] and hard-blocks any `Forbidden` command.

use agiworkforce_execpolicy::{blocking_append_allow_prefix_rule, Decision, Policy, PolicyParser};
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

use crate::safety::{classify_command, CommandSafety};

/// Catastrophic command prefixes that must never run, even with explicit user
/// confirmation. Kept deliberately small and literal, broad heuristics live in
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
    let segments = shell_segments(command)
        .ok_or_else(|| anyhow::anyhow!("cannot persist an unparseable shell command"))?;
    let [segment] = segments.as_slice() else {
        anyhow::bail!(
            "cannot persist an Always Allow rule for a command with shell operators; approve each command separately"
        );
    };
    let prefix = segment_argv(segment)
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

/// A shell command string is never a single argv: `git status && rm -rf /` is
/// two commands, and a prefix rule matching only the first must not authorize
/// the rest. Every segment is evaluated independently.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommandEvaluation {
    pub decision: Decision,
    pub matched_rule: bool,
    pub every_segment_matched_rule: bool,
}

const SEGMENT_BREAKS: &[char] = &[';', '&', '|', '\n', '\r'];

fn is_redirection_ampersand(current: &str, next: Option<char>) -> bool {
    matches!(current.chars().last(), Some('>') | Some('<')) || matches!(next, Some('>'))
}

fn push_segment(segments: &mut Vec<String>, current: &mut String) {
    let segment = current.trim().to_string();
    current.clear();
    if !segment.is_empty() {
        segments.push(segment);
    }
}

fn read_until(chars: &[char], start: usize, terminator: char) -> Option<(String, usize)> {
    let mut index = start;
    let mut inner = String::new();
    while index < chars.len() {
        let character = chars[index];
        if character == '\\' && index + 1 < chars.len() {
            inner.push(character);
            inner.push(chars[index + 1]);
            index += 2;
            continue;
        }
        if character == terminator {
            return Some((inner, index + 1));
        }
        inner.push(character);
        index += 1;
    }
    None
}

fn read_balanced_parens(chars: &[char], start: usize) -> Option<(String, usize)> {
    let mut index = start;
    let mut depth = 1usize;
    let mut inner = String::new();
    let mut quote: Option<char> = None;
    while index < chars.len() {
        let character = chars[index];
        if character == '\\' && quote != Some('\'') && index + 1 < chars.len() {
            inner.push(character);
            inner.push(chars[index + 1]);
            index += 2;
            continue;
        }
        match character {
            '\'' | '"' => match quote {
                Some(open) if open == character => quote = None,
                Some(_) => {}
                None => quote = Some(character),
            },
            '(' if quote.is_none() => depth += 1,
            ')' if quote.is_none() => {
                depth -= 1;
                if depth == 0 {
                    return Some((inner, index + 1));
                }
            }
            _ => {}
        }
        inner.push(character);
        index += 1;
    }
    None
}

/// Split a shell command string into the individual commands it runs, including
/// the ones hidden inside `$(...)` and backtick substitutions. Returns `None`
/// when the string cannot be understood, so callers can fail closed.
fn shell_segments(command: &str) -> Option<Vec<String>> {
    let chars: Vec<char> = command.chars().collect();
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut index = 0;

    while index < chars.len() {
        let character = chars[index];

        if character == '\\' && quote != Some('\'') {
            let next = chars.get(index + 1)?;
            current.push(character);
            current.push(*next);
            index += 2;
            continue;
        }

        if quote != Some('\'') && character == '`' {
            let (inner, next) = read_until(&chars, index + 1, '`')?;
            segments.extend(shell_segments(&inner)?);
            index = next;
            continue;
        }

        if quote != Some('\'') && character == '$' && chars.get(index + 1) == Some(&'(') {
            if chars.get(index + 2) == Some(&'(') {
                return None;
            }
            let (inner, next) = read_balanced_parens(&chars, index + 2)?;
            segments.extend(shell_segments(&inner)?);
            index = next;
            continue;
        }

        if matches!(character, '\'' | '"') {
            match quote {
                Some(open) if open == character => quote = None,
                Some(_) => {}
                None => quote = Some(character),
            }
            current.push(character);
            index += 1;
            continue;
        }

        if quote.is_none()
            && SEGMENT_BREAKS.contains(&character)
            && !(character == '&'
                && is_redirection_ampersand(&current, chars.get(index + 1).copied()))
        {
            push_segment(&mut segments, &mut current);
            index += 1;
            continue;
        }

        current.push(character);
        index += 1;
    }

    if quote.is_some() {
        return None;
    }
    push_segment(&mut segments, &mut current);
    Some(segments)
}

fn segment_argv(segment: &str) -> Option<Vec<String>> {
    shlex::split(segment).filter(|tokens| !tokens.is_empty())
}

/// Evaluate a shell command string against the policy and return the aggregate
/// [`Decision`] across every command it would run.
pub fn evaluate(policy: &Policy, command: &str) -> Decision {
    evaluate_command(policy, command).decision
}

pub fn evaluate_command(policy: &Policy, command: &str) -> CommandEvaluation {
    let Some(segments) = shell_segments(command) else {
        return CommandEvaluation {
            decision: Decision::Prompt,
            matched_rule: true,
            every_segment_matched_rule: false,
        };
    };
    if segments.is_empty() {
        return CommandEvaluation {
            decision: Decision::Allow,
            matched_rule: false,
            every_segment_matched_rule: false,
        };
    }

    let fallback = |_: &[String]| heuristic_decision(command);
    let mut decision = Decision::Allow;
    let mut matched_rule = false;
    let mut every_segment_matched_rule = true;

    for segment in &segments {
        let Some(argv) = segment_argv(segment) else {
            decision = decision.max(Decision::Prompt);
            every_segment_matched_rule = false;
            continue;
        };
        let evaluation = policy.check(&argv, &fallback);
        decision = decision.max(evaluation.decision);
        if evaluation.is_match() {
            matched_rule = true;
        } else {
            every_segment_matched_rule = false;
        }
    }

    CommandEvaluation {
        decision,
        matched_rule,
        every_segment_matched_rule,
    }
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

    fn policy_allowing_git_status() -> Policy {
        let mut policy = default_policy();
        policy
            .add_prefix_rule(&["git".to_string(), "status".to_string()], Decision::Allow)
            .expect("allow rule");
        policy
    }

    #[test]
    fn a_prefix_allow_rule_does_not_authorize_a_chained_command() {
        let policy = policy_allowing_git_status();
        for command in [
            "git status && rm -rf ./src",
            "git status; rm -rf ./src",
            "git status || rm -rf ./src",
            "git status | rm -rf ./src",
            "git status\nrm -rf ./src",
            "git status\r\nrm -rf ./src",
            "git status & rm -rf ./src",
        ] {
            let evaluation = evaluate_command(&policy, command);
            assert!(
                !evaluation.every_segment_matched_rule,
                "`{command}` must not be auto-approved by the `git status` allow rule"
            );
            assert_ne!(
                evaluation.decision,
                Decision::Allow,
                "`{command}` must not evaluate to Allow"
            );
        }
    }

    #[test]
    fn a_chained_catastrophic_command_is_still_forbidden() {
        let policy = policy_allowing_git_status();
        assert_eq!(
            evaluate(&policy, "git status && rm -rf /"),
            Decision::Forbidden
        );
        assert_eq!(
            evaluate(&policy, "git status $(rm -rf /)"),
            Decision::Forbidden
        );
        assert_eq!(
            evaluate(&policy, "git status `rm -rf /`"),
            Decision::Forbidden
        );
        assert_eq!(
            evaluate(&policy, "echo \"$(dd if=/dev/zero of=/dev/sda)\""),
            Decision::Forbidden
        );
    }

    #[test]
    fn an_allow_rule_still_covers_the_command_it_names() {
        let policy = policy_allowing_git_status();
        let evaluation = evaluate_command(&policy, "git status --porcelain");
        assert_eq!(evaluation.decision, Decision::Allow);
        assert!(evaluation.every_segment_matched_rule);
    }

    #[test]
    fn every_segment_must_match_before_confirmation_is_waived() {
        let mut policy = policy_allowing_git_status();
        policy
            .add_prefix_rule(&["git".to_string(), "diff".to_string()], Decision::Allow)
            .expect("allow rule");
        let evaluation = evaluate_command(&policy, "git status && git diff");
        assert_eq!(evaluation.decision, Decision::Allow);
        assert!(evaluation.every_segment_matched_rule);
    }

    #[test]
    fn operators_inside_quotes_are_not_segment_breaks() {
        assert_eq!(
            shell_segments("git commit -m 'fix && ship'").as_deref(),
            Some(["git commit -m 'fix && ship'".to_string()].as_slice())
        );
        assert_eq!(
            shell_segments("ls -la 2>&1").as_deref(),
            Some(["ls -la 2>&1".to_string()].as_slice())
        );
    }

    #[test]
    fn unbalanced_quoting_fails_closed() {
        let policy = policy_allowing_git_status();
        assert_eq!(shell_segments("git status 'unterminated"), None);
        let evaluation = evaluate_command(&policy, "git status 'unterminated");
        assert_eq!(evaluation.decision, Decision::Prompt);
        assert!(!evaluation.every_segment_matched_rule);
    }

    #[tokio::test]
    async fn a_chained_command_cannot_be_persisted_as_an_always_allow_rule() {
        let temp = tempdir().expect("tempdir");
        let policy_path = temp.path().join("user-approved.rules");
        let error = persist_allow_command_to(policy_path.clone(), "git status && rm -rf ./src")
            .await
            .expect_err("chained command must be rejected");
        assert!(error.to_string().contains("shell operators"));
        assert!(!policy_path.exists());
    }
}
