//! Tools this build cannot run on the platform it was built for.

const CODE_EXECUTION_NEEDS_AN_OS_SANDBOX: &str = "Code execution is not available on this platform. It runs model-written code only inside an operating-system sandbox with no network access, and that sandbox exists on macOS and Linux only.";

/// Why `tool_id` cannot run on this platform, or `None` when it can.
///
/// A tool named here is left out of every tool list handed to a model, and a
/// call that names it anyway is refused with this reason rather than failing
/// deep inside the sandbox.
pub fn platform_unavailable_reason(tool_id: &str) -> Option<&'static str> {
    unavailable_reason_on(std::env::consts::OS, tool_id)
}

fn unavailable_reason_on(os: &str, tool_id: &str) -> Option<&'static str> {
    match (os, tool_id) {
        ("macos" | "linux", _) => None,
        (_, "code_execute") => Some(CODE_EXECUTION_NEEDS_AN_OS_SANDBOX),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_execution_is_withheld_where_no_network_denying_sandbox_exists() {
        let reason = unavailable_reason_on("windows", "code_execute")
            .expect("Windows has no sandbox backend for code execution");
        assert!(reason.contains("not available on this platform"));
        assert!(reason.contains("macOS and Linux"));
    }

    #[test]
    fn code_execution_stays_offered_where_the_sandbox_exists() {
        assert_eq!(unavailable_reason_on("macos", "code_execute"), None);
        assert_eq!(unavailable_reason_on("linux", "code_execute"), None);
    }

    #[test]
    fn other_tools_are_not_withheld_on_any_platform() {
        for os in ["windows", "macos", "linux"] {
            assert_eq!(unavailable_reason_on(os, "terminal_execute"), None);
            assert_eq!(unavailable_reason_on(os, "file_read"), None);
        }
    }

    #[test]
    fn the_running_platform_agrees_with_the_sandbox_it_was_built_with() {
        let offered = platform_unavailable_reason("code_execute").is_none();
        assert_eq!(offered, cfg!(any(target_os = "macos", target_os = "linux")));
    }
}
