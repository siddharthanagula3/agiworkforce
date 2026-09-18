//! Argv view of a command string, for the executions that do not need a shell.
//!
//! Running `sh -c <string>` hands the whole line to a parser that treats
//! separators, redirection, expansion and globbing as syntax, so every argument
//! the model produced is a place a second command can be smuggled in. Most
//! commands need none of that. When a string is a plain program and its
//! operands, [`parse_simple_command`] returns them as argv and the caller execs
//! the program directly; anything that would behave differently without a shell
//! returns `None` and keeps the `sh -c` path.
//!
//! The parser is deliberately refusing: it recognises quoting only, and any
//! character a shell would act on outside quotes disqualifies the string. A
//! false `None` costs nothing but the old path; a false `Some` would change
//! what the command means, so the metacharacter set is closed, not open.

/// Characters a POSIX shell acts on outside quotes. `\` is included because
/// escaping is shell syntax; `~`, `*`, `?` and `[` because the shell expands
/// them before the program ever sees the word.
const SHELL_METACHARACTERS: &[char] = &[
    '|', '&', ';', '<', '>', '(', ')', '$', '`', '\\', '"', '\'', '*', '?', '[', ']', '{', '}',
    '~', '!', '#', '\n', '\r', '\t',
];

/// Names the shell answers itself, or answers differently from the binary of
/// the same name. `cd` and `export` have no binary to exec at all; `echo -e`
/// and `printf -v` behave one way as a builtin and another as
/// `/bin/echo`/`/usr/bin/printf`. Sending any of these to argv would change
/// what the command does, which is the one thing this path may not do.
const SHELL_BUILTINS: &[&str] = &[
    ":",
    ".",
    "[",
    "alias",
    "bg",
    "bind",
    "break",
    "builtin",
    "caller",
    "cd",
    "command",
    "continue",
    "declare",
    "dirs",
    "disown",
    "echo",
    "enable",
    "eval",
    "exec",
    "exit",
    "export",
    "false",
    "fc",
    "fg",
    "getopts",
    "hash",
    "help",
    "history",
    "jobs",
    "kill",
    "let",
    "local",
    "logout",
    "mapfile",
    "popd",
    "printf",
    "pushd",
    "pwd",
    "read",
    "readarray",
    "readonly",
    "return",
    "set",
    "shift",
    "shopt",
    "source",
    "suspend",
    "test",
    "time",
    "times",
    "trap",
    "true",
    "type",
    "typeset",
    "ulimit",
    "umask",
    "unalias",
    "unset",
    "wait",
];

/// Split a command string into `(program, args)` when a shell would add
/// nothing, otherwise `None`.
pub(crate) fn parse_simple_command(command: &str) -> Option<(String, Vec<String>)> {
    let words = tokenize(command)?;
    let (program, args) = words.split_first()?;
    if program.is_empty() || is_env_assignment(program) {
        return None;
    }
    if SHELL_BUILTINS.contains(&super::approval::strip_path(program)) {
        return None;
    }
    Some((program.clone(), args.to_vec()))
}

/// A leading `NAME=value` word is an environment assignment the shell applies
/// to the command that follows, not a program.
fn is_env_assignment(word: &str) -> bool {
    match word.split_once('=') {
        None => false,
        Some((name, _)) => {
            !name.is_empty()
                && !name.starts_with(|c: char| c.is_ascii_digit())
                && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
        }
    }
}

fn tokenize(command: &str) -> Option<Vec<String>> {
    let mut words: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut started = false;
    let mut chars = command.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            ' ' => {
                if started {
                    words.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            '\'' => {
                started = true;
                loop {
                    match chars.next() {
                        Some('\'') => break,
                        // An unterminated quote is a syntax error, not a word.
                        None => return None,
                        Some(c) => current.push(c),
                    }
                }
            }
            '"' => {
                started = true;
                loop {
                    match chars.next() {
                        Some('"') => break,
                        None => return None,
                        // Inside double quotes a shell still expands these.
                        Some('$') | Some('`') | Some('\\') => return None,
                        Some(c) => current.push(c),
                    }
                }
            }
            c if SHELL_METACHARACTERS.contains(&c) => return None,
            c => {
                started = true;
                current.push(c);
            }
        }
    }

    if started {
        words.push(current);
    }
    if words.is_empty() {
        return None;
    }
    Some(words)
}

#[cfg(test)]
mod tests {
    use super::parse_simple_command;

    fn argv(command: &str) -> Option<(String, Vec<String>)> {
        parse_simple_command(command)
    }

    #[test]
    fn a_plain_command_becomes_argv() {
        assert_eq!(
            argv("git status"),
            Some(("git".to_string(), vec!["status".to_string()]))
        );
        assert_eq!(
            argv("  cargo   test  --lib  "),
            Some((
                "cargo".to_string(),
                vec!["test".to_string(), "--lib".to_string()]
            ))
        );
    }

    #[test]
    fn quoted_operands_keep_their_spaces_and_metacharacters_as_data() {
        assert_eq!(
            argv("grep 'foo | bar' src/main.rs"),
            Some((
                "grep".to_string(),
                vec!["foo | bar".to_string(), "src/main.rs".to_string()]
            ))
        );
        assert_eq!(
            argv(r#"basename "a; rm -rf /""#),
            Some(("basename".to_string(), vec!["a; rm -rf /".to_string()]))
        );
    }

    #[test]
    fn a_shell_builtin_keeps_the_shell_that_implements_it() {
        // `cd` has no binary to exec, and `echo -e` means one thing to the
        // builtin and another to /bin/echo.
        for command in [
            "cd src",
            "echo -e hello",
            "/bin/echo hi",
            "export PATH=/usr/bin",
            "source ./env.sh",
            "printf -v out %s x",
            "ulimit -n",
            ": noop",
        ] {
            assert_eq!(argv(command), None, "builtin must stay on sh: {command:?}");
        }
    }

    #[test]
    fn anything_a_shell_would_act_on_stays_on_the_shell_path() {
        for command in [
            "ls | wc -l",
            "make && ./run",
            "echo hi; echo bye",
            "cat < input.txt",
            "echo out > file",
            "echo $HOME",
            "echo `id`",
            "ls *.rs",
            "rm file?.txt",
            "ls dir/[ab]*",
            "cd ~/src",
            "echo a\nrm -rf b",
            "(cd x && ls)",
            "printf 'a\\nb'",
            "FOO=bar ./script",
            "echo 'unterminated",
            "",
            "   ",
        ] {
            assert_eq!(argv(command), None, "should not be argv: {command:?}");
        }
    }

    #[test]
    fn a_double_quoted_expansion_is_not_treated_as_a_literal() {
        assert_eq!(argv(r#"grep "$SECRET" .env"#), None);
        assert_eq!(argv(r#"grep "a\"b" file"#), None);
        assert_eq!(argv("grep `id` file"), None);
    }
}
