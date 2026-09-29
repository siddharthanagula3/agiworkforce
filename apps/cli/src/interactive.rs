//! One answer to "can this run ask a person?". A CI runner that allocates a
//! pseudo-terminal still has nobody at it, so `CI` forces the headless
//! contract: prompts are refused and fail closed instead of hanging the job.

use std::io::IsTerminal;

pub const AGENT_SPAWNED_ENV: &str = "AGI_AGENT_SPAWNED";

pub fn mark_agent_spawned(command: &mut tokio::process::Command) {
    command.env(AGENT_SPAWNED_ENV, "1");
}

pub fn spawned_by_agent() -> bool {
    ci_value_is_set(std::env::var(AGENT_SPAWNED_ENV).ok().as_deref())
}

pub fn person_at_terminal(stdout_is_terminal: bool) -> bool {
    person_at_terminal_with(stdout_is_terminal, spawned_by_agent())
}

pub fn person_at_terminal_with(stdout_is_terminal: bool, agent_spawned: bool) -> bool {
    stdout_is_terminal && !agent_spawned
}

pub fn running_under_ci() -> bool {
    ci_value_is_set(std::env::var("CI").ok().as_deref())
}

pub fn ci_value_is_set(value: Option<&str>) -> bool {
    value
        .map(|value| value.trim().to_ascii_lowercase())
        .is_some_and(|value| !matches!(value.as_str(), "" | "0" | "false" | "no" | "off"))
}

pub fn can_prompt() -> bool {
    can_prompt_with(
        running_under_ci(),
        std::io::stdin().is_terminal(),
        std::io::stderr().is_terminal(),
    )
}

pub fn can_prompt_with(under_ci: bool, stdin_is_terminal: bool, stderr_is_terminal: bool) -> bool {
    !under_ci && stdin_is_terminal && stderr_is_terminal
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_agent_run_in_a_pseudo_terminal_is_not_a_person() {
        assert!(person_at_terminal_with(true, false));
        assert!(!person_at_terminal_with(true, true));
        assert!(!person_at_terminal_with(false, false));
    }

    #[test]
    fn the_agent_marker_is_set_on_spawned_commands() {
        let mut command = tokio::process::Command::new("true");
        mark_agent_spawned(&mut command);
        let marked = command
            .as_std()
            .get_envs()
            .any(|(name, value)| name == AGENT_SPAWNED_ENV && value == Some("1".as_ref()));
        assert!(marked);
    }

    #[test]
    fn a_ci_runner_never_prompts_even_with_a_terminal_attached() {
        for set in ["true", "1", "TRUE", "yes", "woodpecker"] {
            assert!(ci_value_is_set(Some(set)), "{set}");
        }
        for unset in [
            None,
            Some(""),
            Some("0"),
            Some("false"),
            Some("off"),
            Some("no"),
        ] {
            assert!(!ci_value_is_set(unset), "{unset:?}");
        }
        assert!(!can_prompt_with(true, true, true));
        assert!(can_prompt_with(false, true, true));
        assert!(!can_prompt_with(false, false, true));
        assert!(!can_prompt_with(false, true, false));
    }
}
