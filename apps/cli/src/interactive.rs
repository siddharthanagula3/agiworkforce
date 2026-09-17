//! One answer to "can this run ask a person?". A CI runner that allocates a
//! pseudo-terminal still has nobody at it, so `CI` forces the headless
//! contract: prompts are refused and fail closed instead of hanging the job.

use std::io::IsTerminal;

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
