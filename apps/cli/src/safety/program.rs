//! What a command segment actually runs: the spelling of its program, and the
//! command line hidden behind a wrapper such as `sh -c`, `env` or `sudo`.

/// Directories whose contents are the system tools an allowlist can name.
const SYSTEM_BIN_DIRECTORIES: &[&str] = &[
    "/bin",
    "/sbin",
    "/usr/bin",
    "/usr/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
];

/// Shells that take their command line from a `-c` argument.
const SHELL_INTERPRETERS: &[&str] = &[
    "sh", "bash", "zsh", "dash", "ksh", "fish", "csh", "tcsh", "ash", "busybox",
];

struct Wrapper {
    name: &'static str,
    value_flags: &'static [&'static str],
    positional_skips: usize,
}

/// Programs whose arguments are another command line. The classifier and the
/// execution policy both look through them to the command that really runs.
const WRAPPERS: &[Wrapper] = &[
    Wrapper {
        name: "env",
        value_flags: &["-u", "--unset", "-C", "--chdir", "-S", "--split-string"],
        positional_skips: 0,
    },
    Wrapper {
        name: "sudo",
        value_flags: &[
            "-u",
            "--user",
            "-g",
            "--group",
            "-p",
            "--prompt",
            "-C",
            "--close-from",
            "-U",
            "--other-user",
            "-T",
            "--command-timeout",
            "-r",
            "--role",
            "-t",
            "--type",
            "-h",
            "--host",
        ],
        positional_skips: 0,
    },
    Wrapper {
        name: "doas",
        value_flags: &["-u", "-C"],
        positional_skips: 0,
    },
    Wrapper {
        name: "nice",
        value_flags: &["-n", "--adjustment"],
        positional_skips: 0,
    },
    Wrapper {
        name: "timeout",
        value_flags: &["-s", "--signal", "-k", "--kill-after"],
        positional_skips: 1,
    },
    Wrapper {
        name: "nohup",
        value_flags: &[],
        positional_skips: 0,
    },
    Wrapper {
        name: "setsid",
        value_flags: &[],
        positional_skips: 0,
    },
    Wrapper {
        name: "stdbuf",
        value_flags: &["-i", "-o", "-e", "--input", "--output", "--error"],
        positional_skips: 0,
    },
    Wrapper {
        name: "command",
        value_flags: &[],
        positional_skips: 0,
    },
    Wrapper {
        name: "chroot",
        value_flags: &["--userspec", "--groups"],
        positional_skips: 1,
    },
];

/// True when the program is named by a spelling the command allowlist can vouch
/// for: a bare name resolved through `PATH`, or a system binary directory.
pub(crate) fn program_spelling_is_trusted(first_word: &str) -> bool {
    if first_word.is_empty() {
        return false;
    }
    if !first_word.contains('/') && !first_word.contains('\\') {
        return true;
    }
    let Some((directory, name)) = first_word.rsplit_once('/') else {
        return false;
    };
    !name.is_empty() && !name.contains('\\') && SYSTEM_BIN_DIRECTORIES.contains(&directory)
}

fn is_assignment(token: &str) -> bool {
    match token.split_once('=') {
        Some((name, _)) => {
            !name.is_empty()
                && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                && !name.starts_with(|c: char| c.is_ascii_digit())
        }
        None => false,
    }
}

fn shell_payload(tokens: &[String]) -> Option<String> {
    let mut index = 1;
    while index < tokens.len() {
        let token = &tokens[index];
        if token == "-c"
            || (token.starts_with('-') && !token.starts_with("--") && token.contains('c'))
        {
            return tokens.get(index + 1).cloned();
        }
        if token == "--" || !token.starts_with('-') {
            return None;
        }
        index += 1;
    }
    None
}

fn wrapper_payload(wrapper: &Wrapper, tokens: &[String]) -> Option<String> {
    let mut index = 1;
    let mut skips = wrapper.positional_skips;
    while index < tokens.len() {
        let token = &tokens[index];
        if token == "--" {
            index += 1;
            break;
        }
        if token.starts_with('-') && token.len() > 1 {
            if wrapper.value_flags.contains(&token.as_str()) {
                index += 2;
            } else {
                index += 1;
            }
            continue;
        }
        if is_assignment(token) {
            index += 1;
            continue;
        }
        if skips > 0 {
            skips -= 1;
            index += 1;
            continue;
        }
        break;
    }
    if index >= tokens.len() {
        return None;
    }
    Some(tokens[index..].join(" "))
}

/// The command line a wrapper segment will run, or `None` when the segment is
/// not a wrapper, carries no payload, or cannot be tokenised.
pub(crate) fn wrapped_payload(segment: &str) -> Option<String> {
    let tokens = shlex::split(segment.trim())?;
    let first = tokens.first()?;
    let base = super::approval::strip_path(first);
    let payload = if SHELL_INTERPRETERS.contains(&base) {
        shell_payload(&tokens)?
    } else {
        let wrapper = WRAPPERS.iter().find(|w| w.name == base)?;
        wrapper_payload(wrapper, &tokens)?
    };
    let payload = payload.trim().to_string();
    (!payload.is_empty()).then_some(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_bare_name_or_a_system_directory_is_a_trusted_spelling() {
        assert!(program_spelling_is_trusted("cat"));
        assert!(program_spelling_is_trusted("/usr/bin/cat"));
        assert!(program_spelling_is_trusted("/bin/ls"));
        assert!(program_spelling_is_trusted("/opt/homebrew/bin/rg"));
        assert!(!program_spelling_is_trusted("./cat"));
        assert!(!program_spelling_is_trusted("../bin/cat"));
        assert!(!program_spelling_is_trusted("node_modules/.bin/cat"));
        assert!(!program_spelling_is_trusted("/usr/bin/../../tmp/cat"));
        assert!(!program_spelling_is_trusted("/tmp/cat"));
        assert!(!program_spelling_is_trusted(
            "C:\\Windows\\System32\\cmd.exe"
        ));
        assert!(!program_spelling_is_trusted("/usr/bin/"));
        assert!(!program_spelling_is_trusted(""));
    }

    #[test]
    fn a_wrapper_hands_back_the_command_line_it_runs() {
        assert_eq!(
            wrapped_payload("sh -c 'rm -rf /tmp/x'").as_deref(),
            Some("rm -rf /tmp/x")
        );
        assert_eq!(
            wrapped_payload("bash -lc \"git push --force\"").as_deref(),
            Some("git push --force")
        );
        assert_eq!(
            wrapped_payload("env FOO=1 BAR=2 rm -rf build").as_deref(),
            Some("rm -rf build")
        );
        assert_eq!(
            wrapped_payload("sudo -u root systemctl stop nginx").as_deref(),
            Some("systemctl stop nginx")
        );
        assert_eq!(
            wrapped_payload("timeout 5s killall node").as_deref(),
            Some("killall node")
        );
        assert_eq!(
            wrapped_payload("nice -n 10 mkfs.ext4 /dev/sda1").as_deref(),
            Some("mkfs.ext4 /dev/sda1")
        );
        assert_eq!(
            wrapped_payload("/usr/bin/env rm -rf build").as_deref(),
            Some("rm -rf build")
        );
    }

    #[test]
    fn a_segment_with_no_payload_to_look_through_is_left_alone() {
        assert_eq!(wrapped_payload("ls -la"), None);
        assert_eq!(wrapped_payload("env"), None);
        assert_eq!(wrapped_payload("sh"), None);
        assert_eq!(wrapped_payload("sh script.sh"), None);
        assert_eq!(wrapped_payload("sudo -u root"), None);
        assert_eq!(wrapped_payload("sh -c 'unterminated"), None);
        assert_eq!(wrapped_payload("sh -c ''"), None);
    }
}
