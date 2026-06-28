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

use agiworkforce_execpolicy::{Decision, Policy};

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
    let argv = shlex::split(command).unwrap_or_else(|| vec![command.to_string()]);
    if argv.is_empty() {
        return Decision::Allow;
    }
    let fallback = |_: &[String]| heuristic_decision(command);
    policy.check(&argv, &fallback).decision
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
