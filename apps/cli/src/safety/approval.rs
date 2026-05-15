use super::dangerous_commands::{
    BASE64_DANGEROUS_OPTIONS, FIND_DANGEROUS_OPTIONS, GIT_BRANCH_READONLY_FLAGS,
    GIT_GLOBAL_OPTIONS_WITH_VALUE, GIT_SAFE_SUBCOMMANDS, RG_DANGEROUS_OPTIONS, SYSTEM_PATHS,
};
use super::CommandSafety;

/// Strip leading path from a command name (e.g. `/usr/bin/rm` -> `rm`).
pub(super) fn strip_path(word: &str) -> &str {
    word.rsplit('/').next().unwrap_or(word)
}

/// Classify `rm` — force flags make it Dangerous, otherwise Unknown.
/// `-r`/`-R`/`--recursive` alone is Unknown (prompts user), but combined with
/// `-f` (e.g. `-rf`, `-fr`, `-rfv`) it becomes Dangerous.
pub(super) fn classify_rm(command: &str) -> CommandSafety {
    let args: Vec<&str> = command.split_whitespace().collect();
    for arg in &args[1..] {
        if *arg == "-f" || *arg == "--force" || *arg == "-rf" || *arg == "-fr" {
            return CommandSafety::Dangerous;
        }
        // Combined short flags like -rfv, -fv — dangerous only if 'f' is present.
        if arg.starts_with('-') && !arg.starts_with("--") {
            let flag_chars = &arg[1..];
            if flag_chars.contains('f') {
                return CommandSafety::Dangerous;
            }
        }
    }
    // rm without force flags is Unknown — prompts user.
    CommandSafety::Unknown
}

/// Classify `find` — dangerous if any exec/delete options are present.
pub(super) fn classify_find(command: &str) -> CommandSafety {
    let args: Vec<&str> = command.split_whitespace().collect();
    for arg in &args[1..] {
        if FIND_DANGEROUS_OPTIONS.contains(arg) {
            return CommandSafety::Dangerous;
        }
    }
    CommandSafety::Safe
}

/// Classify `rg` — dangerous if any execution/compressed-search options are present.
pub(super) fn classify_rg(command: &str) -> CommandSafety {
    let args: Vec<&str> = command.split_whitespace().collect();
    for arg in &args[1..] {
        if RG_DANGEROUS_OPTIONS.contains(arg) {
            return CommandSafety::Dangerous;
        }
    }
    CommandSafety::Safe
}

/// Classify `sed` — only safe if it matches the read-only print pattern `sed -n {N|M,N}p`.
pub(super) fn classify_sed(command: &str) -> CommandSafety {
    let args: Vec<&str> = command.split_whitespace().collect();
    // Safe pattern: `sed -n <range>p [file...]`
    // where <range> is digits or digits,digits followed by 'p'
    if args.len() >= 3 && args[1] == "-n" {
        // Strip surrounding single/double quotes from the expression
        let expr = args[2]
            .trim_start_matches('\'')
            .trim_end_matches('\'')
            .trim_start_matches('"')
            .trim_end_matches('"');
        if is_sed_readonly_print(expr) {
            return CommandSafety::Safe;
        }
    }
    CommandSafety::Unknown
}

/// Check if a sed expression is a read-only print: `Np`, `M,Np`, `$p`.
pub(super) fn is_sed_readonly_print(expr: &str) -> bool {
    if !expr.ends_with('p') {
        return false;
    }
    let body = &expr[..expr.len() - 1];
    if body.is_empty() {
        return false;
    }
    // Single number: "5p" or "$p"
    if body == "$" || body.chars().all(|c| c.is_ascii_digit()) {
        return true;
    }
    // Range: "5,10p" or "$,10p" or "5,$p"
    if let Some((left, right)) = body.split_once(',') {
        let left_ok = left == "$" || (!left.is_empty() && left.chars().all(|c| c.is_ascii_digit()));
        let right_ok =
            right == "$" || (!right.is_empty() && right.chars().all(|c| c.is_ascii_digit()));
        return left_ok && right_ok;
    }
    false
}

/// Classify `base64` — dangerous if output file options are present.
pub(super) fn classify_base64(command: &str) -> CommandSafety {
    let args: Vec<&str> = command.split_whitespace().collect();
    for arg in &args[1..] {
        if BASE64_DANGEROUS_OPTIONS.contains(arg) {
            return CommandSafety::Dangerous;
        }
    }
    CommandSafety::Safe
}

/// Classify `git` — enhanced validation that skips global options, blocks `-c`,
/// and validates subcommands with their flags.
pub(super) fn classify_git(command: &str) -> CommandSafety {
    let args: Vec<&str> = command.split_whitespace().collect();
    let mut i = 1; // skip "git"

    // Block `git -c` (config override injection) — all forms.
    for arg in &args[1..] {
        if *arg == "-c" || arg.starts_with("-c=") || arg.starts_with("-c ") {
            return CommandSafety::Dangerous;
        }
        // Also block --config and --config= (long form)
        if *arg == "--config" || arg.starts_with("--config=") {
            return CommandSafety::Dangerous;
        }
    }

    // Skip global options to find the actual subcommand.
    while i < args.len() {
        let arg = args[i];
        if GIT_GLOBAL_OPTIONS_WITH_VALUE.contains(&arg) {
            i += 2; // skip the option and its value
            continue;
        }
        // Skip --git-dir=value style
        if GIT_GLOBAL_OPTIONS_WITH_VALUE
            .iter()
            .any(|opt| arg.starts_with(&format!("{}=", opt)))
        {
            i += 1;
            continue;
        }
        break;
    }

    if i >= args.len() {
        // Just `git` with no subcommand — Unknown.
        return CommandSafety::Unknown;
    }

    let subcommand = args[i];
    let sub_args = &args[i + 1..];

    // Dangerous prefixes that the multi-word check may have missed due to global opts.
    let normalized_sub = std::iter::once(subcommand)
        .chain(sub_args.iter().copied())
        .collect::<Vec<_>>()
        .join(" ");

    if normalized_sub.starts_with("push --force") || normalized_sub.starts_with("reset --hard") {
        return CommandSafety::Dangerous;
    }

    // Safe read-only subcommands.
    if GIT_SAFE_SUBCOMMANDS.contains(&subcommand) {
        return CommandSafety::Safe;
    }

    // `git remote -v` is safe.
    if subcommand == "remote" && sub_args.contains(&"-v") {
        return CommandSafety::Safe;
    }

    // `git tag -l` is safe.
    if subcommand == "tag"
        && (sub_args.is_empty() || sub_args.contains(&"-l") || sub_args.contains(&"--list"))
    {
        return CommandSafety::Safe;
    }

    // `git branch` is safe only with read-only flags (or no flags at all listing branches).
    if subcommand == "branch" {
        return classify_git_branch(sub_args);
    }

    CommandSafety::Unknown
}

/// Classify `git branch` — safe only with read-only flags.
pub(super) fn classify_git_branch(args: &[&str]) -> CommandSafety {
    if args.is_empty() {
        return CommandSafety::Safe;
    }
    // Every argument must be a known read-only flag.
    for arg in args {
        if !GIT_BRANCH_READONLY_FLAGS.contains(arg) {
            return CommandSafety::Unknown;
        }
    }
    CommandSafety::Safe
}

/// Classify an `mv` command — dangerous only when the target is a system path.
pub(super) fn classify_mv(command: &str) -> CommandSafety {
    let args: Vec<&str> = command.split_whitespace().collect();
    // `mv` with a target: last positional arg (skip flags starting with '-').
    if let Some(target) = args.iter().rev().find(|a| !a.starts_with('-')) {
        for sys_path in SYSTEM_PATHS {
            if target.starts_with(sys_path) {
                return CommandSafety::Dangerous;
            }
        }
    }
    // mv to a non-system path is just Unknown (still asks user, no warning).
    CommandSafety::Unknown
}
