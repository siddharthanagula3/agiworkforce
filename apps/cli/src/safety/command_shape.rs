
use std::collections::HashSet;

use super::approval::strip_path;

const MAX_DEPTH: usize = 4;
const MAX_UNITS: usize = 128;
const MAX_NESTED_CANDIDATES: usize = 6;

const SHELL_KEYWORDS: &[&str] = &[
    "!", "[[", "]]", "do", "done", "elif", "else", "esac", "fi", "function", "if", "in", "then",
    "until", "while", "{", "}",
];

/// Headers whose remaining words are values, not a command to run.
const WORD_LIST_HEADERS: &[&str] = &["case", "for", "select"];

const SHELLS: &[&str] = &[
    "ash",
    "bash",
    "cmd",
    "csh",
    "dash",
    "elvish",
    "fish",
    "ksh",
    "ksh93",
    "mksh",
    "nu",
    "oksh",
    "powershell",
    "pwsh",
    "sh",
    "tcsh",
    "yash",
    "zsh",
];

/// Shell options that consume the next word, so a `-c` after one of them is
/// still the flag that carries the script.
const SHELL_OPTIONS_WITH_VALUE: &[&str] = &["-o", "+o", "-O", "+O", "--rcfile", "--init-file"];

/// Programs whose work is a script this walk never sees.
const PROGRAMS_RUNNING_UNSEEN_CODE: &[&str] = &[".", "at", "batch", "crontab", "source"];

/// Environment variables whose value is itself a command line the program will
/// hand to a shell, so `GIT_PAGER='rm -rf x' git log` reaches `rm` even though
/// the assignment is not a command word.
const COMMAND_VALUED_ENV: &[&str] = &[
    "BROWSER",
    "EDITOR",
    "GIT_EDITOR",
    "GIT_EXTERNAL_DIFF",
    "GIT_PAGER",
    "GIT_SEQUENCE_EDITOR",
    "GIT_SSH",
    "GIT_SSH_COMMAND",
    "LESSCLOSE",
    "LESSOPEN",
    "MANPAGER",
    "PAGER",
    "SHELL",
    "VISUAL",
];

/// Wrappers that fall back to an interactive or piped shell when no command
/// operand is found, so failing to locate a payload means running anything.
const SHELL_SPAWNING_WRAPPERS: &[&str] = &[
    "chroot", "doas", "nsenter", "parallel", "pkexec", "runuser", "script", "su", "sudo", "unshare",
];

/// Interpreters that take program text on the command line. The text is not
/// shell, so the walk cannot follow it into whatever the interpreter spawns.
const INLINE_CODE_FLAGS: &[(&str, &[&str])] = &[
    ("bun", &["-e", "--eval"]),
    ("deno", &["eval"]),
    ("emacs", &["--eval", "-eval"]),
    ("ex", &["-c"]),
    ("expect", &["-c"]),
    ("julia", &["-e"]),
    ("lua", &["-e"]),
    ("luajit", &["-e"]),
    ("node", &["-e", "--eval", "-p", "--print"]),
    ("nvim", &["-c", "--cmd"]),
    ("osascript", &["-e"]),
    ("perl", &["-e", "-E"]),
    ("php", &["-r"]),
    ("pypy", &["-c"]),
    ("pypy3", &["-c"]),
    ("python", &["-c"]),
    ("python2", &["-c"]),
    ("python3", &["-c"]),
    ("rscript", &["-e"]),
    ("ruby", &["-e"]),
    ("vi", &["-c"]),
    ("vim", &["-c", "--cmd"]),
    ("xonsh", &["-c"]),
];

/// Interpreters whose program text is an operand rather than a flag value, so
/// every invocation of one runs code this walk cannot read.
const INLINE_CODE_OPERAND_PROGRAMS: &[&str] = &["awk", "gawk", "mawk", "nawk"];

/// Tools this walk models that GNU coreutils also installs under a `g` prefix
/// (`gtimeout`, `gxargs`), which runs the very same program.
const GNU_PREFIXED_TOOLS: &[&str] = &[
    "chroot", "env", "find", "ionice", "nice", "nohup", "parallel", "stdbuf", "time", "timeout",
    "xargs",
];

/// One command invocation found in a command string, with the alternate
/// spellings a filter rule may have been written against.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CommandUnit {
    spellings: Vec<String>,
    program: Option<String>,
    display: String,
    resolvable: bool,
    speculative: bool,
}

impl CommandUnit {
    pub(crate) fn literal(value: &str) -> Self {
        Self {
            spellings: vec![value.to_string()],
            program: None,
            display: value.to_string(),
            resolvable: true,
            speculative: false,
        }
    }

    /// Stands in for whatever the depth/count limits stopped us from walking, so
    /// padding a command past the cap hides nothing from a filter.
    fn opaque(command: &str) -> Self {
        let command = command.trim().to_string();
        Self {
            spellings: vec![command.clone()],
            program: None,
            display: command,
            resolvable: false,
            speculative: false,
        }
    }

    pub(crate) fn spellings(&self) -> &[String] {
        &self.spellings
    }

    /// False when the program this unit runs cannot be determined before the
    /// shell expands it (`$(which rm)`, `$RM`, `./*.sh`), or when the unit runs
    /// code the walk cannot read (`sh script.sh`, `echo ... | sh`, `python -c`).
    /// A command filter can neither clear nor convict such a unit, so callers
    /// must fail closed.
    pub(crate) fn is_resolvable(&self) -> bool {
        self.resolvable
    }

    /// True for a unit the walk guessed at rather than proved. It exists to
    /// convict against a deny rule and must never take part in clearing a call.
    pub(crate) fn is_speculative(&self) -> bool {
        self.speculative
    }

    pub(crate) fn display(&self) -> &str {
        &self.display
    }
}

/// Every command invocation reachable from `command`, including the payloads of
/// wrappers (`env`, `sudo`, `xargs`, `sh -c`, `eval`) and command substitutions.
/// A walk cut short by the depth or count limit contributes an unresolvable unit
/// so callers still fail closed.
pub(crate) fn command_units(command: &str) -> Vec<CommandUnit> {
    let mut walk = Walk::default();
    let complete = walk.collect(command, 0, false);
    walk.drain_speculative();
    if !complete {
        walk.units.push(CommandUnit::opaque(command));
    }
    walk.units
}

#[derive(Default)]
struct Walk {
    units: Vec<CommandUnit>,
    seen: HashSet<String>,
    pending: Vec<(String, usize)>,
}

impl Walk {
    /// Speculative candidates are walked only after the committed pass, so a
    /// padded command cannot spend the unit budget on guesses and leave the
    /// commands it really runs unexamined.
    fn drain_speculative(&mut self) {
        while let Some((command, depth)) = self.pending.pop() {
            self.collect(&command, depth, true);
        }
    }

    fn collect(&mut self, command: &str, depth: usize, speculative: bool) -> bool {
        if depth > MAX_DEPTH || self.units.len() >= MAX_UNITS {
            return false;
        }
        if !self.seen.insert(command.to_string()) {
            return true;
        }

        let lexed = lex(command);
        let mut complete = true;
        for slice in lexed.tokens.split(|token| *token == Token::Separator) {
            complete &= self.emit_unit(slice, depth, speculative);
        }
        for inner in lexed.substitutions {
            complete &= self.collect(&inner, depth + 1, speculative);
        }
        complete
    }

    fn emit_unit(&mut self, slice: &[Token], depth: usize, speculative: bool) -> bool {
        if self.units.len() >= MAX_UNITS {
            return false;
        }
        let Some(words) = command_words(slice) else {
            return true;
        };
        let Some((program_word, rest)) = words.split_first() else {
            return true;
        };

        let raw = words.join(" ");
        let program = resolve_program(program_word);
        let mut spellings = vec![raw.clone()];

        if let Some(program) = &program {
            let dequoted: Vec<String> = rest.iter().map(|word| dequote(word).text).collect();
            for name in [program.clone(), program.to_lowercase()] {
                spellings.push(join_program(&name, rest));
                spellings.push(join_program(&name, &dequoted));
            }
        }

        spellings.sort();
        spellings.dedup();

        let plan = program
            .as_deref()
            .map_or_else(ExecutionPlan::default, |program| {
                execution_plan(program, rest, &raw)
            });

        self.units.push(CommandUnit {
            spellings,
            program: program.clone(),
            display: raw.clone(),
            resolvable: program.is_some() && !plan.hidden,
            speculative,
        });

        for candidate in plan
            .speculative
            .into_iter()
            .chain(command_valued_env_payloads(slice))
        {
            if self.units.len() + self.pending.len() < MAX_UNITS {
                self.pending.push((candidate, depth + 1));
            }
        }

        match plan.payload {
            Some(payload) => self.collect(&payload, depth + 1, speculative),
            None => true,
        }
    }
}

#[derive(Default)]
struct ExecutionPlan {
    payload: Option<String>,
    speculative: Vec<String>,
    hidden: bool,
}

impl ExecutionPlan {
    fn hidden() -> Self {
        Self {
            hidden: true,
            ..Self::default()
        }
    }
}

/// What a program will go on to run, as far as this walk can tell. Table lookups
/// fold case because the case-insensitive filesystems this CLI runs on exec
/// `SH -c ...` and `ENV rm ...` as readily as their lowercase spellings.
fn execution_plan(program: &str, args: &[String], rendered: &str) -> ExecutionPlan {
    let canonical = canonical_program(program);
    let program = canonical.as_str();
    if PROGRAMS_RUNNING_UNSEEN_CODE.contains(&program) {
        return ExecutionPlan::hidden();
    }
    if SHELLS.contains(&program) {
        return shell_plan(args);
    }
    if program == "eval" {
        let payload = args
            .iter()
            .map(|word| dequote(word).text)
            .collect::<Vec<_>>()
            .join(" ");
        return ExecutionPlan {
            payload: (!payload.is_empty()).then_some(payload),
            ..ExecutionPlan::default()
        };
    }
    if runs_inline_code(program, args) {
        return ExecutionPlan::hidden();
    }
    if program == "xargs" {
        return ExecutionPlan {
            payload: super::xargs_payload(rendered),
            speculative: nested_candidates(args),
            hidden: false,
        };
    }
    if program == "find" {
        return ExecutionPlan {
            payload: find_exec_payload(args),
            ..ExecutionPlan::default()
        };
    }
    if program == "trap" {
        return ExecutionPlan {
            payload: trap_payload(args),
            ..ExecutionPlan::default()
        };
    }

    let Some(spec) = wrapper_spec(program) else {
        return ExecutionPlan::default();
    };
    let payload = spec.payload(args);
    ExecutionPlan {
        hidden: payload.is_none() && SHELL_SPAWNING_WRAPPERS.contains(&program),
        payload,
        speculative: nested_candidates(args),
    }
}

/// The name to look up in the tables below: case folded because the filesystems
/// this CLI runs on are, without the Windows executable suffix, and under the
/// GNU tool it aliases. Each of those spellings execs the very same program.
fn canonical_program(program: &str) -> String {
    let lowercased = program.to_ascii_lowercase();
    let name = lowercased.strip_suffix(".exe").unwrap_or(&lowercased);
    if let Some(base) = name.strip_prefix('g') {
        if GNU_PREFIXED_TOOLS.contains(&base) {
            return base.to_string();
        }
    }
    name.to_string()
}

fn shell_plan(args: &[String]) -> ExecutionPlan {
    let mut index = 0;
    while index < args.len() {
        let arg = args[index].as_str();
        if arg == "--" {
            break;
        }
        if let Some(attached) = command_flag_attachment(arg) {
            let payload = args.get(index + 1).map(|value| dequote(value).text);
            let attached = dequote(attached).text;
            return ExecutionPlan {
                hidden: payload.is_none(),
                payload,
                speculative: (!attached.is_empty())
                    .then_some(attached)
                    .into_iter()
                    .collect(),
            };
        }
        if SHELL_OPTIONS_WITH_VALUE.contains(&arg) {
            index += 2;
            continue;
        }
        if arg.starts_with('-') || arg.starts_with('+') {
            index += 1;
            continue;
        }
        break;
    }

    let only_options = index >= args.len();
    if only_options && args.iter().any(|arg| arg == "--version" || arg == "--help") {
        return ExecutionPlan::default();
    }
    ExecutionPlan::hidden()
}

/// The text attached to a short-option cluster that carries `c`, if any:
/// `-c` and `-lc` yield an empty attachment (the script is the next word),
/// `-c'rm -rf x'` yields the script itself.
fn command_flag_attachment(arg: &str) -> Option<&str> {
    if !arg.starts_with('-') || arg.starts_with("--") {
        return None;
    }
    let offset = arg[1..].find('c')? + 2;
    Some(&arg[offset..])
}

fn runs_inline_code(program: &str, args: &[String]) -> bool {
    if INLINE_CODE_OPERAND_PROGRAMS.contains(&program) {
        return true;
    }
    INLINE_CODE_FLAGS
        .iter()
        .find(|(name, _)| *name == program)
        .is_some_and(|(_, flags)| {
            args.iter()
                .any(|arg| flags.iter().any(|flag| carries_flag(arg, flag)))
        })
}

/// True when `arg` is the flag, carries it inside a short-option cluster
/// (`perl -pe`, `python3 -Bc`) or has its value glued to it (`node -e'code'`).
fn carries_flag(arg: &str, flag: &str) -> bool {
    if arg == flag {
        return true;
    }
    flag.len() == 2
        && arg.starts_with('-')
        && !arg.starts_with("--")
        && arg[1..].contains(&flag[1..])
}

/// Every position in a wrapper's arguments that could begin the command it
/// defers to. Used to convict only: option grammars differ per program and per
/// platform, so guessing wide here is what keeps a table gap from clearing a
/// denied program.
fn nested_candidates(args: &[String]) -> Vec<String> {
    let mut candidates = Vec::new();
    for (index, arg) in args.iter().enumerate() {
        if candidates.len() >= MAX_NESTED_CANDIDATES {
            break;
        }
        if arg.starts_with('-') || is_env_assignment(arg) {
            continue;
        }
        candidates.push(args[index..].join(" "));
        let dequoted = dequote(arg);
        if !dequoted.dynamic && dequoted.text != *arg {
            candidates.push(dequoted.text);
        }
    }
    candidates
}

/// The handler a `trap 'cmd' SIGNAL` registers for the shell to run later.
fn trap_payload(args: &[String]) -> Option<String> {
    let handler = args.iter().find(|arg| !arg.starts_with('-'))?;
    let text = dequote(handler).text;
    (!text.is_empty() && text != "-").then_some(text)
}

/// The command a `find -exec`/`-execdir`/`-ok`/`-okdir` action runs, up to its
/// `;` or `+` terminator.
fn find_exec_payload(args: &[String]) -> Option<String> {
    let start = args
        .iter()
        .position(|arg| matches!(arg.as_str(), "-exec" | "-execdir" | "-ok" | "-okdir"))?
        + 1;
    let end = args[start..]
        .iter()
        .position(|arg| matches!(dequote(arg).text.as_str(), ";" | "+"))
        .map_or(args.len(), |offset| start + offset);
    (start < end).then(|| args[start..end].join(" "))
}

struct WrapperSpec {
    options_with_value: &'static [&'static str],
    command_options: &'static [&'static str],
    operands: usize,
}

impl WrapperSpec {
    fn payload(&self, args: &[String]) -> Option<String> {
        let mut index = 0;
        let mut operands = self.operands;
        while index < args.len() {
            let arg = args[index].as_str();
            if arg == "--" {
                index += 1;
                break;
            }
            if let Some(value) = self
                .command_options
                .iter()
                .find_map(|option| attached_option_value(arg, option))
            {
                return Some(value);
            }
            if self.command_options.contains(&arg) {
                return args.get(index + 1).map(|value| dequote(value).text);
            }
            if is_env_assignment(arg) {
                index += 1;
                continue;
            }
            if arg.starts_with('-') {
                index += if self.options_with_value.contains(&arg) {
                    2
                } else {
                    1
                };
                continue;
            }
            if operands > 0 {
                operands -= 1;
                index += 1;
                continue;
            }
            break;
        }
        (index < args.len()).then(|| args[index..].join(" "))
    }
}

/// The command glued onto an option instead of following it
/// (`env --split-string='rm -rf x'`, `su -c'rm -rf x'`), which runs the same
/// program as the detached spelling.
fn attached_option_value(arg: &str, option: &str) -> Option<String> {
    let rest = arg.strip_prefix(option)?;
    let value = if option.starts_with("--") {
        rest.strip_prefix('=')?
    } else {
        rest.strip_prefix('=').unwrap_or(rest)
    };
    let text = dequote(value).text;
    (!text.is_empty()).then_some(text)
}

fn wrapper_spec(program: &str) -> Option<WrapperSpec> {
    const NONE: &[&str] = &[];
    let (options_with_value, command_options, operands): (&[&str], &[&str], usize) = match program {
        "env" => (
            &["-u", "--unset", "-C", "--chdir"],
            &["-S", "--split-string"],
            0,
        ),
        "nice" => (&["-n", "--adjustment"], NONE, 0),
        "ionice" => (
            &[
                "-c",
                "-n",
                "-p",
                "-P",
                "-u",
                "--class",
                "--classdata",
                "--pid",
            ],
            NONE,
            0,
        ),
        "timeout" => (&["-s", "--signal", "-k", "--kill-after"], NONE, 1),
        "sudo" | "doas" => (
            &[
                "-u",
                "-g",
                "-U",
                "-C",
                "-p",
                "-r",
                "-t",
                "-h",
                "-D",
                "-R",
                "--user",
                "--group",
                "--prompt",
                "--chdir",
                "--chroot",
                "--close-from",
                "--host",
                "--role",
                "--type",
            ],
            NONE,
            0,
        ),
        "pkexec" => (&["--user"], NONE, 0),
        "su" => (
            &[
                "-s",
                "--shell",
                "-g",
                "--group",
                "-G",
                "--supp-group",
                "-w",
                "--whitelist-environment",
            ],
            &["-c", "--command"],
            1,
        ),
        "runuser" => (
            &[
                "-s",
                "--shell",
                "-g",
                "--group",
                "-G",
                "--supp-group",
                "-u",
                "--user",
                "-w",
                "--whitelist-environment",
            ],
            &["-c", "--command"],
            0,
        ),
        "script" => (
            &[
                "-t",
                "--timing",
                "-B",
                "--log-io",
                "-I",
                "--log-in",
                "-O",
                "--log-out",
                "-T",
                "-m",
            ],
            &["-c", "--command"],
            1,
        ),
        "flock" => (
            &["-w", "--wait", "--timeout", "-E", "--conflict-exit-code"],
            &["-c", "--command"],
            1,
        ),
        "strace" | "ltrace" => (
            &[
                "-o", "--output", "-e", "-p", "-s", "-u", "-E", "-P", "-I", "-b", "-S", "-a", "-x",
            ],
            NONE,
            0,
        ),
        "taskset" | "chrt" => (
            &[
                "-T",
                "--sched-runtime",
                "-P",
                "--sched-period",
                "-D",
                "--sched-deadline",
            ],
            NONE,
            1,
        ),
        "watch" => (&["-n", "--interval"], NONE, 0),
        // A remote command is still a command: `ssh localhost rm -rf x` runs the
        // denied program on this machine.
        "ssh" => (
            &[
                "-B", "-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L", "-l", "-m", "-O",
                "-o", "-p", "-Q", "-R", "-S", "-W", "-w",
            ],
            NONE,
            1,
        ),
        "unshare" => (
            &[
                "-S",
                "--setuid",
                "-G",
                "--setgid",
                "-R",
                "--root",
                "-w",
                "--wd",
                "--map-user",
                "--map-group",
                "--propagation",
            ],
            NONE,
            0,
        ),
        "nsenter" => (
            &[
                "-t", "--target", "-S", "--setuid", "-G", "--setgid", "--wd", "--root",
            ],
            NONE,
            0,
        ),
        "setpriv" => (
            &[
                "--reuid",
                "--regid",
                "--groups",
                "--inh-caps",
                "--ambient-caps",
                "--bounding-set",
                "--securebits",
                "--pdeathsig",
                "--selinux-label",
                "--apparmor-profile",
                "--landlock-access",
                "--landlock-rule",
            ],
            NONE,
            0,
        ),
        "parallel" => (
            &[
                "-j",
                "--jobs",
                "-n",
                "-N",
                "-L",
                "--max-lines",
                "-S",
                "-P",
                "-a",
                "--arg-file",
                "--colsep",
                "--sshloginfile",
                "--results",
                "--joblog",
                "--tmpdir",
                "--delay",
                "--timeout",
            ],
            NONE,
            0,
        ),
        "numactl" => (
            &[
                "-N",
                "--cpunodebind",
                "-m",
                "--membind",
                "-C",
                "--physcpubind",
                "-p",
                "--preferred",
                "-i",
                "--interleave",
            ],
            NONE,
            0,
        ),
        "systemd-run" => (
            &[
                "-p",
                "--property",
                "--unit",
                "--on-calendar",
                "--slice",
                "-M",
                "--machine",
                "--uid",
                "--gid",
                "-E",
                "--setenv",
                "-d",
                "--description",
            ],
            NONE,
            0,
        ),
        "xvfb-run" => (
            &[
                "-n",
                "--server-num",
                "-s",
                "--server-args",
                "-e",
                "--error-file",
                "-f",
                "--auth-file",
            ],
            NONE,
            0,
        ),
        "watchexec" => (
            &[
                "-w",
                "--watch",
                "-e",
                "--exts",
                "-f",
                "--filter",
                "-d",
                "--debounce",
            ],
            NONE,
            0,
        ),
        "cpulimit" => (&["-l", "--limit", "-p", "--pid", "-e", "--exe"], NONE, 0),
        "stdbuf" => (
            &["-i", "-o", "-e", "--input", "--output", "--error"],
            NONE,
            0,
        ),
        "chroot" => (&["--userspec", "--groups"], NONE, 1),
        "faketime" | "datefudge" | "gosu" | "su-exec" | "runcon" | "setarch" => (NONE, NONE, 1),
        "arch" | "builtin" | "busybox" | "caffeinate" | "catchsegv" | "command" | "coproc"
        | "exec" | "nohup" | "proot" | "retry" | "rlwrap" | "setsid" | "time" | "torsocks"
        | "toybox" | "valgrind" => (NONE, NONE, 0),
        _ => return None,
    };
    Some(WrapperSpec {
        options_with_value,
        command_options,
        operands,
    })
}

fn join_program(program: &str, rest: &[String]) -> String {
    std::iter::once(program.to_string())
        .chain(rest.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ")
}

fn command_words(slice: &[Token]) -> Option<Vec<String>> {
    let mut index = 0;
    while index < slice.len() {
        match &slice[index] {
            Token::Redirect => {
                index += 1;
                if matches!(slice.get(index), Some(Token::Word(_))) {
                    index += 1;
                }
            }
            Token::Word(word) => {
                if word.chars().all(|c| c.is_ascii_digit())
                    && matches!(slice.get(index + 1), Some(Token::Redirect))
                {
                    index += 1;
                    continue;
                }
                if WORD_LIST_HEADERS.contains(&word.as_str()) {
                    return None;
                }
                if SHELL_KEYWORDS.contains(&word.as_str()) || is_env_assignment(word) {
                    index += 1;
                    continue;
                }
                break;
            }
            Token::Separator => index += 1,
        }
    }

    let words: Vec<String> = slice[index..]
        .iter()
        .map(|token| match token {
            Token::Word(word) => word.clone(),
            Token::Redirect => ">".to_string(),
            Token::Separator => ";".to_string(),
        })
        .collect();

    (!words.is_empty()).then_some(words)
}

fn command_valued_env_payloads(slice: &[Token]) -> Vec<String> {
    slice
        .iter()
        .filter_map(|token| {
            let Token::Word(word) = token else {
                return None;
            };
            let assignment = dequote(word).text;
            let (name, value) = assignment.split_once('=')?;
            (carries_a_command_line(name) && !value.is_empty()).then(|| value.to_string())
        })
        .collect()
}

fn carries_a_command_line(name: &str) -> bool {
    COMMAND_VALUED_ENV.contains(&name)
        || (!name.contains(char::is_whitespace) && name.to_ascii_lowercase().ends_with("command"))
}

fn resolve_program(word: &str) -> Option<String> {
    let dequoted = dequote(word);
    if dequoted.dynamic {
        return None;
    }
    let base = strip_path(&dequoted.text);
    (!base.is_empty()).then(|| base.to_string())
}

struct Dequoted {
    text: String,
    dynamic: bool,
}

/// Remove one level of shell quoting and escaping. `dynamic` marks text whose
/// value the shell decides at run time (expansion, substitution, glob), which a
/// static filter must never treat as a literal program name. A backslash before
/// a newline is a line continuation: the shell deletes the pair outside single
/// quotes, so `r\<newline>m` is the program `rm` and has to read as one.
fn dequote(word: &str) -> Dequoted {
    let chars: Vec<char> = word.chars().collect();
    let mut text = String::new();
    let mut dynamic = false;
    let mut index = 0;

    while index < chars.len() {
        match chars[index] {
            '\\' if chars.get(index + 1) == Some(&'\n') => index += 2,
            '\\' if index + 1 < chars.len() => {
                text.push(chars[index + 1]);
                index += 2;
            }
            '\'' => {
                index += 1;
                while index < chars.len() && chars[index] != '\'' {
                    text.push(chars[index]);
                    index += 1;
                }
                index += 1;
            }
            '"' => {
                index += 1;
                while index < chars.len() && chars[index] != '"' {
                    if chars[index] == '\\' && index + 1 < chars.len() {
                        if chars[index + 1] != '\n' {
                            text.push(chars[index + 1]);
                        }
                        index += 2;
                        continue;
                    }
                    if matches!(chars[index], '$' | '`') {
                        dynamic = true;
                    }
                    text.push(chars[index]);
                    index += 1;
                }
                index += 1;
            }
            '$' | '`' | '*' | '?' => {
                dynamic = true;
                text.push(chars[index]);
                index += 1;
            }
            '[' | '{' if expands_at(&chars, index) => {
                dynamic = true;
                text.push(chars[index]);
                index += 1;
            }
            other => {
                text.push(other);
                index += 1;
            }
        }
    }

    Dequoted { text, dynamic }
}

/// True when the bracket glob or brace expansion opening at `index` is one the
/// shell will expand (`/bin/r[m]`, `{rm,-rf,x}`, `rm{,}`), which leaves the word
/// standing for a program name only the shell knows. A lone `[` (the test
/// builtin), a lone `{` (grouping) and `{}` (a `find` placeholder) expand to
/// themselves and stay literal.
fn expands_at(chars: &[char], index: usize) -> bool {
    let rest = &chars[index + 1..];
    match chars[index] {
        '[' => rest.iter().skip(1).any(|c| *c == ']'),
        '{' => {
            let Some(end) = rest.iter().position(|c| *c == '}') else {
                return false;
            };
            let inner = &rest[..end];
            inner.contains(&',') || inner.windows(2).any(|pair| pair == ['.', '.'])
        }
        _ => false,
    }
}

fn is_env_assignment(token: &str) -> bool {
    let Some((name, _)) = token.split_once('=') else {
        return false;
    };
    !name.is_empty()
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Word(String),
    Separator,
    Redirect,
}

struct Lexed {
    tokens: Vec<Token>,
    substitutions: Vec<String>,
}

fn lex(command: &str) -> Lexed {
    let chars: Vec<char> = command.chars().collect();
    let mut tokens: Vec<Token> = Vec::new();
    let mut substitutions: Vec<String> = Vec::new();
    let mut word = String::new();
    let mut index = 0;

    while index < chars.len() {
        if let Some((inner, next)) = read_expansion(&chars, index) {
            if let Some(inner) = inner {
                substitutions.push(inner);
            }
            word.extend(&chars[index..next]);
            index = next;
            continue;
        }

        match chars[index] {
            '#' if starts_a_comment(&chars, index, &word) => {
                while index < chars.len() && chars[index] != '\n' {
                    index += 1;
                }
            }
            // A line continuation is deleted rather than escaped, so the word
            // continues across it instead of splitting around the newline.
            '\\' if chars.get(index + 1) == Some(&'\n') => index += 2,
            '\\' if index + 1 < chars.len() => {
                word.push('\\');
                word.push(chars[index + 1]);
                index += 2;
            }
            '\'' => {
                word.push('\'');
                index += 1;
                while index < chars.len() && chars[index] != '\'' {
                    word.push(chars[index]);
                    index += 1;
                }
                if index < chars.len() {
                    word.push('\'');
                    index += 1;
                }
            }
            '"' => {
                word.push('"');
                index += 1;
                while index < chars.len() && chars[index] != '"' {
                    if chars[index] == '\\' && index + 1 < chars.len() {
                        if chars[index + 1] != '\n' {
                            word.push(chars[index]);
                            word.push(chars[index + 1]);
                        }
                        index += 2;
                        continue;
                    }
                    if let Some((inner, next)) = read_expansion(&chars, index) {
                        if let Some(inner) = inner {
                            substitutions.push(inner);
                        }
                        word.extend(&chars[index..next]);
                        index = next;
                        continue;
                    }
                    word.push(chars[index]);
                    index += 1;
                }
                if index < chars.len() {
                    word.push('"');
                    index += 1;
                }
            }
            ' ' | '\t' => {
                flush_word(&mut word, &mut tokens);
                index += 1;
            }
            '\n' | '\r' | ';' | '|' | '&' | '(' | ')' => {
                flush_word(&mut word, &mut tokens);
                tokens.push(Token::Separator);
                index += 1;
            }
            '<' | '>' => {
                flush_word(&mut word, &mut tokens);
                tokens.push(Token::Redirect);
                index += 1;
                while matches!(chars.get(index), Some('>') | Some('<') | Some('&')) {
                    index += 1;
                }
            }
            other => {
                word.push(other);
                index += 1;
            }
        }
    }

    flush_word(&mut word, &mut tokens);
    Lexed {
        tokens,
        substitutions,
    }
}

/// A `#` opens a comment only at the start of a word, and the comment ends at
/// the newline: a backslash in front of that newline is comment text rather than
/// a line continuation, so whatever follows on the next line is a command the
/// shell really runs.
fn starts_a_comment(chars: &[char], index: usize, word: &str) -> bool {
    word.is_empty()
        && match index.checked_sub(1).map(|previous| chars[previous]) {
            None => true,
            Some(previous) => {
                previous.is_whitespace() || matches!(previous, ';' | '|' | '&' | '(' | ')')
            }
        }
}

fn flush_word(word: &mut String, tokens: &mut Vec<Token>) {
    if !word.is_empty() {
        tokens.push(Token::Word(std::mem::take(word)));
    }
}

/// Consume a `$(...)`, `` `...` `` or `$((...))` span. The inner command text is
/// returned for the first two so callers can inspect what they would run;
/// arithmetic expansion yields none.
fn read_expansion(chars: &[char], start: usize) -> Option<(Option<String>, usize)> {
    match chars.get(start)? {
        '$' if chars.get(start + 1) == Some(&'(') => {
            let arithmetic = chars.get(start + 2) == Some(&'(');
            let mut depth = 0usize;
            let mut index = start + 1;
            while index < chars.len() {
                match chars[index] {
                    '(' => depth += 1,
                    ')' => {
                        depth -= 1;
                        if depth == 0 {
                            let inner = (!arithmetic)
                                .then(|| chars[start + 2..index].iter().collect::<String>());
                            return Some((inner, index + 1));
                        }
                    }
                    _ => {}
                }
                index += 1;
            }
            None
        }
        '`' => {
            let mut index = start + 1;
            while index < chars.len() {
                if chars[index] == '\\' {
                    index += 2;
                    continue;
                }
                if chars[index] == '`' {
                    let inner = chars[start + 1..index].iter().collect::<String>();
                    return Some((Some(inner), index + 1));
                }
                index += 1;
            }
            None
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn programs(command: &str) -> Vec<String> {
        command_units(command)
            .into_iter()
            .filter(|unit| !unit.is_speculative())
            .map(|unit| unit.program.unwrap_or_else(|| "?".to_string()))
            .collect()
    }

    fn reaches(command: &str, program: &str) -> bool {
        command_units(command)
            .iter()
            .any(|unit| unit.program.as_deref() == Some(program))
    }

    fn unresolvable(command: &str) -> bool {
        command_units(command)
            .iter()
            .any(|unit| !unit.is_speculative() && !unit.is_resolvable())
    }

    #[test]
    fn quoting_and_grouping_resolve_to_the_program_that_runs() {
        assert_eq!(programs("'rm' -rf x"), vec!["rm"]);
        assert_eq!(programs("\"rm\" -rf x"), vec!["rm"]);
        assert_eq!(programs("r\"\"m -rf x"), vec!["rm"]);
        assert_eq!(programs("\\rm -rf x"), vec!["rm"]);
        assert_eq!(programs("(rm -rf x)"), vec!["rm"]);
        assert_eq!(programs("{ rm -rf x; }"), vec!["rm"]);
        assert_eq!(programs("if true; then rm -rf x; fi"), vec!["true", "rm"]);
        assert_eq!(programs("/bin/../bin/RM -rf x"), vec!["RM"]);
    }

    #[test]
    fn a_line_continuation_inside_a_word_joins_the_program_the_shell_runs() {
        assert_eq!(programs("r\\\nm -rf x"), vec!["rm"]);
        assert_eq!(programs("\\\nrm -rf x"), vec!["rm"]);
        assert_eq!(programs("/bin/r\\\nm -rf x"), vec!["rm"]);
        assert_eq!(programs("rm\\\n -rf x"), vec!["rm"]);
        assert_eq!(programs("r\\\n\\\nm -rf x"), vec!["rm"]);
        assert_eq!(programs("s\\\nudo rm -rf x"), vec!["sudo", "rm"]);
        assert_eq!(programs("e\\\nnv rm -rf x"), vec!["env", "rm"]);
        assert_eq!(programs("\"r\\\nm\" -rf x"), vec!["rm"]);
        assert_eq!(programs("sh -c 'r\\\nm -rf x'"), vec!["sh", "rm"]);
        assert!(reaches("rm -rf x\\\n", "rm"));
        // Single quotes keep the pair literal, so that word is a different
        // program and must not be reported as the one it resembles.
        assert!(!reaches("'r\\\nm' -rf x", "rm"));
    }

    #[test]
    fn a_comment_runs_only_to_the_newline_that_ends_it() {
        assert_eq!(programs("echo hi # \\\nrm -rf x"), vec!["echo", "rm"]);
        assert_eq!(programs("echo hi #\\\nrm -rf x"), vec!["echo", "rm"]);
        assert_eq!(programs("rm -rf x # trailing"), vec!["rm"]);
        assert_eq!(programs("echo a#b"), vec!["echo"]);
        assert_eq!(programs("echo \"#\" hi"), vec!["echo"]);
    }

    #[test]
    fn a_program_word_the_shell_expands_is_not_a_program_name() {
        for command in [
            "{rm,-rf,x}",
            "rm{,} -rf x",
            "{,/bin/}rm -rf x",
            "/bin/r[m] -rf x",
            "/bin/[r]m -rf x",
        ] {
            assert!(unresolvable(command), "{command}");
        }

        // Constructs that expand to themselves stay literal program names.
        assert_eq!(programs("[ -n x ] && echo ok"), vec!["[", "echo"]);
        assert_eq!(programs("mkdir -p out/{a,b}"), vec!["mkdir"]);
        assert_eq!(programs("cp file{,.bak}"), vec!["cp"]);
        assert_eq!(programs("find . -exec rm {} \\;"), vec!["find", "rm"]);
    }

    #[test]
    fn wrappers_contribute_the_command_they_defer_to() {
        assert_eq!(programs("env FOO=1 rm -rf x"), vec!["env", "rm"]);
        assert_eq!(programs("nice -n 5 rm -rf x"), vec!["nice", "rm"]);
        assert_eq!(programs("sudo -u root rm -rf x"), vec!["sudo", "rm"]);
        assert_eq!(programs("timeout 5 rm -rf x"), vec!["timeout", "rm"]);
        assert_eq!(programs("sh -c 'rm -rf x'"), vec!["sh", "rm"]);
        assert_eq!(programs("eval \"rm -rf x\""), vec!["eval", "rm"]);
        assert_eq!(
            programs("echo a | xargs -n1 rm -rf"),
            vec!["echo", "xargs", "rm"]
        );
        assert_eq!(programs("busybox rm -rf x"), vec!["busybox", "rm"]);
        assert_eq!(programs("coproc rm -rf x"), vec!["coproc", "rm"]);
        assert_eq!(programs("find . -exec rm -rf {} \\;"), vec!["find", "rm"]);
        assert_eq!(programs("find . -name '*.rs'"), vec!["find"]);
        assert_eq!(programs("trap 'rm -rf x' EXIT"), vec!["trap", "rm"]);
        assert_eq!(programs("trap -p"), vec!["trap"]);
    }

    #[test]
    fn an_option_before_dash_c_does_not_hide_the_script() {
        for command in [
            "sh -o errexit -c 'rm -rf x'",
            "bash -o pipefail -c 'rm -rf x'",
            "bash --rcfile /tmp/rc -c 'rm -rf x'",
            "sh -lc 'rm -rf x'",
            "bash --norc -c 'rm -rf x'",
            "sh -c'rm -rf x'",
        ] {
            assert!(reaches(command, "rm"), "{command}");
        }
        // A cluster whose attachment is another flag letter still takes the
        // script from the next word.
        assert!(reaches("sh -cx 'rm -rf x'", "rm"));
    }

    #[test]
    fn a_shell_reading_its_script_from_elsewhere_is_unresolvable() {
        for command in [
            "echo 'rm -rf x' | sh",
            "printf 'rm -rf x' | sh",
            "cat payload.sh | bash",
            "sh <<< 'rm -rf x'",
            "sh ./payload.sh",
            "bash /tmp/payload.sh --version",
            "source ./payload.sh",
            ". ./payload.sh",
            "sh -Z val -c 'rm -rf x'",
            "python3 -c 'import os; os.system(\"rm -rf x\")'",
            "perl -e 'system(\"rm -rf x\")'",
            "su root",
            "sudo -s",
        ] {
            assert!(unresolvable(command), "{command}");
        }

        for command in ["sh -c 'echo hi'", "bash --version", "python3 script.py"] {
            assert!(!unresolvable(command), "{command}");
        }
    }

    #[test]
    fn a_shell_outside_the_bourne_family_still_yields_the_script_it_runs() {
        for command in [
            "csh -c 'rm -rf x'",
            "tcsh -c 'rm -rf x'",
            "/bin/csh -fc 'rm -rf x'",
            "fish -c 'rm -rf x'",
            "pwsh -c 'rm -rf x'",
            "nu -c 'rm -rf x'",
            "SH -c 'rm -rf x'",
            "ssh localhost rm -rf x",
            "ssh -p 22 -o StrictHostKeyChecking=no localhost rm -rf x",
        ] {
            assert!(reaches(command, "rm"), "{command}");
        }

        assert_eq!(programs("ENV rm -rf x"), vec!["ENV", "rm"]);
        assert_eq!(programs("bash.exe -c 'rm -rf x'"), vec!["bash.exe", "rm"]);
        assert_eq!(programs("SUDO -u root rm -rf x"), vec!["SUDO", "rm"]);
    }

    #[test]
    fn a_tool_spelled_another_way_is_still_the_same_tool() {
        for command in [
            // GNU coreutils installed beside the BSD tools.
            "gtimeout 5 rm -rf x",
            "gnice -n 5 rm -rf x",
            "gxargs rm -rf x",
            "genv -S'rm -rf x'",
            // A command glued to the option that carries it.
            "env --split-string='rm -rf x'",
            "env -S'rm -rf x'",
            "flock --command='rm -rf x' /tmp/lock",
            "runuser --command='rm -rf x' root",
            // A setting whose value is a command line the tool hands to a shell.
            "ssh -o 'ProxyCommand=rm -rf x' localhost true",
            "ssh -oProxyCommand='rm -rf x' localhost true",
        ] {
            assert!(reaches(command, "rm"), "{command}");
        }

        // A quoted phrase that merely ends in the word is not a setting.
        assert!(!reaches(
            "git commit -m 'fix the rm command=rm -rf x'",
            "rm"
        ));
    }

    #[test]
    fn an_interpreter_handed_inline_code_is_unresolvable() {
        for command in [
            "awk 'BEGIN{system(\"rm -rf x\")}'",
            "AWK 'BEGIN{system(\"rm -rf x\")}'",
            "gawk '{print $1}' file.txt",
            "mawk -f prog.awk data.txt",
            "nawk 'BEGIN{print}'",
            "busybox awk 'BEGIN{system(\"rm -rf x\")}'",
            "osascript -e 'do shell script \"rm -rf x\"'",
            "expect -c 'spawn rm -rf x'",
            "crontab -",
            "perl -pe 'system(\"rm -rf x\")'",
            "perl -nE 'system(\"rm -rf x\")'",
            "python3 -Bc 'import os'",
            "ruby -ne 'system(\"rm -rf x\")'",
            "cmd.exe /c \"rm -rf x\"",
            "pwsh.exe -Command 'rm -rf x'",
            "/usr/bin/awk 'BEGIN{system(\"rm -rf x\")}'",
            "deno eval 'Deno.exit()'",
            "vim -es -c '!rm -rf x'",
            "nvim --cmd '!rm -rf x'",
            "emacs --eval '(shell-command \"rm -rf x\")'",
            "xonsh -c 'rm -rf x'",
            "csh",
            "fish",
            "cmd /c \"rm -rf x\"",
            "pwsh -Command 'rm -rf x'",
        ] {
            assert!(unresolvable(command), "{command}");
        }
    }

    #[test]
    fn wrappers_parsed_loosely_still_surface_the_program_they_run() {
        for command in [
            "su -c 'rm -rf x'",
            "strace rm -rf x",
            "strace -o /tmp/trace rm -rf x",
            "taskset -c 0 rm -rf x",
            "watch -n1 rm -rf x",
            "unshare rm -rf x",
            "chrt -f 1 rm -rf x",
            "runuser -u root rm -rf x",
            "setpriv --reuid 0 rm -rf x",
            "parallel rm -rf ::: x",
            "script -q /dev/null -c 'rm -rf x'",
            "script -q /dev/null rm -rf x",
            "nsenter -t 1 -m rm -rf x",
            "flock /tmp/lock rm -rf x",
            "systemd-run --unit=x rm -rf x",
            "arch -x86_64 rm -rf x",
            "xargs -Z val rm -rf x",
            "strace -Z val rm -rf x",
            "su root -c 'rm -rf x'",
            "GIT_PAGER='rm -rf x' git log",
            "env GIT_PAGER='rm -rf x' git log",
            "PAGER='rm -rf x' man ls",
        ] {
            assert!(reaches(command, "rm"), "{command}");
        }
    }

    #[test]
    fn a_walk_cut_short_by_the_limits_still_reports_something_unresolvable() {
        let padded = format!("{}rm -rf x", "echo ok; ".repeat(MAX_UNITS + 16));
        assert!(unresolvable(&padded));

        let mut nested = "rm -rf x".to_string();
        for _ in 0..=MAX_DEPTH {
            nested = format!("echo $({nested})");
        }
        assert!(unresolvable(&nested));

        assert!(!unresolvable("echo ok; rm -rf x"));
    }

    #[test]
    fn unresolvable_program_names_are_reported_as_such() {
        let units = command_units("$(which rm) -rf x");
        assert!(!units[0].is_resolvable());
        assert_eq!(programs("$(which rm) -rf x"), vec!["?", "which"]);
        assert_eq!(programs("$RM -rf x"), vec!["?"]);
        assert_eq!(programs("./*.sh"), vec!["?"]);
    }

    #[test]
    fn ordinary_commands_keep_one_resolvable_unit() {
        assert_eq!(programs("cargo test -p agiworkforce-cli"), vec!["cargo"]);
        assert_eq!(programs("echo $((1 + 2))"), vec!["echo"]);
        assert_eq!(programs("git log --grep '>' --oneline"), vec!["git"]);
        assert_eq!(programs("2> /dev/null rm -rf x"), vec!["rm"]);
        assert!(command_units("cargo test")[0].is_resolvable());
    }

    #[test]
    fn speculation_never_clears_a_call_and_never_forces_a_refusal() {
        let units = command_units("sudo -u $USER cargo build");
        assert!(units
            .iter()
            .all(|unit| unit.is_resolvable() || unit.is_speculative()));
        assert!(units.iter().any(|unit| unit.is_speculative()));
        assert_eq!(programs("sudo -u $USER cargo build"), vec!["sudo", "cargo"]);
    }
}
