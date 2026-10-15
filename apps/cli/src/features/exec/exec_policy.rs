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
    #[cfg(test)]
    if let Some(rules_dir) = crate::native_process_test_fixture::rules_dir() {
        return load_policy_from_dir(&rules_dir);
    }
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
        #[cfg(test)]
        crate::native_process_test_fixture::check_read(
            crate::native_process_test_fixture::Input::ExecRules,
            &path,
        );
        let contents = std::fs::read_to_string(&path);
        #[cfg(test)]
        crate::native_process_test_fixture::record_read(
            crate::native_process_test_fixture::Input::ExecRules,
            &path,
            contents.is_ok(),
        );
        let contents =
            contents.with_context(|| format!("failed to read exec policy {}", path.display()))?;
        let parsed = if uses_legacy_line_format(&contents) {
            parse_legacy_rules(&mut legacy_overlay, &path, &contents)
        } else {
            parser
                .parse(&path.display().to_string(), &contents)
                .map_err(anyhow::Error::new)
                .with_context(|| format!("failed to parse exec policy {}", path.display()))
        };
        #[cfg(test)]
        crate::native_process_test_fixture::record_validation(
            crate::native_process_test_fixture::Input::ExecRules,
            &path,
            parsed.is_ok(),
        );
        parsed?;
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

pub(crate) fn can_persist_allow_command(command: &str) -> bool {
    shell_segments(command).is_some_and(
        |segments| matches!(segments.as_slice(), [segment] if segment_argv(segment).is_some()),
    )
}

pub(crate) struct UserApprovedRule {
    pub line: String,
    pub prefix: Vec<String>,
    pub allow: bool,
}

pub(crate) fn user_approved_rules() -> Result<Vec<UserApprovedRule>> {
    let path = user_approved_policy_path()?;
    let contents = match std::fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(error).with_context(|| format!("reading {}", path.display()));
        }
    };
    Ok(contents
        .lines()
        .filter_map(parse_user_approved_rule)
        .collect())
}

fn parse_user_approved_rule(line: &str) -> Option<UserApprovedRule> {
    static RULE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let rule = RULE.get_or_init(|| {
        regex::Regex::new(r#"^prefix_rule\(pattern=(\[.*\]), decision="(allow|forbidden)"\)$"#)
            .expect("user-approved rule pattern")
    });
    let captures = rule.captures(line.trim())?;
    let prefix: Vec<String> = serde_json::from_str(&captures[1]).ok()?;
    (!prefix.is_empty()).then(|| UserApprovedRule {
        line: line.to_string(),
        prefix,
        allow: &captures[2] == "allow",
    })
}

pub(crate) fn remove_user_approved_rule(line: &str) -> Result<bool> {
    use std::io::{Read, Seek, Write};

    let path = user_approved_policy_path()?;
    let mut file = match std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error).with_context(|| format!("opening {}", path.display())),
    };
    file.lock()
        .with_context(|| format!("locking {}", path.display()))?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .with_context(|| format!("reading {}", path.display()))?;
    let kept: Vec<&str> = contents.lines().filter(|kept| *kept != line).collect();
    if kept.len() == contents.lines().count() {
        return Ok(false);
    }
    let mut rewritten = kept.join("\n");
    if !rewritten.is_empty() {
        rewritten.push('\n');
    }
    file.set_len(0)
        .and_then(|()| file.rewind())
        .and_then(|()| file.write_all(rewritten.as_bytes()))
        .with_context(|| format!("rewriting {}", path.display()))?;
    Ok(true)
}

pub async fn persist_allow_command(command: &str) -> Result<()> {
    let path = user_approved_policy_path()?;
    persist_allow_command_to(path, command).await
}

async fn persist_allow_command_to(path: PathBuf, command: &str) -> Result<()> {
    let argv = single_command_argv(command)?;
    let prefix = proposed_allow_prefix(command).ok_or_else(|| {
        anyhow::anyhow!(
            "{} runs whatever its arguments say, so it can only be approved once or for this session",
            argv[0]
        )
    })?;
    append_allow_prefix(path, prefix).await
}

/// Persist an Always Allow rule for `prefix`, the leading words of `command`
/// a client chose as the shape to allow, such as `npm test` for
/// `npm test -- --watch`. The prefix must be exactly how the command begins,
/// so approving one command can never allow a different one.
pub async fn persist_allow_prefix(command: &str, prefix: &[String]) -> Result<()> {
    let path = user_approved_policy_path()?;
    persist_allow_prefix_to(path, command, prefix).await
}

async fn persist_allow_prefix_to(path: PathBuf, command: &str, prefix: &[String]) -> Result<()> {
    let argv = single_command_argv(command)?;
    if runs_arbitrary_code(&argv) {
        anyhow::bail!(
            "{} runs whatever its arguments say, so it can only be approved once",
            argv[0]
        );
    }
    if prefix.is_empty() || !argv.starts_with(prefix) {
        anyhow::bail!(
            "the Always Allow prefix must be the words this command starts with: {}",
            argv.join(" ")
        );
    }
    append_allow_prefix(path, prefix.to_vec()).await
}

/// The Always Allow rule the host offers for `command`: its whole argv, the
/// shape Codex proposes as an execpolicy amendment. `None` when the command
/// can only be approved once, because it is not one plain invocation or its
/// program runs code its arguments name.
pub fn proposed_allow_prefix(command: &str) -> Option<Vec<String>> {
    let argv = single_command_argv(command).ok()?;
    (!runs_arbitrary_code(&argv)).then_some(argv)
}

/// Shells, interpreters and wrappers: a rule for any prefix of their argv
/// short of the whole command would allow every program they can be told to
/// run.
const ARBITRARY_CODE_PROGRAMS: &[&str] = &[
    "sh",
    "bash",
    "zsh",
    "fish",
    "dash",
    "ksh",
    "csh",
    "tcsh",
    "ash",
    "busybox",
    "pwsh",
    "powershell",
    "cmd",
    "python",
    "python2",
    "python3",
    "pypy",
    "pypy3",
    "node",
    "nodejs",
    "deno",
    "bun",
    "bunx",
    "ruby",
    "irb",
    "perl",
    "php",
    "lua",
    "osascript",
    "npx",
    "pnpx",
    "uvx",
    "env",
    "sudo",
    "doas",
    "su",
    "xargs",
    "time",
    "nice",
    "nohup",
    "timeout",
    "exec",
    "command",
    "eval",
    "setsid",
    "stdbuf",
    "chroot",
    "watch",
];

/// Package managers whose named subcommand fetches and runs a package,
/// wherever their leading options put it.
const ARBITRARY_CODE_SUBCOMMANDS: &[(&str, &str)] = &[
    ("pnpm", "dlx"),
    ("pnpm", "exec"),
    ("npm", "exec"),
    ("npm", "x"),
    ("npm", "explore"),
    ("yarn", "dlx"),
    ("yarn", "exec"),
    ("uv", "run"),
];

/// What makes a program run a command that a prefix rule for it never named.
enum CodeRunningArguments {
    /// Any of these options; see [`has_option`].
    Options(&'static [&'static str]),
    /// A check that needs more than an option list.
    Check(fn(&[String]) -> bool),
    /// Every invocation: what it runs is its arguments.
    Always,
}

/// Programs that are safe to allow by prefix until a later argument tells
/// them to run a command. A rule allowing `find . -name x` would otherwise
/// allow `find . -name x -exec rm {} ;`.
const CODE_RUNNING_ARGUMENTS: &[(&str, CodeRunningArguments)] = &[
    (
        "find",
        CodeRunningArguments::Options(&[
            "-exec", "-execdir", "-ok", "-okdir", "-delete", "-fls", "-fprint", "-fprint0",
            "-fprintf",
        ]),
    ),
    (
        "rg",
        CodeRunningArguments::Options(&["--pre", "--pre-glob"]),
    ),
    (
        "tar",
        CodeRunningArguments::Options(&[
            "-I",
            "-F",
            "--to-command",
            "--use-compress-program",
            "--checkpoint-action",
            "--info-script",
            "--new-volume-script",
        ]),
    ),
    ("git", CodeRunningArguments::Check(git_runs_code)),
    (
        "rsync",
        CodeRunningArguments::Options(&["-e", "--rsh", "--rsync-path"]),
    ),
    (
        "zip",
        CodeRunningArguments::Options(&["-TT", "--unzip-command"]),
    ),
    ("sed", CodeRunningArguments::Check(sed_runs_code)),
    ("awk", CodeRunningArguments::Always),
    ("gawk", CodeRunningArguments::Always),
    ("mawk", CodeRunningArguments::Always),
    ("nawk", CodeRunningArguments::Always),
    ("xargs", CodeRunningArguments::Always),
    ("env", CodeRunningArguments::Always),
];

fn program_name(first: &str) -> &str {
    let program = first.rsplit(['/', '\\']).next().unwrap_or(first);
    program.strip_suffix(".exe").unwrap_or(program)
}

/// An option among `args` before any `--`. A two-character option such as
/// `-I` also counts inside a cluster (`-xIf`) or with its value attached; a
/// longer one counts alone or as `--name=value`.
fn has_option(args: &[String], options: &[&str]) -> bool {
    args.iter().take_while(|arg| *arg != "--").any(|arg| {
        options.iter().any(|option| match option.strip_prefix('-') {
            Some(letter) if letter.len() == 1 => {
                arg.len() > 1
                    && arg.starts_with('-')
                    && !arg.starts_with("--")
                    && arg[1..].contains(letter)
            }
            _ => {
                arg == option
                    || arg
                        .strip_prefix(option)
                        .is_some_and(|value| value.starts_with('='))
            }
        })
    })
}

/// Git's own options that take their value as the next argument.
const GIT_GLOBAL_OPTIONS_WITH_VALUE: &[&str] = &[
    "-c",
    "-C",
    "--config-env",
    "--git-dir",
    "--work-tree",
    "--namespace",
    "--super-prefix",
];

/// Git's own options that point it at other configuration, helpers or
/// repositories, wherever they sit before the subcommand.
const GIT_CODE_RUNNING_GLOBAL_OPTIONS: &[&str] = &[
    "-c",
    "-C",
    "--config-env",
    "--exec-path",
    "--git-dir",
    "--work-tree",
];

/// The subcommands git builds in that run nothing their arguments or the
/// configuration do not already name to a rule. Anything else may be an
/// alias, which can be `!` and a shell command, or a `git-<name>` program on
/// the path, so it is never allowed by prefix.
const GIT_BUILTIN_SUBCOMMANDS: &[&str] = &[
    "add",
    "annotate",
    "apply",
    "archive",
    "bisect",
    "blame",
    "branch",
    "bundle",
    "cat-file",
    "check-attr",
    "check-ignore",
    "check-mailmap",
    "check-ref-format",
    "checkout",
    "checkout-index",
    "cherry",
    "cherry-pick",
    "clean",
    "clone",
    "commit",
    "commit-graph",
    "commit-tree",
    "config",
    "count-objects",
    "describe",
    "diff",
    "diff-files",
    "diff-index",
    "diff-tree",
    "fetch",
    "for-each-ref",
    "format-patch",
    "fsck",
    "gc",
    "grep",
    "hash-object",
    "help",
    "init",
    "log",
    "ls-files",
    "ls-remote",
    "ls-tree",
    "maintenance",
    "merge",
    "merge-base",
    "mv",
    "name-rev",
    "notes",
    "prune",
    "pull",
    "push",
    "range-diff",
    "rebase",
    "reflog",
    "remote",
    "repack",
    "replace",
    "reset",
    "restore",
    "rev-list",
    "rev-parse",
    "revert",
    "rm",
    "shortlog",
    "show",
    "show-branch",
    "show-ref",
    "sparse-checkout",
    "stash",
    "status",
    "submodule",
    "switch",
    "symbolic-ref",
    "tag",
    "update-index",
    "update-ref",
    "var",
    "verify-commit",
    "verify-tag",
    "version",
    "whatchanged",
    "worktree",
    "write-tree",
];

/// Git runs a command its arguments name through its own options before the
/// subcommand, an alias or external subcommand, a subcommand that runs a tool
/// or a script, or a few subcommand options that name a program.
fn git_runs_code(args: &[String]) -> bool {
    let mut index = 0;
    while let Some(arg) = args.get(index).filter(|arg| arg.starts_with('-')) {
        let name = arg.split('=').next().unwrap_or(arg);
        if GIT_CODE_RUNNING_GLOBAL_OPTIONS.contains(&name)
            || (arg.starts_with("-c") && !arg.starts_with("--"))
        {
            return true;
        }
        index += if GIT_GLOBAL_OPTIONS_WITH_VALUE.contains(&arg.as_str()) {
            2
        } else {
            1
        };
    }
    let Some((subcommand, options)) = args.get(index..).and_then(<[String]>::split_first) else {
        return false;
    };
    let first_operand = options.iter().find(|arg| !arg.starts_with('-'));
    match subcommand.as_str() {
        "difftool" | "mergetool" => return true,
        "submodule" if first_operand.is_some_and(|operand| operand == "foreach") => return true,
        "bisect" if first_operand.is_some_and(|operand| operand == "run") => return true,
        "filter-branch" => return true,
        "rebase" if has_option(options, &["-x"]) => return true,
        "clone" if has_option(options, &["-u"]) => return true,
        "grep" if has_option(options, &["-O", "--open-files-in-pager"]) => return true,
        name if !GIT_BUILTIN_SUBCOMMANDS.contains(&name) => return true,
        _ => {}
    }
    has_option(
        options,
        &["--upload-pack", "--receive-pack", "--exec", "--extcmd"],
    )
}

/// `sed` runs a command for its `e` command or the `e` flag of `s`, and
/// writes files for `w`, `W` and the `w` flag; `-i` rewrites its inputs. A
/// script read from a file is not seen, and one this cannot parse counts.
fn sed_runs_code(args: &[String]) -> bool {
    if has_option(args, &["-i", "-f", "--in-place", "--file"]) {
        return true;
    }
    let mut scripts: Vec<&str> = Vec::new();
    let mut first_positional = None;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if arg == "--" {
            first_positional = first_positional.or(args.next());
            break;
        }
        if let Some(script) = arg.strip_prefix("--expression=") {
            scripts.push(script);
        } else if arg == "--expression" {
            scripts.extend(args.next().map(String::as_str));
        } else if let Some(cluster) = arg
            .strip_prefix('-')
            .filter(|cluster| !cluster.is_empty() && !cluster.starts_with('-'))
        {
            if let Some((letter, value)) = cluster
                .char_indices()
                .find(|(_, letter)| matches!(*letter, 'e' | 'l'))
                .map(|(at, letter)| (letter, &cluster[at + 1..]))
            {
                let value = if value.is_empty() {
                    args.next().map(String::as_str)
                } else {
                    Some(value)
                };
                if letter == 'e' {
                    scripts.extend(value);
                }
            }
        } else if !arg.starts_with("--") && first_positional.is_none() {
            first_positional = Some(arg);
        }
    }
    if scripts.is_empty() {
        scripts.extend(first_positional.map(String::as_str));
    }
    scripts.into_iter().any(sed_script_runs_code)
}

/// Walk a `sed` script command by command, skipping addresses, regexes and
/// the text of `s`, `y`, `a`, `i` and `c`, so a letter inside a pattern is
/// never read as a command.
fn sed_script_runs_code(script: &str) -> bool {
    let chars: Vec<char> = script.chars().collect();
    let mut index = 0;
    let skip_delimited = |index: &mut usize, delimiter: char| -> bool {
        while *index < chars.len() {
            match chars[*index] {
                '\\' => *index += 2,
                character if character == delimiter => {
                    *index += 1;
                    return true;
                }
                _ => *index += 1,
            }
        }
        false
    };
    let skip_to_end_of_command = |index: &mut usize| {
        while *index < chars.len() && !matches!(chars[*index], ';' | '\n' | '}') {
            *index += 1;
        }
    };
    while index < chars.len() {
        let character = chars[index];
        index += 1;
        match character {
            ' ' | '\t' | '\n' | ';' | '{' | '}' | '!' | ',' | '$' | '~' | '+' | '0'..='9' => {}
            '/' => {
                if !skip_delimited(&mut index, '/') {
                    return true;
                }
            }
            '\\' => {
                let Some(&delimiter) = chars.get(index) else {
                    return true;
                };
                index += 1;
                if !skip_delimited(&mut index, delimiter) {
                    return true;
                }
            }
            'e' | 'w' | 'W' => return true,
            's' | 'y' => {
                let Some(&delimiter) = chars.get(index) else {
                    return true;
                };
                index += 1;
                if !skip_delimited(&mut index, delimiter) || !skip_delimited(&mut index, delimiter)
                {
                    return true;
                }
                let flags_start = index;
                skip_to_end_of_command(&mut index);
                if character == 's'
                    && chars[flags_start..index]
                        .iter()
                        .any(|flag| matches!(*flag, 'e' | 'w'))
                {
                    return true;
                }
            }
            'a' | 'i' | 'c' => {
                while index < chars.len() && chars[index] != '\n' {
                    index += 1;
                }
            }
            ':' | 'b' | 't' | 'T' | 'r' | 'R' | 'q' | 'Q' | 'l' | 'L' => {
                skip_to_end_of_command(&mut index)
            }
            'p' | 'P' | 'd' | 'D' | 'n' | 'N' | 'g' | 'G' | 'h' | 'H' | 'x' | '=' | 'z' | 'F' => {}
            _ => return true,
        }
    }
    false
}

/// `argv` names a program that runs code its later arguments choose: a
/// package manager's runner subcommand, wherever leading options put it, or
/// an option [`CODE_RUNNING_ARGUMENTS`] lists for its program.
fn carries_code_running_argument(argv: &[String]) -> bool {
    let Some((first, args)) = argv.split_first() else {
        return false;
    };
    let program = program_name(first);
    let runner = args
        .iter()
        .take_while(|arg| *arg != "--")
        .filter(|arg| !arg.starts_with('-'))
        .any(|arg| {
            ARBITRARY_CODE_SUBCOMMANDS
                .iter()
                .any(|(manager, runs)| program == *manager && arg == runs)
        });
    runner
        || CODE_RUNNING_ARGUMENTS.iter().any(|(name, risk)| {
            program == *name
                && match risk {
                    CodeRunningArguments::Options(options) => has_option(args, options),
                    CodeRunningArguments::Check(runs_code) => runs_code(args),
                    CodeRunningArguments::Always => true,
                }
        })
}

fn runs_arbitrary_code(argv: &[String]) -> bool {
    let Some(first) = argv.first() else {
        return true;
    };
    if first.contains('=') {
        return true;
    }
    let program = program_name(first);
    let unversioned = program.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.');
    ARBITRARY_CODE_PROGRAMS.contains(&program)
        || ARBITRARY_CODE_PROGRAMS.contains(&unversioned)
        || carries_code_running_argument(argv)
}

/// The argv of a command that is one program invocation, refusing anything
/// with shell operators, since a rule for its first part would not cover the
/// rest. Leading variable assignments stay in it, so a command that sets one
/// is never persisted as a rule for the program alone.
fn single_command_argv(command: &str) -> Result<Vec<String>> {
    let segments = shell_segments(command)
        .ok_or_else(|| anyhow::anyhow!("cannot persist an unparseable shell command"))?;
    let [segment] = segments.as_slice() else {
        anyhow::bail!(
            "cannot persist an Always Allow rule for a command with shell operators; approve each command separately"
        );
    };
    shlex::split(segment)
        .filter(|tokens| !tokens.is_empty())
        .ok_or_else(|| anyhow::anyhow!("cannot persist an empty or invalid shell command"))
}

async fn append_allow_prefix(path: PathBuf, prefix: Vec<String>) -> Result<()> {
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
    let mut tokens = shlex::split(segment)?;
    let assignments = tokens
        .iter()
        .take_while(|token| crate::safety::argv::is_env_assignment(token))
        .count();
    tokens.drain(..assignments);
    (!tokens.is_empty()).then_some(tokens)
}

/// How deep a wrapper chain (`sh -c 'sh -c ...'`) is followed.
const MAX_WRAPPER_DEPTH: usize = 8;

/// `sh -c "rm -rf /"` is one argv to the policy and a different command to the
/// machine. Every command line a wrapper carries is checked alongside it.
fn with_wrapped_commands(segments: &[String], depth: usize) -> (Vec<String>, bool) {
    let mut expanded = Vec::with_capacity(segments.len());
    let mut complete = true;
    for segment in segments {
        expanded.push(segment.clone());
        let payload = match crate::safety::program::wrapped_payload_checked(segment) {
            Ok(Some(payload)) => payload,
            Ok(None) => continue,
            Err(()) => {
                complete = false;
                continue;
            }
        };
        if depth >= MAX_WRAPPER_DEPTH {
            complete = false;
            continue;
        }
        match shell_segments(&payload) {
            Some(inner) => {
                let (commands, parsed) = with_wrapped_commands(&inner, depth + 1);
                expanded.extend(commands);
                complete &= parsed;
            }
            None => {
                expanded.push(payload);
                complete = false;
            }
        }
    }
    (expanded, complete)
}

pub(crate) fn command_argvs(command: &str) -> Option<Vec<Vec<String>>> {
    let segments = shell_segments(command)?;
    let (segments, complete) = with_wrapped_commands(&segments, 0);
    if !complete {
        return None;
    }
    segments
        .iter()
        .map(|segment| segment_argv(segment))
        .collect()
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
    let (segments, complete) = with_wrapped_commands(&segments, 0);

    let fallback = |_: &[String]| heuristic_decision(command);
    let mut decision = if complete {
        Decision::Allow
    } else {
        Decision::Prompt
    };
    let mut matched_rule = !complete;
    let mut every_segment_matched_rule = complete;

    for segment in &segments {
        let Some(argv) = segment_argv(segment) else {
            decision = decision.max(Decision::Prompt);
            every_segment_matched_rule = false;
            continue;
        };
        let evaluation = policy.check(&argv, &fallback);
        // A prefix rule allows whatever follows the prefix, so one naming a
        // safe shape never waives the prompt for an argument that runs code.
        let allowed_past_its_rule = evaluation.is_match()
            && evaluation.decision == Decision::Allow
            && carries_code_running_argument(&argv);
        decision = decision.max(if allowed_past_its_rule {
            Decision::Prompt
        } else {
            evaluation.decision
        });
        if evaluation.is_match() {
            matched_rule = true;
        }
        if !evaluation.is_match() || allowed_past_its_rule {
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
    fn a_catastrophic_command_stays_forbidden_when_a_wrapper_runs_it() {
        let policy = default_policy();
        for command in [
            "sh -c 'rm -rf /'",
            "bash -c \"rm -rf /\"",
            "env PATH=/bin rm -rf /",
            "sudo rm -rf /",
            "nice -n 10 rm -rf /",
            "timeout 30 rm -rf /",
            "nohup dd if=/dev/zero of=/dev/sda",
            "sh -c 'echo ok && rm -rf /'",
        ] {
            assert_eq!(
                evaluate(&policy, command),
                Decision::Forbidden,
                "`{command}` must stay forbidden"
            );
        }
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

    #[tokio::test]
    async fn the_bash_tool_never_saves_an_always_allow_rule_for_an_interpreter() {
        let temp = tempdir().expect("tempdir");
        let policy_path = temp.path().join("user-approved.rules");
        for command in [
            "python3 -c 'print(1)'",
            "bash -c ls",
            "npx cowsay hi",
            "sudo ls",
        ] {
            let error = persist_allow_command_to(policy_path.clone(), command)
                .await
                .expect_err(command);
            assert!(
                error.to_string().contains("approved once"),
                "{command}: {error}"
            );
        }
        assert!(!policy_path.exists());

        persist_allow_command_to(policy_path.clone(), "npm test")
            .await
            .expect("a plain command is saved");
        let policy = load_policy_from_dir(temp.path()).expect("load policy");
        assert_eq!(evaluate(&policy, "npm test"), Decision::Allow);
    }

    #[tokio::test]
    async fn a_chosen_prefix_allows_that_command_shape_and_nothing_else() {
        let temp = tempdir().expect("tempdir");
        let policy_path = temp.path().join("user-approved.rules");
        persist_allow_prefix_to(
            policy_path.clone(),
            "npm test -- --watch",
            &["npm".to_string(), "test".to_string()],
        )
        .await
        .expect("persist prefix");

        let policy = load_policy_from_dir(temp.path()).expect("load policy");
        assert_eq!(evaluate(&policy, "npm test -- --coverage"), Decision::Allow);
        assert_ne!(evaluate(&policy, "npm publish"), Decision::Allow);
    }

    #[tokio::test]
    async fn a_prefix_the_command_does_not_start_with_is_refused() {
        let temp = tempdir().expect("tempdir");
        let policy_path = temp.path().join("user-approved.rules");
        for prefix in [
            vec![],
            vec!["rm".to_string()],
            vec!["npm".to_string(), "test".to_string(), "--watch".to_string()],
        ] {
            assert!(
                persist_allow_prefix_to(policy_path.clone(), "npm test", &prefix)
                    .await
                    .is_err(),
                "{prefix:?}"
            );
        }
        assert!(!policy_path.exists());
    }

    #[test]
    fn the_host_offers_the_whole_command_as_the_rule() {
        assert_eq!(
            proposed_allow_prefix("npm test -- --watch"),
            Some(vec![
                "npm".to_string(),
                "test".to_string(),
                "--".to_string(),
                "--watch".to_string(),
            ])
        );
        assert_eq!(proposed_allow_prefix("git status && rm -rf ./src"), None);
    }

    #[test]
    fn shells_interpreters_and_wrappers_are_offered_approve_once_only() {
        for command in [
            "python3 -c 'print(1)'",
            "python3.12 script.py",
            "/usr/bin/python3 script.py",
            "bash -c 'ls'",
            "node index.js",
            "deno run main.ts",
            "bun run dev",
            "ruby -e 'puts 1'",
            "perl -e 'print 1'",
            "php -r 'echo 1;'",
            "npx cowsay hi",
            "pnpm dlx cowsay hi",
            "env FOO=1 ls",
            "FOO=1 ls",
            "sudo ls",
            "xargs rm",
            "time ls",
            "nice ls",
            "timeout 5 ls",
            "exec ls",
        ] {
            assert_eq!(proposed_allow_prefix(command), None, "{command}");
        }
    }

    #[tokio::test]
    async fn an_interpreter_prefix_is_never_persisted() {
        let temp = tempdir().expect("tempdir");
        let policy_path = temp.path().join("user-approved.rules");
        let error = persist_allow_prefix_to(
            policy_path.clone(),
            "python3 -c 'print(1)'",
            &["python3".to_string()],
        )
        .await
        .expect_err("an interpreter rule must be refused");
        assert!(error.to_string().contains("approved once"));
        assert!(!policy_path.exists());
    }

    fn policy_allowing(rules: &[&[&str]]) -> Policy {
        let mut policy = default_policy();
        for rule in rules {
            let rule: Vec<String> = rule.iter().map(|word| word.to_string()).collect();
            policy
                .add_prefix_rule(&rule, Decision::Allow)
                .expect("allow rule");
        }
        policy
    }

    #[test]
    fn a_rule_for_a_safe_shape_does_not_allow_a_trailing_argument_that_runs_code() {
        let policy = policy_allowing(&[
            &["find", ".", "-name", "x"],
            &["rg", "foo"],
            &["tar", "-xf", "a.tar"],
            &["git", "fetch"],
            &["git", "submodule"],
            &["git", "bisect"],
            &["git", "difftool"],
            &["sed", "-n"],
            &["npm", "--yes"],
        ]);
        for allowed in [
            "find . -name x -type f",
            "rg foo src",
            "tar -xf a.tar -C out",
            "git fetch origin",
            "git submodule status",
            "git bisect good",
            "sed -n 1,5p notes.txt",
        ] {
            let evaluation = evaluate_command(&policy, allowed);
            assert_eq!(evaluation.decision, Decision::Allow, "{allowed}");
            assert!(evaluation.every_segment_matched_rule, "{allowed}");
        }
        for command in [
            "find . -name x -exec rm {} \\;",
            "find . -name x -delete",
            "rg foo --pre ./planted.sh",
            "rg foo --pre=./planted.sh",
            "tar -xf a.tar --to-command=sh",
            "tar -xf a.tar -I ./planted.sh",
            "tar -xf a.tar --checkpoint-action=exec=sh",
            "git fetch --upload-pack=./planted.sh origin",
            "git submodule foreach ./planted.sh",
            "git bisect run ./planted.sh",
            "git difftool -x ./planted.sh HEAD",
            "sed -n s/x/y/e notes.txt",
            "sed -n -i s/x/y/ notes.txt",
            "npm --yes exec cowsay",
        ] {
            let evaluation = evaluate_command(&policy, command);
            assert_eq!(evaluation.decision, Decision::Prompt, "{command}");
            assert!(evaluation.matched_rule, "{command}");
            assert!(!evaluation.every_segment_matched_rule, "{command}");
        }
    }

    #[test]
    fn a_runner_subcommand_behind_leading_options_is_offered_approve_once_only() {
        for command in [
            "npm --yes exec cowsay",
            "npm x cowsay",
            "pnpm --silent dlx cowsay",
            "yarn exec cowsay",
            "find . -name x -delete",
            "rg --pre cat foo",
            "tar -xIzstd -f a.tar",
            "git -c core.pager=sh log",
            "git -C ../other status",
            "git rebase -x ./planted.sh main",
            "git rebase --exec=./planted.sh main",
            "git submodule foreach ./planted.sh",
            "git submodule --quiet foreach ./planted.sh",
            "git bisect run ./planted.sh",
            "git difftool -x ./planted.sh HEAD",
            "git difftool --extcmd=./planted.sh HEAD",
            "git difftool HEAD",
            "git mergetool",
            "git filter-branch --tree-filter ./planted.sh HEAD",
            "git filter-branch --msg-filter=./planted.sh",
            "git clone -u ./planted.sh https://example.invalid/repo.git",
            "git clone --upload-pack=./planted.sh https://example.invalid/repo.git",
            "git grep -O./planted.sh needle",
            "git grep -O needle",
            "git grep --open-files-in-pager=./planted.sh needle",
            "git --no-pager -c core.pager=sh log",
            "git --no-pager --config-env=core.pager=X log",
            "git --namespace n -c alias.x=!sh x",
            "git -ccore.pager=sh log",
            "git planted-alias",
            "git --no-pager planted-alias HEAD",
            "sed -i s/a/b/ notes.txt",
            "sed -e 1e\\ date notes.txt",
            "awk '{print $1}' notes.txt",
        ] {
            assert_eq!(proposed_allow_prefix(command), None, "{command}");
        }
        for command in [
            "npm test -- exec",
            "git switch -c feature",
            "git diff -C",
            "git cherry-pick -x abc123",
            "git grep -n needle",
            "git clone --depth 1 https://example.invalid/repo.git",
            "git submodule status",
            "git bisect good",
            "git --no-pager log --oneline",
            "git status",
            "sed -n 's/hello/world/p' notes.txt",
            "find . -name '*.rs'",
        ] {
            assert!(proposed_allow_prefix(command).is_some(), "{command}");
        }
    }

    #[test]
    fn a_sed_script_runs_code_only_through_its_e_and_w_commands_and_flags() {
        for script in [
            "1,5p",
            "s/hello/world/g",
            "/where/d",
            "y/abc/xyz/",
            "$!N;P;D",
        ] {
            assert!(!sed_script_runs_code(script), "{script}");
        }
        for script in [
            "1e date",
            "s/a/b/e",
            "s/a/b/w out.txt",
            "w out.txt",
            "/x/W out.txt",
            "s/a;b/c/e",
            "s/unterminated",
        ] {
            assert!(sed_script_runs_code(script), "{script}");
        }
    }
}
