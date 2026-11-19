use crate::decision::Decision;
use crate::policy::Policy;

/// Argv prefixes no runtime may ever run, even with user approval.
pub const NEVER_RUN_FLOOR: &[&[&str]] = &[
    &["rm", "-rf", "/"],
    &["rm", "-rf", "/*"],
    &["rm", "-rf", "--no-preserve-root", "/"],
    &["mkfs.ext4", "/dev/sda"],
    &["dd", "if=/dev/zero", "of=/dev/sda"],
    &[":(){", ":|:&};:"],
];

/// A policy holding exactly [`NEVER_RUN_FLOOR`] as `Forbidden` prefix rules.
pub fn never_run_policy() -> Policy {
    let mut policy = Policy::empty();
    for prefix in NEVER_RUN_FLOOR {
        let owned: Vec<String> = prefix.iter().map(|token| (*token).to_string()).collect();
        policy
            .add_prefix_rule(&owned, Decision::Forbidden)
            .expect("never-run floor entries are non-empty");
    }
    policy
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_floor_entry_is_forbidden_in_the_floor_policy() {
        let policy = never_run_policy();
        for prefix in NEVER_RUN_FLOOR {
            let argv: Vec<String> = prefix.iter().map(|token| (*token).to_string()).collect();
            let evaluation = policy.check(&argv, &|_: &[String]| Decision::Allow);
            assert_eq!(evaluation.decision, Decision::Forbidden, "{prefix:?}");
        }
    }

    #[test]
    fn floor_entries_are_lowercase_and_non_empty() {
        for prefix in NEVER_RUN_FLOOR {
            assert!(!prefix.is_empty());
            for token in *prefix {
                assert_eq!(*token, token.to_lowercase());
            }
        }
    }
}
