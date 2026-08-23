use std::collections::HashMap;

use crate::safety::command_shape::{command_units, CommandUnit};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolFilterViolation {
    pub rule: String,
    pub reason: String,
}

pub fn spec_matches_tool_for_schema(spec: &str, tool_name: &str) -> bool {
    crate::runtime::tool_catalog::policy_alias_matches_tool(spec_alias(spec), tool_name)
}

pub fn spec_blocks_entire_tool_for_schema(spec: &str, tool_name: &str) -> bool {
    spec_matches_tool_for_schema(spec, tool_name)
        && spec_argument_filter(spec).is_none_or(|pattern| wildcard_matches(pattern, ""))
}

pub fn ensure_tool_call_allowed(
    tool_name: &str,
    args: &HashMap<String, String>,
    allowed_tools: Option<&[String]>,
    disallowed_tools: &[String],
) -> Result<(), ToolFilterViolation> {
    if let Some(rule) = disallowed_tools
        .iter()
        .find(|spec| spec_matches_tool_call(spec, tool_name, args))
    {
        return Err(ToolFilterViolation {
            rule: rule.clone(),
            reason: format!("Tool call `{tool_name}` matches disallowed tool rule `{rule}`."),
        });
    }

    if let Some((rule, unit)) = unprovable_against_command_rules(disallowed_tools, tool_name, args)
    {
        return Err(ToolFilterViolation {
            reason: format!(
                "Tool call `{tool_name}` includes `{unit}`, which cannot be resolved to a program name before the shell runs it, so it cannot be cleared against disallowed tool rule `{rule}`."
            ),
            rule,
        });
    }

    if let Some(allowed_tools) = allowed_tools {
        if !allowed_tools.is_empty() && !specs_allow_tool_call(allowed_tools, tool_name, args) {
            return Err(ToolFilterViolation {
                rule: allowed_tools.join(", "),
                reason: format!("Tool call `{tool_name}` does not match the allowed tool rules."),
            });
        }
    }

    Ok(())
}

/// Deny semantics: the rule bites if it matches the raw call target or **any**
/// command the target would actually run — including the speculative units the
/// shape walk emits where a wrapper's option grammar is only partly known — so
/// neither chaining nor re-spelling the program name (`'rm'`, `(rm ...)`,
/// `env rm ...`, `strace -Z val rm ...`) smuggles a denied program past a rule
/// written for it.
fn spec_matches_tool_call(spec: &str, tool_name: &str, args: &HashMap<String, String>) -> bool {
    if !spec_matches_tool_for_schema(spec, tool_name) {
        return false;
    }

    let Some(pattern) = spec_argument_filter(spec) else {
        return true;
    };

    let Some(target) = call_target_for_pattern(tool_name, args) else {
        return wildcard_matches(pattern, "");
    };

    if wildcard_matches(pattern, target) {
        return true;
    }

    match_units(tool_name, target)
        .iter()
        .any(|unit| unit_matches(pattern, unit))
}

/// A command-scoped deny rule can neither clear nor convict a unit whose program
/// only the shell resolves (`$(which rm)`, `$RM`, `./*.sh`), that runs code the
/// walk cannot read (`sh ./payload.sh`, `echo ... | sh`), or that the walk could
/// not reach, so the call is refused instead of sliding through unmatched.
/// Speculative units are excluded: they are guesses, and a guess must not be able
/// to refuse a call the walk otherwise resolved.
fn unprovable_against_command_rules(
    disallowed_tools: &[String],
    tool_name: &str,
    args: &HashMap<String, String>,
) -> Option<(String, String)> {
    let rule = disallowed_tools.iter().find(|spec| {
        spec_matches_tool_for_schema(spec, tool_name) && spec_argument_filter(spec).is_some()
    })?;
    let target = call_target_for_pattern(tool_name, args)?;
    let unit = match_units(tool_name, target)
        .into_iter()
        .find(|unit| !unit.is_speculative() && !unit.is_resolvable())?;
    Some((rule.clone(), unit.display().to_string()))
}

/// Allow semantics: **every** command the target runs must be covered by some
/// allow rule. Matching only the raw string would let `cargo test && /bin/rm -rf .`
/// through an `Bash(cargo *)` allowlist, because the trailing `*` swallows the
/// whole chain. Speculative units are guesses and take no part in clearing a
/// call, so they can neither grant nor withhold an allowance.
fn specs_allow_tool_call(
    specs: &[String],
    tool_name: &str,
    args: &HashMap<String, String>,
) -> bool {
    let filters: Vec<Option<&str>> = specs
        .iter()
        .filter(|spec| spec_matches_tool_for_schema(spec, tool_name))
        .map(|spec| spec_argument_filter(spec))
        .collect();

    if filters.is_empty() {
        return false;
    }
    if filters.iter().any(Option::is_none) {
        return true;
    }

    let patterns: Vec<&str> = filters.into_iter().flatten().collect();

    let Some(target) = call_target_for_pattern(tool_name, args) else {
        return patterns.iter().any(|pattern| wildcard_matches(pattern, ""));
    };

    if patterns
        .iter()
        .any(|pattern| spans_a_command_chain(pattern) && wildcard_matches(pattern, target))
    {
        return true;
    }

    match_units(tool_name, target)
        .iter()
        .filter(|unit| !unit.is_speculative())
        .all(|unit| patterns.iter().any(|pattern| unit_matches(pattern, unit)))
}

/// A rule the operator wrote against a whole chain (`Bash(cargo test && cargo
/// build)`) is matched against the raw call target. A single-command rule is not,
/// or its trailing `*` would swallow an appended command.
fn spans_a_command_chain(pattern: &str) -> bool {
    crate::safety::split_segments(pattern).len() > 1
}

fn unit_matches(pattern: &str, unit: &CommandUnit) -> bool {
    unit.spellings()
        .iter()
        .any(|value| wildcard_matches(pattern, value))
}

/// Break a call target into the units a rule must be checked against. A command
/// tool resolves to every invocation the shell would actually run — through
/// quoting, grouping, keywords, wrappers and substitutions — so re-spelling the
/// program name cannot dodge a rule written for it.
fn match_units(tool_name: &str, target: &str) -> Vec<CommandUnit> {
    if !matches!(tool_name, "run_command" | "powershell") {
        return vec![CommandUnit::literal(target)];
    }

    let units = command_units(target);
    if units.is_empty() {
        return vec![CommandUnit::literal(target)];
    }
    units
}

fn call_target_for_pattern<'a>(
    tool_name: &str,
    args: &'a HashMap<String, String>,
) -> Option<&'a str> {
    match tool_name {
        "run_command" | "powershell" => args.get("command").map(String::as_str),
        "read_file" | "write_file" => args.get("path").map(String::as_str),
        "read_many_files" => args.get("paths").map(String::as_str),
        "edit_file" | "multiedit" | "apply_patch" => args
            .get("path")
            .or_else(|| args.get("file_path"))
            .or_else(|| args.get("patch"))
            .map(String::as_str),
        "grep_files" | "glob" | "search_files" => args
            .get("pattern")
            .or_else(|| args.get("query"))
            .map(String::as_str),
        "web_fetch" => args.get("url").map(String::as_str),
        "web_search" => args.get("query").map(String::as_str),
        _ => None,
    }
}

fn spec_alias(spec: &str) -> &str {
    spec.split_once('(')
        .map(|(alias, _)| alias)
        .unwrap_or(spec)
        .trim()
}

fn spec_argument_filter(spec: &str) -> Option<&str> {
    let (_, rest) = spec.split_once('(')?;
    Some(rest.strip_suffix(')').unwrap_or(rest).trim())
}

fn wildcard_matches(pattern: &str, value: &str) -> bool {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return value.is_empty();
    }

    let pattern_chars = pattern.chars().collect::<Vec<_>>();
    let value_chars = value.chars().collect::<Vec<_>>();
    let (mut pattern_index, mut value_index) = (0usize, 0usize);
    let mut star_index: Option<usize> = None;
    let mut value_after_star = 0usize;

    while value_index < value_chars.len() {
        if pattern_index < pattern_chars.len()
            && (pattern_chars[pattern_index] == '?'
                || pattern_chars[pattern_index] == value_chars[value_index])
        {
            pattern_index += 1;
            value_index += 1;
        } else if pattern_index < pattern_chars.len() && pattern_chars[pattern_index] == '*' {
            star_index = Some(pattern_index);
            pattern_index += 1;
            value_after_star = value_index;
        } else if let Some(star) = star_index {
            pattern_index = star + 1;
            value_after_star += 1;
            value_index = value_after_star;
        } else {
            return false;
        }
    }

    while pattern_index < pattern_chars.len() && pattern_chars[pattern_index] == '*' {
        pattern_index += 1;
    }

    pattern_index == pattern_chars.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn claude_style_tool_aliases_match_internal_tool_names() {
        assert!(spec_matches_tool_for_schema("Read", "read_file"));
        assert!(spec_matches_tool_for_schema("Bash(cargo *)", "run_command"));
        assert!(spec_matches_tool_for_schema("Edit", "apply_patch"));
        assert!(!spec_matches_tool_for_schema("Write", "read_file"));
    }

    #[test]
    fn pattern_specific_disallow_does_not_remove_whole_schema_tool() {
        assert!(!spec_blocks_entire_tool_for_schema(
            "Bash(rm*)",
            "run_command"
        ));
        assert!(spec_blocks_entire_tool_for_schema("Bash(*)", "run_command"));
        assert!(spec_blocks_entire_tool_for_schema(
            "run_command",
            "run_command"
        ));
    }

    #[test]
    fn call_filter_blocks_disallowed_command_patterns() {
        let err = ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "rm -rf target")]),
            None,
            &["Bash(rm*)".to_string()],
        )
        .expect_err("rm command should be denied");

        assert!(err.reason.contains("disallowed tool rule"));
    }

    #[test]
    fn call_filter_blocks_respelled_disallowed_commands() {
        for command in [
            "/bin/rm -rf ./important-data",
            "/usr/local/bin/rm -rf ./important-data",
            "/bin/../bin/rm -rf ./important-data",
            "RM -rf ./important-data",
            "FOO=bar /bin/rm -rf ./important-data",
            "echo ok && /bin/rm -rf ./important-data",
            "echo ok; rm -rf ./important-data",
            "echo ok | xargs rm -rf",
            "'rm' -rf ./important-data",
            "\"rm\" -rf ./important-data",
            "r\"\"m -rf ./important-data",
            "\\rm -rf ./important-data",
            "(rm -rf ./important-data)",
            "{ rm -rf ./important-data; }",
            "if true; then rm -rf ./important-data; fi",
            "env rm -rf ./important-data",
            "command rm -rf ./important-data",
            "nice -n 5 rm -rf ./important-data",
            "time rm -rf ./important-data",
            "timeout 5 rm -rf ./important-data",
            "sudo -u root rm -rf ./important-data",
            "sh -c 'rm -rf ./important-data'",
            "eval \"rm -rf ./important-data\"",
            "echo $(rm -rf ./important-data)",
            "busybox rm -rf ./important-data",
            "trap 'rm -rf ./important-data' EXIT",
            "find . -type d -exec rm -rf {} \\;",
            // An option carrying a value must not push `-c` out of sight.
            "sh -o errexit -c 'rm -rf ./important-data'",
            "bash -o pipefail -c 'rm -rf ./important-data'",
            "bash --rcfile /tmp/rc -c 'rm -rf ./important-data'",
            "sh -c'rm -rf ./important-data'",
            // Wrappers that hand their operands to another program.
            "su -c 'rm -rf ./important-data'",
            "su root -c 'rm -rf ./important-data'",
            "runuser -u root rm -rf ./important-data",
            "strace rm -rf ./important-data",
            "strace -o /tmp/trace rm -rf ./important-data",
            "ltrace rm -rf ./important-data",
            "taskset -c 0 rm -rf ./important-data",
            "chrt -f 1 rm -rf ./important-data",
            "watch -n1 rm -rf ./important-data",
            "unshare rm -rf ./important-data",
            "nsenter -t 1 -m rm -rf ./important-data",
            "setpriv --reuid 0 rm -rf ./important-data",
            "parallel rm -rf ::: ./important-data",
            "script -q /dev/null -c 'rm -rf ./important-data'",
            "script -q /dev/null rm -rf ./important-data",
            "flock /tmp/lock rm -rf ./important-data",
            "systemd-run --unit=x rm -rf ./important-data",
            "arch -x86_64 rm -rf ./important-data",
            "pkexec rm -rf ./important-data",
            "chroot /tmp/root rm -rf ./important-data",
            // A gap in a wrapper's option table must not clear the payload
            // either: the unknown `-Z val` shifts it out of the parsed position.
            "strace -Z val rm -rf ./important-data",
            "xargs -Z val rm -rf ./important-data",
            // A backslash-newline is a line continuation: the shell deletes
            // the pair and runs the joined word.
            "r\\\nm -rf ./important-data",
            "\\\nrm -rf ./important-data",
            "/bin/r\\\nm -rf ./important-data",
            "rm\\\n -rf ./important-data",
            "s\\\nudo rm -rf ./important-data",
            "e\\\nnv rm -rf ./important-data",
            "\"r\\\nm\" -rf ./important-data",
            "sh -c 'r\\\nm -rf ./important-data'",
            // A comment ends at its newline, so the next line still runs.
            "echo hi # \\\nrm -rf ./important-data",
            "echo hi #\\\nrm -rf ./important-data",
            // Brace expansion and bracket globs are the shell's to resolve, so
            // a program word spelled with either cannot be cleared.
            "{rm,-rf,./important-data}",
            "rm{,} -rf ./important-data",
            "{,/bin/}rm -rf ./important-data",
            "/bin/r[m] -rf ./important-data",
            // A shell outside the Bourne family runs the same payload.
            "csh -c 'rm -rf ./important-data'",
            "tcsh -c 'rm -rf ./important-data'",
            "/bin/csh -fc 'rm -rf ./important-data'",
            "fish -c 'rm -rf ./important-data'",
            "pwsh -c 'rm -rf ./important-data'",
            // A case-insensitive filesystem execs the same binary either way.
            "SH -c 'rm -rf ./important-data'",
            "ENV rm -rf ./important-data",
            // A remote command still runs the denied program.
            "ssh localhost rm -rf ./important-data",
            "ssh -p 22 localhost 'rm -rf ./important-data'",
            "ssh localhost -- rm -rf ./important-data",
            "ssh -o 'ProxyCommand=rm -rf ./important-data' localhost true",
            // The command glued to the option that carries it.
            "env --split-string='rm -rf ./important-data'",
            "env -S'rm -rf ./important-data'",
            "flock --command='rm -rf ./important-data' /tmp/lock",
            "runuser --command='rm -rf ./important-data' root",
            // The GNU spelling of a wrapper runs the same program.
            "gtimeout 5 rm -rf ./important-data",
            "gxargs rm -rf ./important-data",
            // A command line smuggled in as an environment value.
            "GIT_PAGER='rm -rf ./important-data' git log",
            "env EDITOR='rm -rf ./important-data' git commit",
        ] {
            let result = ensure_tool_call_allowed(
                "run_command",
                &args(&[("command", command)]),
                None,
                &["Bash(rm *)".to_string()],
            );
            assert!(result.is_err(), "`{command}` should match `Bash(rm *)`");
        }

        // Padding the command past the shape walk's unit cap must not hide the
        // denied program behind the truncation.
        let padded = format!("{}rm -rf ./important-data", "echo ok; ".repeat(200));
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", padded.as_str())]),
            None,
            &["Bash(rm *)".to_string()],
        )
        .is_err());
    }

    #[test]
    fn call_filter_refuses_commands_whose_program_only_the_shell_resolves() {
        for command in [
            "$(which rm) -rf ./important-data",
            "$RM -rf ./important-data",
            "./*.sh",
        ] {
            let err = ensure_tool_call_allowed(
                "run_command",
                &args(&[("command", command)]),
                None,
                &["Bash(rm *)".to_string()],
            )
            .expect_err("an unresolvable program cannot be cleared");

            assert!(
                err.reason.contains("cannot be resolved to a program name"),
                "{command}"
            );
        }

        // A rule with no argument filter is not a command rule, and a resolvable
        // program is judged on its own merits.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "echo $(date)")]),
            None,
            &["Bash(rm *)".to_string()],
        )
        .is_ok());
    }

    #[test]
    fn call_filter_refuses_a_shell_fed_a_script_it_cannot_read() {
        for command in [
            "echo 'rm -rf ./important-data' | sh",
            "printf 'rm -rf ./important-data' | sh",
            "cat payload.sh | bash",
            "sh <<< 'rm -rf ./important-data'",
            "sh ./payload.sh",
            "sh /tmp/payload.sh --version",
            "source ./payload.sh",
            ". ./payload.sh",
            "sudo -s",
            "su root",
            "python3 -c 'import os; os.system(\"rm -rf ./important-data\")'",
            "perl -e 'system(\"rm -rf ./important-data\")'",
        ] {
            let err = ensure_tool_call_allowed(
                "run_command",
                &args(&[("command", command)]),
                None,
                &["Bash(rm *)".to_string()],
            )
            .expect_err("a program the walk cannot read must not be cleared");

            assert!(
                err.reason.contains("cannot be resolved to a program name"),
                "{command}"
            );
        }
    }

    #[test]
    fn call_filter_refuses_an_interpreter_handed_inline_code() {
        for command in [
            "awk 'BEGIN{system(\"rm -rf ./important-data\")}'",
            "gawk 'BEGIN{system(\"rm -rf ./important-data\")}'",
            "mawk 'BEGIN{system(\"rm -rf ./important-data\")}'",
            "nawk -f payload.awk data.txt",
            "busybox awk 'BEGIN{system(\"rm -rf ./important-data\")}'",
            "osascript -e 'do shell script \"rm -rf ./important-data\"'",
            "expect -c 'spawn rm -rf ./important-data'",
            "crontab -",
            "perl -pe 'system(\"rm -rf ./important-data\")'",
            "python3 -Bc 'import os; os.system(\"rm -rf ./important-data\")'",
            "ruby -ne 'system(\"rm -rf ./important-data\")'",
            "/usr/bin/awk 'BEGIN{system(\"rm -rf ./important-data\")}'",
            "cmd.exe /c \"rm -rf ./important-data\"",
            "pwsh.exe -Command 'rm -rf ./important-data'",
            "deno eval 'Deno.exit()'",
            "csh",
            "fish",
            "cmd /c \"rm -rf ./important-data\"",
            "pwsh -Command 'rm -rf ./important-data'",
        ] {
            let err = ensure_tool_call_allowed(
                "run_command",
                &args(&[("command", command)]),
                None,
                &["Bash(rm *)".to_string()],
            )
            .expect_err("an interpreter handed inline code must not be cleared");

            assert!(
                err.reason.contains("cannot be resolved to a program name"),
                "{command}"
            );
        }
    }

    /// The fail-closed rule is deliberately wider than the deny pattern: once an
    /// operator configures any command-scoped rule, work whose program the walk
    /// cannot read is refused instead of sliding through unmatched.
    #[test]
    fn a_command_deny_rule_refuses_work_it_cannot_prove() {
        for command in [
            "bash scripts/deploy.sh",
            "sh ./scripts/ci.sh",
            "python3 -c 'import sys'",
            "node -e 'console.log(1)'",
            "source ./env.sh",
            "awk '{print $1}' access.log",
        ] {
            let call = args(&[("command", command)]);

            assert!(
                ensure_tool_call_allowed("run_command", &call, None, &[]).is_ok(),
                "`{command}` is only refused once a command rule exists"
            );

            let err =
                ensure_tool_call_allowed("run_command", &call, None, &["Bash(rm *)".to_string()])
                    .expect_err("a command rule cannot clear work the walk cannot read");

            assert!(
                err.reason.contains("cannot be resolved to a program name"),
                "{command}"
            );
        }
    }

    #[test]
    fn a_command_deny_rule_still_lets_ordinary_work_through() {
        for command in [
            "cargo test -p agiworkforce-cli",
            "git status --short",
            "ls -la src",
            "npm run build",
            "grep -rn todo src",
            "cat $(ls *.txt)",
            "echo ok | tee /tmp/log",
            "sh -c 'cargo build && cargo test'",
            "bash --version",
            "python3 scripts/report.py --json",
            "sudo -u root cargo build",
            "env FOO=1 nice -n 5 cargo build",
            "for f in *.rs; do echo $f; done",
            "mkdir -p out/{a,b}",
            "cp file{,.bak}",
            "[ -n x ] && echo ok",
            "echo a#b",
            "cargo build # rebuild",
        ] {
            assert!(
                ensure_tool_call_allowed(
                    "run_command",
                    &args(&[("command", command)]),
                    None,
                    &["Bash(rm *)".to_string()],
                )
                .is_ok(),
                "`{command}` should not be caught by `Bash(rm *)`"
            );
        }
    }

    #[test]
    fn speculative_units_convict_but_never_clear() {
        // The unknown `-Z val` hides the payload from the wrapper's option
        // table, so only the speculative unit sees `cargo` — and a speculative
        // unit must not be enough to satisfy an allowlist.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "strace -Z val cargo build")]),
            Some(&["Bash(strace *)".to_string(), "Bash(cargo *)".to_string()]),
            &[],
        )
        .is_err());

        // A guess must not refuse a call the walk otherwise resolved: the
        // speculative `$USER cargo build` unit has no resolvable program.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "sudo -u $USER cargo build")]),
            None,
            &["Bash(rm *)".to_string()],
        )
        .is_ok());
    }

    #[test]
    fn allowlist_matches_the_program_that_runs_not_its_spelling() {
        // Re-spelling normalizes in the allow direction too.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "'cargo' test")]),
            Some(&["Bash(cargo *)".to_string()]),
            &[],
        )
        .is_ok());

        // A grouped or wrapped command is still its own unit and must be covered.
        for command in [
            "cargo test && (rm -rf ./data)",
            "cargo test; { rm -rf ./data; }",
            "sh -c 'rm -rf ./data'",
        ] {
            assert!(
                ensure_tool_call_allowed(
                    "run_command",
                    &args(&[("command", command)]),
                    Some(&["Bash(cargo *)".to_string()]),
                    &[],
                )
                .is_err(),
                "`{command}` should not be allowed by `Bash(cargo *)`"
            );
        }

        // An operator rule written against a whole chain still matches it.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "cargo test && cargo build")]),
            Some(&["Bash(cargo test && cargo build)".to_string()]),
            &[],
        )
        .is_ok());
    }

    #[test]
    fn piped_helper_needs_its_own_allow_rule_or_a_chain_rule() {
        let command = args(&[("command", "git log | head -20")]);

        // A single-command rule is deliberately not matched against the raw
        // chain: the same trailing `*` would otherwise cover `git log | sh`.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &command,
            Some(&["Bash(git *)".to_string()]),
            &[],
        )
        .is_err());

        assert!(ensure_tool_call_allowed(
            "run_command",
            &command,
            Some(&["Bash(git *)".to_string(), "Bash(head *)".to_string()]),
            &[],
        )
        .is_ok());

        assert!(ensure_tool_call_allowed(
            "run_command",
            &command,
            Some(&["Bash(git log | head *)".to_string()]),
            &[],
        )
        .is_ok());
    }

    #[test]
    fn allowlist_requires_every_chained_segment_to_be_covered() {
        // The trailing `*` in `cargo *` swallows the whole raw string, so a raw
        // match would allow the appended destructive command.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "cargo test && /bin/rm -rf ./data")]),
            Some(&["Bash(cargo *)".to_string()]),
            &[],
        )
        .is_err());

        // Every segment covered by some allow rule still passes.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "git status && cargo build")]),
            Some(&["Bash(cargo *)".to_string(), "Bash(git *)".to_string()]),
            &[],
        )
        .is_ok());

        // A rule with no argument filter still allows the whole tool.
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "cargo test && rm -rf ./data")]),
            Some(&["run_command".to_string()]),
            &[],
        )
        .is_ok());
    }

    #[test]
    fn non_command_tool_targets_are_matched_whole() {
        assert!(ensure_tool_call_allowed(
            "read_file",
            &args(&[("path", "src/main.rs")]),
            Some(&["Read(src/*)".to_string()]),
            &[],
        )
        .is_ok());

        assert!(ensure_tool_call_allowed(
            "read_file",
            &args(&[("path", "/etc/shadow")]),
            Some(&["Read(src/*)".to_string()]),
            &[],
        )
        .is_err());
    }

    #[test]
    fn call_filter_enforces_positive_allowlist_patterns() {
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "cargo test -p agiworkforce-cli")]),
            Some(&["Bash(cargo *)".to_string()]),
            &[],
        )
        .is_ok());

        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "npm install")]),
            Some(&["Bash(cargo *)".to_string()]),
            &[],
        )
        .is_err());
    }
}
