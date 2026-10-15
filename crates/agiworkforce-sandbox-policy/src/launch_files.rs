//! The files a server launch runs code from, named or not.
//!
//! An approval that pins only the files a command line names misses the
//! common launches that name none: `node .`, `npm run serve`,
//! `python -m package`. Each of those still loads one predictable file, and
//! this lists them so a host can pin their content with the rest. Whatever
//! those files go on to import is not listed; a host says so when it asks.
//!
//! It also keeps data out. A file or folder is code only where a tool that
//! runs code reads it as code: the command, the program an interpreter is
//! given, the value of an option that loads code or chooses the folder to
//! work in, or `.`. Anything else on the command line is data, such as a
//! database a server is pointed at or the root a file server serves, and a
//! pin on it would ask again every time the server wrote to it.
//!
//! A launch that runs from a folder a sandbox can write, with nothing in it
//! to pin, has no content an approval could cover. A host keeps such a launch
//! in the sandbox rather than approve it blind.
//!
//! A launch often starts through something else: `env A=1 node x.js`,
//! `sh -c "node x.js"`, `cmd /c npx tsx x.ts`, `npx tsx x.ts`. Each of those
//! is looked through, and what it starts is read as a launch of its own, so
//! the file at the end is pinned as if it had been named outright. That is
//! done only where the form leaves no doubt: a command a shell is given is
//! read when it is plain words and its first word is a path or a tool this
//! file knows. A launch that cannot be read that way, a shell command with
//! anything a shell expands in it or code written on the command line, is
//! marked like a file that could not be pinned, and is asked at every start.

use std::path::{Path, PathBuf};

/// Files or folders, each as the label shown for it and where it is.
type NamedPaths = Vec<(String, PathBuf)>;

const PACKAGE_MANIFEST: &str = "package.json";
/// The other files a tool that runs the folder it starts in reads what to
/// run from: Python's and Cargo's manifests, the makefile `make` reads, the
/// recipe file `just` reads, and the file `deno task` reads its tasks from.
const OTHER_FOLDER_MANIFESTS: [&str; 10] = [
    "pyproject.toml",
    "uv.lock",
    "Cargo.toml",
    "GNUmakefile",
    "makefile",
    "Makefile",
    "justfile",
    ".justfile",
    "deno.json",
    "deno.jsonc",
];
/// The settings a package runner reads from the folder it starts in before
/// it runs anything: which registry a package comes from, and for bun a
/// script to load ahead of the program.
const RUNNER_SETTINGS_FILES: [&str; 3] = [".npmrc", ".yarnrc.yml", "bunfig.toml"];
const NODE_DEFAULT_ENTRY: &str = "index.js";
const PYTHON_MAIN: &str = "__main__.py";
const PYTHON_PACKAGE: &str = "__init__.py";
const PYTHON_SOURCE_ROOTS: [&str; 2] = ["", "src"];
const LAUNCH_FOLDER: &str = ".";
const SCRIPT_RUNNERS: [&str; 4] = ["npm", "pnpm", "yarn", "bun"];
const ENTRY_TOOLS: [&str; 18] = [
    "node",
    "nodejs",
    "bun",
    "deno",
    "tsx",
    "ts-node",
    "go",
    "ruby",
    "perl",
    "php",
    "uv",
    "sh",
    "bash",
    "zsh",
    "dash",
    "ksh",
    "pwsh",
    "powershell",
];
const OTHER_CODE_TOOLS: [&str; 10] = [
    "uvx", "npm", "pnpm", "yarn", "npx", "cargo", "java", "make", "gmake", "just",
];
/// The word of its own a tool takes before the file it runs: `bun run x.ts`,
/// `tsx watch src/index.ts`.
const ENTRY_SUBCOMMANDS: [(&str, &str); 5] = [
    ("bun", "run"),
    ("deno", "run"),
    ("go", "run"),
    ("uv", "run"),
    ("tsx", "watch"),
];
const PROJECT_TOOLS: [&str; 11] = [
    "uv", "cargo", "go", "npm", "pnpm", "yarn", "bun", "deno", "make", "gmake", "just",
];
/// The options that name the file a recipe runner reads its recipes from.
const MANIFEST_OPTIONS: [(&str, &[&str]); 3] = [
    ("make", &["-f", "--file", "--makefile"]),
    ("gmake", &["-f", "--file", "--makefile"]),
    ("just", &["-f", "--justfile"]),
];
const FOLDER_OPTIONS: [&str; 7] = [
    "--directory",
    "--cwd",
    "--prefix",
    "-C",
    "--project",
    "--manifest-path",
    "--dir",
];
const CODE_OPTIONS: [&str; 8] = [
    "--require",
    "-r",
    "--import",
    "--loader",
    "--config",
    "-jar",
    "--env-file",
    "--env-file-if-exists",
];
const PROGRAM_SUFFIXES: [&str; 3] = [".exe", ".cmd", ".bat"];

const ENV_WRAPPER: &str = "env";
const ENV_PLAIN_OPTIONS: [&str; 4] = ["-", "-i", "--ignore-environment", "--"];
const ENV_VALUE_OPTIONS: [&str; 2] = ["-u", "--unset"];
const ENV_ASSIGNED_OPTION: &str = "--unset=";
const COMMAND_SHELLS: [&str; 5] = ["sh", "bash", "zsh", "dash", "ksh"];
const SHELL_LONG_VALUE_OPTIONS: [&str; 2] = ["--rcfile", "--init-file"];
const SHELL_EXEC: &str = "exec";
const WINDOWS_SHELL: &str = "cmd";
const WINDOWS_SHELL_COMMAND_OPTIONS: [&str; 2] = ["/c", "/k"];
const WINDOWS_POWERSHELL: &str = "powershell";
const POWERSHELLS: [&str; 2] = [WINDOWS_POWERSHELL, "pwsh"];
const POWERSHELL_COMMAND: &str = "-Command";
const POWERSHELL_COMMAND_OPTION: (&str, &str) = ("c", "command");
const POWERSHELL_FILE_OPTION: (&str, &str) = ("f", "file");
const POWERSHELL_UNREAD_ALIASES: [&str; 3] = ["e", "ec", "cwa"];
const POWERSHELL_UNREAD_OPTIONS: [&str; 2] = ["encodedcommand", "commandwithargs"];
const POWERSHELL_VALUE_ALIASES: [&str; 9] =
    ["ep", "wd", "w", "o", "of", "if", "ea", "config", "settings"];
const POWERSHELL_VALUE_OPTIONS: [&str; 11] = [
    "executionpolicy",
    "workingdirectory",
    "windowstyle",
    "inputformat",
    "outputformat",
    "configurationname",
    "configurationfile",
    "custompipename",
    "settingsfile",
    "psconsolefile",
    "version",
];
/// What may stand in a command a shell is given for it to be read as words
/// and nothing a shell expands, besides letters, digits, spaces and tabs.
const PLAIN_WORD_MARKS: [char; 9] = ['_', '.', '/', ':', '=', '@', '+', ',', '-'];
/// Each tool that runs a package's program or the program it is handed, with
/// the words of its own that may come before that program.
const PACKAGE_RUNNERS: [(&str, &[&str]); 8] = [
    ("npx", &[]),
    ("pnpx", &[]),
    ("bunx", &[]),
    ("uvx", &[]),
    ("npm", &["exec", "x"]),
    ("pnpm", &["dlx", "exec"]),
    ("yarn", &["dlx", "exec"]),
    ("bun", &["x"]),
];
const RUNNER_VALUE_OPTIONS: [&str; 5] = ["-p", "--package", "--from", "--with", "--python"];
/// The runners that take a shell command of their own, and the options that
/// hand them one.
const SHELL_STRING_RUNNERS: [&str; 4] = ["npx", "pnpx", "npm", "pnpm"];
const RUNNER_SHELL_OPTIONS: [&str; 3] = ["-c", "--call", "--shell-mode"];
/// The runners that run a program from the project's own installed packages
/// when one of that name is there, where they keep those, and how such a
/// program is named there on Windows as well.
const LOCAL_PROGRAM_RUNNERS: [&str; 7] = ["npx", "pnpx", "bunx", "npm", "pnpm", "yarn", "bun"];
const LOCAL_PROGRAMS: &str = "node_modules/.bin";
const LOCAL_PROGRAM_SUFFIXES: [&str; 2] = ["", ".cmd"];
/// The options that hand a tool its code on the command line, by tool.
const INLINE_CODE_OPTIONS: [(&str, &[&str]); 9] = [
    ("node", &["-e", "--eval", "-p", "--print"]),
    ("nodejs", &["-e", "--eval", "-p", "--print"]),
    ("bun", &["-e", "--eval", "-p", "--print"]),
    ("tsx", &["-e", "--eval", "-p", "--print"]),
    ("ts-node", &["-e", "--eval", "-p", "--print"]),
    ("deno", &["eval"]),
    ("ruby", &["-e"]),
    ("perl", &["-e", "-E"]),
    ("php", &["-r"]),
];
const PYTHON_INLINE_CODE_OPTIONS: [&str; 1] = ["-c"];
/// The tools that start containers, and what makes one of their launches
/// run what this machine holds: a compose file in the project, or a folder
/// of this machine given to the container. A container started from an
/// image alone runs what the image holds, as a fetched package does.
const CONTAINER_TOOLS: [&str; 2] = ["docker", "podman"];
const COMPOSE_TOOLS: [&str; 2] = ["docker-compose", "podman-compose"];
const CONTAINER_VALUE_OPTIONS: [&str; 7] = [
    "--context",
    "-c",
    "--host",
    "-H",
    "--config",
    "--log-level",
    "-l",
];
const CONTAINER_COMPOSE: &str = "compose";
const CONTAINER_RUN: &str = "run";
const CONTAINER_HOST_OPTIONS: [&str; 4] = ["-v", "--volume", "--mount", "--volumes-from"];
/// How many wrappers are looked through, one inside the other.
const WRAPPER_DEPTH: usize = 4;

const THROUGH_A_SHELL: &str = "it starts through a shell, so the code it runs cannot be checked";
const CODE_ON_THE_COMMAND_LINE: &str =
    "its code is written on the command line, so the files that code loads cannot be checked";
const WRAPPER_OPTION_NOT_READ: &str =
    "it starts through a wrapper with an option that is not read, so the code it runs cannot be checked";
const TOO_MANY_WRAPPERS: &str =
    "it starts through more wrappers than are looked through, so the code it runs cannot be checked";
const CONTAINERS_FROM_A_FILE: &str =
    "it starts containers from a compose file, so what they run cannot be checked";
const CONTAINER_GIVEN_HOST_FILES: &str =
    "it gives a container files of this machine to run from, so the code it runs cannot be checked";
const CODE_LOADING_VARIABLE: &str =
    "it sets a variable that makes the program load code its command line does not name, so that code cannot be checked";

fn program_name(command: &str) -> String {
    let name = Path::new(command)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(command)
        .to_ascii_lowercase();
    PROGRAM_SUFFIXES
        .iter()
        .find_map(|suffix| name.strip_suffix(suffix))
        .unwrap_or(&name)
        .to_string()
}

fn resolve(base: Option<&Path>, token: &str) -> Option<PathBuf> {
    let named = Path::new(token);
    if named.is_absolute() {
        Some(named.to_path_buf())
    } else {
        base.map(|base| base.join(named))
    }
}

fn label(token: &str, file: &str) -> String {
    path_label(&Path::new(token).join(file))
}

fn path_label(path: &Path) -> String {
    path.to_string_lossy()
        .replace(std::path::MAIN_SEPARATOR, "/")
}

fn python_module(args: &[String]) -> Option<&str> {
    let flag = args.iter().position(|arg| arg == "-m")?;
    args.get(flag + 1).map(String::as_str)
}

fn written_as_a_path(token: &str) -> bool {
    Path::new(token).is_absolute() || token.contains(['/', '\\']) || token == "." || token == ".."
}

fn is_python(program: &str) -> bool {
    program.starts_with("python") || program == "py"
}

fn takes_entry(program: &str) -> bool {
    is_python(program) || ENTRY_TOOLS.contains(&program)
}

fn runs_code(program: &str) -> bool {
    takes_entry(program) || OTHER_CODE_TOOLS.contains(&program)
}

/// What the wrapper at the front of a command line leads to.
enum Step {
    /// Nothing to look through: the program runs what its arguments name.
    Runs,
    /// Another command line, read in its turn, and the names of the
    /// variables the wrapper sets for it.
    Starts(String, Vec<String>, Vec<String>),
    /// The program a package runner was asked for, and its arguments.
    Package(String, Vec<String>),
    /// A form that is not read: the option that makes it so, and why.
    Unchecked(String, &'static str),
}

/// A launch with the wrappers in front of it looked through.
struct Launch {
    /// The command line as written, then what each wrapper starts.
    lines: Vec<(String, Vec<String>)>,
    /// Programs a package runner may run from the project's installed
    /// packages.
    local_programs: Vec<String>,
    /// Each variable a wrapper sets on the command line, with the wrapper
    /// that sets it: `env NODE_OPTIONS=... node x.js`.
    assignments: Vec<(String, String)>,
    /// What of the launch could not be read, as a label and the reason.
    unchecked: Option<(String, &'static str)>,
}

fn assigned_name(word: &str) -> Option<String> {
    is_assignment(word)
        .then(|| word.split_once('='))
        .flatten()
        .map(|(name, _)| name.to_string())
}

fn is_assignment(word: &str) -> bool {
    word.split_once('=').is_some_and(|(name, _)| {
        name.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_')
            && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    })
}

fn looks_through(program: &str) -> bool {
    program == ENV_WRAPPER
        || program == WINDOWS_SHELL
        || COMMAND_SHELLS.contains(&program)
        || POWERSHELLS.contains(&program)
        || PACKAGE_RUNNERS.iter().any(|(runner, _)| *runner == program)
}

/// Whether the first word of a command a shell is given names a program
/// rather than something the shell does itself: `cd`, `.`, `eval`, `trap`
/// and `call` all run or load code no command line shows.
fn read_as_a_program(word: &str, windows: bool) -> bool {
    let program = program_name(word);
    let program = program.as_str();
    let a_path = word.contains('/') || (windows && word.contains('\\'));
    !word.starts_with('-') && (a_path || runs_code(program) || looks_through(program))
}

/// `line`, a command a shell runs, as the command line it starts.
fn command_line_step(option: &str, line: &str, windows: bool) -> Step {
    let plain = line.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || c == ' '
            || c == '\t'
            || PLAIN_WORD_MARKS.contains(&c)
            || (windows && c == '\\')
    });
    let mut words = line.split([' ', '\t']).filter(|word| !word.is_empty());
    let mut program = words.next();
    let mut set = Vec::new();
    if !windows {
        while let Some(name) = program.and_then(assigned_name) {
            set.push(name);
            program = words.next();
        }
        if program == Some(SHELL_EXEC) {
            program = words.next();
        }
    }
    match program {
        Some(program) if plain && read_as_a_program(program, windows) => Step::Starts(
            program.to_string(),
            words.map(str::to_string).collect(),
            set,
        ),
        _ => Step::Unchecked(option.to_string(), THROUGH_A_SHELL),
    }
}

/// A command handed to a shell as one argument or as several.
fn command_words_step(option: &str, words: &[String], windows: bool) -> Step {
    match words {
        [] => Step::Runs,
        [line] => command_line_step(option, line, windows),
        _ if words.iter().any(|word| word.contains([' ', '\t'])) => {
            Step::Unchecked(option.to_string(), THROUGH_A_SHELL)
        }
        _ => command_line_step(option, &words.join(" "), windows),
    }
}

fn env_step(args: &[String]) -> Step {
    let mut set = Vec::new();
    let mut index = 0;
    while let Some(arg) = args.get(index).map(String::as_str) {
        index += 1;
        if ENV_VALUE_OPTIONS.contains(&arg) {
            index += 1;
        } else if ENV_PLAIN_OPTIONS.contains(&arg) || arg.starts_with(ENV_ASSIGNED_OPTION) {
            continue;
        } else if let Some(name) = assigned_name(arg) {
            set.push(name);
        } else if arg.starts_with('-') {
            return Step::Unchecked(arg.to_string(), WRAPPER_OPTION_NOT_READ);
        } else {
            return Step::Starts(arg.to_string(), args[index..].to_vec(), set);
        }
    }
    Step::Runs
}

/// A container tool run with a compose file, or with a folder of this
/// machine given to the container, runs what the project holds; with an
/// image and nothing else it does not. An option after the image belongs to
/// the program in the container, and is read as the tool's own all the same:
/// where the image stands cannot be told without every option the tool
/// takes, and reading too much only asks more often.
fn container_step(args: &[String]) -> Step {
    let mut index = 0;
    let mut subcommand = None;
    while let Some(arg) = args.get(index).map(String::as_str) {
        index += 1;
        if CONTAINER_VALUE_OPTIONS.contains(&arg) {
            index += 1;
        } else if !arg.starts_with('-') {
            subcommand = Some(arg);
            break;
        }
    }
    match subcommand {
        Some(CONTAINER_COMPOSE) => {
            Step::Unchecked(CONTAINER_COMPOSE.to_string(), CONTAINERS_FROM_A_FILE)
        }
        Some(CONTAINER_RUN) => args[index..]
            .iter()
            .map(|arg| {
                arg.split_once('=')
                    .map_or(arg.as_str(), |(option, _)| option)
            })
            .find(|option| CONTAINER_HOST_OPTIONS.contains(option))
            .map_or(Step::Runs, |option| {
                Step::Unchecked(
                    format!("{CONTAINER_RUN} {option}"),
                    CONTAINER_GIVEN_HOST_FILES,
                )
            }),
        _ => Step::Runs,
    }
}

/// A shell given a script is left to read it as its entry. Given `-c`, alone
/// or in a group of options, its first argument that is not an option is the
/// command.
fn shell_step(args: &[String]) -> Step {
    let mut command_option = None;
    let mut index = 0;
    while let Some(arg) = args.get(index).map(String::as_str) {
        index += 1;
        if arg.starts_with("--") {
            if SHELL_LONG_VALUE_OPTIONS.contains(&arg) {
                index += 1;
            }
        } else if arg.len() > 1 && arg.starts_with(['-', '+']) {
            if arg.ends_with(['o', 'O']) {
                index += 1;
            }
            if arg.starts_with('-') && arg.contains('c') {
                command_option = Some(arg);
            }
        } else {
            return match command_option {
                Some(option) => command_line_step(option, arg, false),
                None => Step::Runs,
            };
        }
    }
    Step::Runs
}

fn windows_shell_step(args: &[String]) -> Step {
    for (index, arg) in args.iter().enumerate() {
        let option = arg.to_ascii_lowercase();
        if WINDOWS_SHELL_COMMAND_OPTIONS.contains(&option.as_str()) {
            return command_words_step(arg, &args[index + 1..], true);
        }
        if WINDOWS_SHELL_COMMAND_OPTIONS
            .iter()
            .any(|attached| option.starts_with(attached))
        {
            return Step::Unchecked(arg.clone(), THROUGH_A_SHELL);
        }
        if !option.starts_with('/') {
            break;
        }
    }
    Step::Runs
}

/// PowerShell reads an option without case and by any unambiguous start of
/// its name. Windows PowerShell reads a first bare argument as a command,
/// and `pwsh` reads it as a script.
fn powershell_step(program: &str, args: &[String]) -> Step {
    let mut index = 0;
    while let Some(arg) = args.get(index) {
        index += 1;
        let Some(option) = arg.strip_prefix('-') else {
            return if program == WINDOWS_POWERSHELL {
                command_words_step(POWERSHELL_COMMAND, &args[index - 1..], true)
            } else {
                Step::Runs
            };
        };
        let option = option.to_ascii_lowercase();
        let option = option.as_str();
        let short_for = |full: &str| option.len() > 1 && full.starts_with(option);
        let named = |(alias, full): (&str, &str)| option == alias || short_for(full);
        if named(POWERSHELL_COMMAND_OPTION) {
            return command_words_step(arg, &args[index..], true);
        }
        if POWERSHELL_UNREAD_ALIASES.contains(&option)
            || POWERSHELL_UNREAD_OPTIONS.iter().any(|full| short_for(full))
        {
            return Step::Unchecked(arg.clone(), THROUGH_A_SHELL);
        }
        if named(POWERSHELL_FILE_OPTION) {
            return Step::Runs;
        }
        if POWERSHELL_VALUE_ALIASES.contains(&option)
            || POWERSHELL_VALUE_OPTIONS.iter().any(|full| short_for(full))
        {
            index += 1;
        }
    }
    Step::Runs
}

/// The option that hands `program` its code on the command line, when one
/// comes before the file the program is given. One after that file is the
/// file's own argument.
fn inline_code_option<'a>(program: &str, args: &'a [String]) -> Option<&'a str> {
    let listed = INLINE_CODE_OPTIONS
        .iter()
        .find(|(tool, _)| *tool == program);
    let options: &[&str] = match listed {
        _ if is_python(program) => &PYTHON_INLINE_CODE_OPTIONS,
        Some((_, options)) => options,
        None => &[],
    };
    let mut index = 0;
    while let Some(arg) = args.get(index).map(String::as_str) {
        index += 1;
        let option = arg.split_once('=').map_or(arg, |(option, _)| option);
        let grouped = arg.len() > 2
            && !arg.starts_with("--")
            && arg.starts_with('-')
            && arg[1..].chars().all(|c| c.is_ascii_alphabetic());
        let last_of_a_group = options
            .iter()
            .any(|known| grouped && known.len() == 2 && arg.ends_with(&known[1..]));
        if options.contains(&option) || last_of_a_group {
            return Some(option);
        }
        if FOLDER_OPTIONS.contains(&arg) || CODE_OPTIONS.contains(&arg) {
            index += 1;
        } else if !arg.starts_with('-') {
            return None;
        }
    }
    None
}

/// The program a package is run as: its name without the scope and the
/// version.
fn package_program(package: &str) -> &str {
    let name = package.rsplit('/').next().unwrap_or(package);
    name.split('@').next().unwrap_or(name)
}

/// `subcommands` are the runner's own words that may come before the
/// package. A runner that has such words and is given none of them is
/// looked through only for a tool this file reads, as in `pnpm node x.js`;
/// any other word there is a script's name.
fn runner_step(program: &str, subcommands: &[&str], args: &[String]) -> Step {
    let takes_shell_strings = SHELL_STRING_RUNNERS.contains(&program);
    let mut package_next = subcommands.is_empty();
    let mut index = 0;
    while let Some(arg) = args.get(index).map(String::as_str) {
        index += 1;
        let option = arg.split_once('=').map_or(arg, |(option, _)| option);
        if takes_shell_strings && RUNNER_SHELL_OPTIONS.contains(&option) {
            return Step::Unchecked(option.to_string(), THROUGH_A_SHELL);
        }
        if arg.starts_with('-') {
            if RUNNER_VALUE_OPTIONS.contains(&arg) || FOLDER_OPTIONS.contains(&arg) {
                index += 1;
            }
            continue;
        }
        if !package_next && subcommands.contains(&arg) {
            package_next = true;
            continue;
        }
        let name = package_program(arg);
        let a_path = written_as_a_path(arg) && !arg.starts_with('@');
        let read = takes_entry(name) || looks_through(name);
        if a_path || name.is_empty() || !(package_next || read) {
            return Step::Runs;
        }
        return Step::Package(name.to_string(), args[index..].to_vec());
    }
    Step::Runs
}

fn step(program: &str, args: &[String]) -> Step {
    if program == ENV_WRAPPER {
        return env_step(args);
    }
    if COMMAND_SHELLS.contains(&program) {
        return shell_step(args);
    }
    if program == WINDOWS_SHELL {
        return windows_shell_step(args);
    }
    if POWERSHELLS.contains(&program) {
        return powershell_step(program, args);
    }
    if CONTAINER_TOOLS.contains(&program) {
        return container_step(args);
    }
    if COMPOSE_TOOLS.contains(&program) {
        return Step::Unchecked(String::new(), CONTAINERS_FROM_A_FILE);
    }
    if let Some(option) = inline_code_option(program, args) {
        return Step::Unchecked(option.to_string(), CODE_ON_THE_COMMAND_LINE);
    }
    match PACKAGE_RUNNERS
        .iter()
        .find(|(runner, _)| *runner == program)
    {
        Some((_, subcommands)) => runner_step(program, subcommands, args),
        None => Step::Runs,
    }
}

/// The launch with each wrapper in front of it looked through, to
/// [`WRAPPER_DEPTH`] of them.
fn looked_through(command: &str, args: &[String]) -> Launch {
    let mut launch = Launch {
        lines: vec![(command.to_string(), args.to_vec())],
        local_programs: Vec::new(),
        assignments: Vec::new(),
        unchecked: None,
    };
    loop {
        let (command, args) = &launch.lines[launch.lines.len() - 1];
        let program = program_name(command);
        let program = program.as_str();
        let (inner, rest) = match step(program, args) {
            Step::Runs => break,
            Step::Unchecked(option, reason) => {
                let label = format!("{command} {option}");
                launch.unchecked = Some((label.trim_end().to_string(), reason));
                break;
            }
            Step::Package(name, rest) => {
                if LOCAL_PROGRAM_RUNNERS.contains(&program) {
                    launch.local_programs.push(name.clone());
                }
                if !(takes_entry(&name) || looks_through(&name)) {
                    break;
                }
                (name, rest)
            }
            Step::Starts(inner, rest, set) => {
                launch
                    .assignments
                    .extend(set.into_iter().map(|name| (command.clone(), name)));
                (inner, rest)
            }
        };
        if launch.lines.len() > WRAPPER_DEPTH {
            launch.unchecked = Some((inner, TOO_MANY_WRAPPERS));
            break;
        }
        launch.lines.push((inner, rest));
    }
    launch
}

/// What of a launch could not be read, as a label to show and the reason:
/// a shell command with more in it than plain words, code written on the
/// command line, a wrapper's option this file does not read, or a container
/// given the project to run from. The files such a launch runs cannot be
/// listed, so none of them is pinned.
pub fn unchecked_launch(command: &str, args: &[String]) -> Option<(String, &'static str)> {
    unchecked_launch_holding(command, args, &|_| false)
}

/// [`unchecked_launch`], which also holds each variable a wrapper sets on
/// the command line, as `env NODE_OPTIONS=... node x.js` and
/// `sh -c "BASH_ENV=x bash run.sh"` do, to `loads_code`: whether a variable
/// of that name makes a program load code from a place its command line does
/// not name. A host withholds such a variable when a server's entry sets it;
/// set on the command line it cannot be withheld, and the file it names is
/// not one this file can list, so the launch is marked. The host passes the
/// test it applies to an entry's variables, so one list decides both.
pub fn unchecked_launch_holding(
    command: &str,
    args: &[String],
    loads_code: &dyn Fn(&str) -> bool,
) -> Option<(String, &'static str)> {
    let launch = looked_through(command, args);
    launch.unchecked.or_else(|| {
        launch
            .assignments
            .iter()
            .find(|(_, name)| loads_code(name.as_str()))
            .map(|(wrapper, name)| (format!("{wrapper} {name}="), CODE_LOADING_VARIABLE))
    })
}

/// Where on a command line a tool reads an argument as code.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Position {
    /// The program an interpreter is given.
    Entry,
    /// A script runner's bare word: a script name, or a file beside it.
    ScriptWord,
    /// The value of an option that chooses the folder to work in.
    FolderOption,
    /// The value of an option that loads a file as code.
    CodeOption,
    /// `.`, the folder the launch starts in.
    Dot,
}

/// Every argument a tool that runs code reads as code. An option before the
/// program may or may not take a value, so the argument after one and the
/// next are both read as the program.
fn code_positions<'a>(program: &str, args: &'a [String]) -> Vec<(&'a str, Position)> {
    if !runs_code(program) {
        return Vec::new();
    }
    let runs_scripts = SCRIPT_RUNNERS.contains(&program);
    let mut entry_open = takes_entry(program) && python_module(args).is_none();
    let mut subcommand = ENTRY_SUBCOMMANDS
        .iter()
        .find(|(tool, _)| *tool == program)
        .map(|(_, word)| *word);
    let manifest_options: &[&str] = match MANIFEST_OPTIONS.iter().find(|(tool, _)| *tool == program)
    {
        Some((_, options)) => options,
        None => &[],
    };
    let loads_code =
        |option: &str| CODE_OPTIONS.contains(&option) || manifest_options.contains(&option);
    let mut positions = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let arg = args[index].as_str();
        let after_option = index > 0 && args[index - 1].starts_with('-');
        index += 1;
        if let Some((option, value)) = arg.split_once('=') {
            if FOLDER_OPTIONS.contains(&option) {
                positions.push((value, Position::FolderOption));
            } else if loads_code(option) {
                positions.push((value, Position::CodeOption));
            }
        } else if FOLDER_OPTIONS.contains(&arg) || loads_code(arg) {
            let position = if FOLDER_OPTIONS.contains(&arg) {
                Position::FolderOption
            } else {
                Position::CodeOption
            };
            if let Some(value) = args.get(index) {
                positions.push((value.as_str(), position));
                index += 1;
            }
        } else if arg == LAUNCH_FOLDER {
            positions.push((arg, Position::Dot));
            entry_open = false;
        } else if entry_open && !arg.starts_with('-') {
            if subcommand == Some(arg) {
                subcommand = None;
                continue;
            }
            entry_open = after_option;
            let position = if runs_scripts && !written_as_a_path(arg) {
                Position::ScriptWord
            } else {
                Position::Entry
            };
            positions.push((arg, position));
        }
    }
    positions
}

/// The folders and the files a launch names in a code position, on the
/// command line as written and on each one a wrapper in front of it starts,
/// and the programs a package runner may run from the project's installed
/// packages, which need not be there.
fn code_paths(base: Option<&Path>, launch: &Launch) -> (NamedPaths, NamedPaths) {
    let mut folders = Vec::new();
    let mut files = Vec::new();
    for (command, args) in &launch.lines {
        let (line_folders, line_files) = line_code_paths(base, command, args);
        for folder in line_folders {
            if !folders.contains(&folder) {
                folders.push(folder);
            }
        }
        for file in line_files {
            if !files.contains(&file) {
                files.push(file);
            }
        }
    }
    if let Some(base) = base {
        for program in &launch.local_programs {
            for suffix in LOCAL_PROGRAM_SUFFIXES {
                let file = format!("{program}{suffix}");
                files.push((
                    label(LOCAL_PROGRAMS, &file),
                    base.join(LOCAL_PROGRAMS).join(&file),
                ));
            }
        }
        let reads_runner_settings = launch
            .lines
            .iter()
            .any(|(command, _)| LOCAL_PROGRAM_RUNNERS.contains(&program_name(command).as_str()));
        if reads_runner_settings {
            for settings in RUNNER_SETTINGS_FILES {
                files.push((label(LAUNCH_FOLDER, settings), base.join(settings)));
            }
        }
    }
    (folders, files)
}

/// The folders and the files one command line names in a code position,
/// each as the label to show and the path it resolves to.
///
/// A program named under a folder option is read from that folder too, as
/// `uv --directory ws run server.py` reads `ws/server.py`. A tool that runs
/// the project it starts in, given nothing that resolves, runs `base`:
/// `uv run server`, `cargo run` and `npm start` name no file and still load
/// the launch folder's manifest.
fn line_code_paths(
    base: Option<&Path>,
    command: &str,
    args: &[String],
) -> (NamedPaths, NamedPaths) {
    let program = program_name(command);
    let positions = code_positions(&program, args);
    let mut folders = Vec::new();
    let mut files = Vec::new();
    for (token, position) in &positions {
        let Some(path) = resolve(base, token) else {
            continue;
        };
        let named = (token.to_string(), path.clone());
        match position {
            Position::CodeOption | Position::ScriptWord if names_a_file(&path) => files.push(named),
            Position::Entry | Position::FolderOption if names_a_file(&path) => files.push(named),
            Position::Entry | Position::FolderOption | Position::Dot if path.is_dir() => {
                folders.push(named)
            }
            _ => {}
        }
    }
    let chosen: Vec<(String, PathBuf)> = positions
        .iter()
        .filter(|(_, position)| *position == Position::FolderOption)
        .filter_map(|(token, _)| Some((token.to_string(), resolve(base, token)?)))
        .filter(|(_, folder)| folder.is_dir())
        .collect();
    for (folder_token, folder) in &chosen {
        for (token, position) in &positions {
            let inside = folder.join(token);
            if matches!(position, Position::Entry | Position::ScriptWord) && names_a_file(&inside) {
                files.push((label(folder_token, token), inside));
            }
        }
    }
    if folders.is_empty() && files.is_empty() && PROJECT_TOOLS.contains(&program.as_str()) {
        if let Some(base) = base {
            folders.push((LAUNCH_FOLDER.to_string(), base.to_path_buf()));
        }
    }
    (folders, files)
}

/// Whether something other than a folder is at `path`. A FIFO or a device
/// where a file was is still a file the launch names, so [`pin`] marks it
/// rather than the launch passing with it unpinned.
fn names_a_file(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|meta| !meta.is_dir())
}

/// Each folder the launch runs code from, as the argument that names it and
/// the folder it resolves to. A folder argument in any other place is data,
/// and a script runner's bare word is a script name: `npm run test` beside a
/// `test` folder runs the launch folder, not `test`.
pub fn launch_folders(
    base: Option<&Path>,
    command: &str,
    args: &[String],
) -> Vec<(String, PathBuf)> {
    code_paths(base, &looked_through(command, args)).0
}

/// What a launch from `folder` starts from: its manifests, the entry its
/// `package.json` names or Node's default, and Python's entry for a folder.
/// A listed file need not exist.
pub fn folder_files(
    token: &str,
    folder: &Path,
    package_entries: &dyn Fn(&Path) -> Vec<String>,
) -> Vec<(String, PathBuf)> {
    let manifest = folder.join(PACKAGE_MANIFEST);
    let mut entries = package_entries(&manifest);
    if entries.is_empty() {
        entries.push(NODE_DEFAULT_ENTRY.to_string());
    }
    std::iter::once(PACKAGE_MANIFEST.to_string())
        .chain(OTHER_FOLDER_MANIFESTS.iter().map(|name| name.to_string()))
        .chain(entries)
        .chain(std::iter::once(PYTHON_MAIN.to_string()))
        .map(|file| (label(token, &file), folder.join(&file)))
        .collect()
}

/// Each file an approval of this launch should pin, as a label to show the
/// user and the path to read: the command, the files named in a code
/// position, and the ones a launch folder or a Python module implies, for
/// the launch as written and for what each wrapper in front of it starts.
/// `base` is the folder the server starts in, when a relative name may be
/// read from it. A listed file need not exist, and a host pins only those a
/// sandbox could have written.
///
/// `package_entries` reads a `package.json` and answers the files its `main`
/// and `bin` name, relative to it; hosts already parse JSON and this crate
/// does not.
pub fn pinnable_launch_files(
    base: Option<&Path>,
    command: &str,
    args: &[String],
    package_entries: &dyn Fn(&Path) -> Vec<String>,
) -> Vec<(String, PathBuf)> {
    let launch = looked_through(command, args);
    let (folders, named) = code_paths(base, &launch);
    let mut files: Vec<(String, PathBuf)> = launch
        .lines
        .iter()
        .filter_map(|(command, _)| Some((command.clone(), resolve(base, command)?)))
        .chain(named)
        .collect();
    for (token, folder) in &folders {
        files.extend(folder_files(token, folder, package_entries));
    }
    for (command, args) in &launch.lines {
        if let (Some(base), Some(module)) = (base, python_module(args)) {
            if is_python(&program_name(command)) {
                files.extend(python_module_files(base, module));
            }
        }
    }
    files
}

/// The first folder the launch runs code from that is inside `roots`, the
/// places a sandbox can write, and holds none of the files [`folder_files`]
/// lists. Such a launch runs whatever a sandboxed process left there, and no
/// approval can pin it.
pub fn unpinnable_launch_folder(
    base: Option<&Path>,
    command: &str,
    args: &[String],
    roots: &[PathBuf],
    package_entries: &dyn Fn(&Path) -> Vec<String>,
) -> Option<String> {
    launch_folders(base, command, args)
        .into_iter()
        .find_map(|(token, folder)| {
            let resolved = std::fs::canonicalize(&folder).ok()?;
            if !crate::host_path::inside_any(&resolved, roots) {
                return None;
            }
            let pinned = folder_files(&token, &folder, package_entries)
                .iter()
                .any(|(_, file)| {
                    std::fs::canonicalize(file).is_ok_and(|file| {
                        file.is_file() && crate::host_path::inside_any(&file, roots)
                    })
                });
            (!pinned).then_some(token)
        })
}

/// What a file's entry holds when its content could not be pinned, followed
/// by the reason in words. No digest starts this way. A host must treat a
/// launch whose pins hold one as never approved before: it asks at every
/// start, says which file and why, and keeps no approval of it, because an
/// edit to that file could not be noticed.
pub const UNPINNABLE_PREFIX: &str = "unpinnable:";

/// The largest file pinned by content. The largest single-file entries
/// found installed were 14 MiB (a bundled command-line tool) and 9 MiB (a
/// compiler), and a release build of a native server is commonly a few tens;
/// the whole file is held in memory to be hashed, so the cap is a little
/// over those and no more.
pub const PINNED_FILE_SIZE_LIMIT: u64 = 64 * 1024 * 1024;

/// The most files pinned for one launch. A launch names a command, a few
/// entry files and the manifests of a folder or two; a `package.json` with a
/// long `bin` table is the only way to reach dozens.
pub const PINNED_FILE_COUNT_LIMIT: usize = 64;

/// The reason after [`UNPINNABLE_PREFIX`], or `None` for a digest.
pub fn unpinnable_reason(pinned: &str) -> Option<&str> {
    pinned.strip_prefix(UNPINNABLE_PREFIX)
}

const NOT_A_REGULAR_FILE: &str = "it is not a regular file";
const NOT_OPENED: &str = "it could not be opened, or was replaced by a link";
const NOT_READ: &str = "it could not be read";
const TOO_LARGE: &str = "it is larger than 64 MiB";
const CHANGED_WHILE_READ: &str = "it changed while it was being read";
const TOO_MANY: &str = "the launch names more than 64 files to check";

/// What one listed file contributes to the pins.
enum Pin {
    /// Nothing is there, it is a folder, or no sandboxed command could have
    /// written it: it stays out.
    Absent,
    Digest(String),
    Unpinnable(&'static str),
}

/// The digest of each file an approval of this launch pins, by the label to
/// show the user: every file [`pinnable_launch_files`] lists that exists and
/// that a sandboxed command could have written, which is one in `project`,
/// in a root a sandbox writes or in a temporary folder. A file anywhere else
/// is one no sandboxed command can change, and stays out.
///
/// A file there that cannot be pinned does not drop out, since an edit to it
/// would then go unnoticed: its entry is [`UNPINNABLE_PREFIX`] and the
/// reason. That is a file over [`PINNED_FILE_SIZE_LIMIT`], one past the
/// first [`PINNED_FILE_COUNT_LIMIT`], something that is not a regular file,
/// such as a FIFO a sandboxed command left in its place, and one that could
/// not be opened without following a link or that changed while it was read.
/// Each is opened without blocking and without following a link, and read to
/// the limit and no further, so none of them can hang the host or exhaust
/// its memory.
///
/// A launch that could not be read ([`unchecked_launch`]) has an entry of
/// that kind too, under the part of the command line that makes it so, since
/// the files it runs are not known and an edit to one could not be noticed.
///
/// `starts_in_project` says whether the server starts in `project`, so that
/// a relative name is read from it. `digest` hashes a file's content: this
/// crate carries no hash of its own, and a host passes the one its approvals
/// already use, so an approval it recorded before still matches.
///
/// What those files go on to import is not followed.
pub fn pinned_launch_file_digests(
    project: &Path,
    starts_in_project: bool,
    command: &str,
    args: &[String],
    package_entries: &dyn Fn(&Path) -> Vec<String>,
    digest: &dyn Fn(&[u8]) -> String,
) -> std::collections::BTreeMap<String, String> {
    pinned_launch_file_digests_holding(
        project,
        starts_in_project,
        command,
        args,
        package_entries,
        digest,
        &|_| false,
    )
}

/// [`pinned_launch_file_digests`], with the variables a wrapper sets on the
/// command line held to `loads_code` ([`unchecked_launch_holding`]): a
/// launch that sets one the host says loads code is marked as one whose code
/// cannot be checked.
pub fn pinned_launch_file_digests_holding(
    project: &Path,
    starts_in_project: bool,
    command: &str,
    args: &[String],
    package_entries: &dyn Fn(&Path) -> Vec<String>,
    digest: &dyn Fn(&[u8]) -> String,
    loads_code: &dyn Fn(&str) -> bool,
) -> std::collections::BTreeMap<String, String> {
    let roots = crate::host_path::untrusted_roots(&[project]);
    let mut pinned = std::collections::BTreeMap::new();
    let mut opened = 0usize;
    for (label, path) in pinnable_launch_files(
        starts_in_project.then_some(project),
        command,
        args,
        package_entries,
    ) {
        match pin(&path, &roots, &mut opened, digest) {
            Pin::Absent => {}
            Pin::Digest(digest) => {
                pinned.insert(label, digest);
            }
            Pin::Unpinnable(reason) => {
                pinned.insert(label, format!("{UNPINNABLE_PREFIX}{reason}"));
            }
        }
    }
    if let Some((label, reason)) = unchecked_launch_holding(command, args, loads_code) {
        pinned.insert(label, format!("{UNPINNABLE_PREFIX}{reason}"));
    }
    pinned
}

/// The pin for the file at `path`. `opened` counts the files a pin was
/// attempted for, to hold a launch to [`PINNED_FILE_COUNT_LIMIT`].
fn pin(
    path: &Path,
    roots: &[PathBuf],
    opened: &mut usize,
    digest: &dyn Fn(&[u8]) -> String,
) -> Pin {
    use crate::wrap::NotOpened;
    use std::io::Read;

    let canonical = match std::fs::canonicalize(path) {
        Ok(canonical) => canonical,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Pin::Absent,
        Err(_) => return Pin::Unpinnable(NOT_OPENED),
    };
    if !crate::host_path::inside_any(&canonical, roots) {
        return Pin::Absent;
    }
    let (file, before) = match crate::wrap::open_regular(&canonical, false) {
        Ok(open) => open,
        Err(NotOpened::NotRegular { is_dir: true }) => return Pin::Absent,
        Err(NotOpened::NotRegular { is_dir: false }) => return Pin::Unpinnable(NOT_A_REGULAR_FILE),
        Err(NotOpened::Unopened) => return Pin::Unpinnable(NOT_OPENED),
    };
    if *opened == PINNED_FILE_COUNT_LIMIT {
        return Pin::Unpinnable(TOO_MANY);
    }
    *opened += 1;
    if before.len() > PINNED_FILE_SIZE_LIMIT {
        return Pin::Unpinnable(TOO_LARGE);
    }
    let mut content = Vec::new();
    if (&file)
        .take(PINNED_FILE_SIZE_LIMIT + 1)
        .read_to_end(&mut content)
        .is_err()
    {
        return Pin::Unpinnable(NOT_READ);
    }
    let read = content.len() as u64;
    if read > PINNED_FILE_SIZE_LIMIT {
        return Pin::Unpinnable(TOO_LARGE);
    }
    let unchanged = file.metadata().is_ok_and(|after| {
        after.len() == before.len() && after.modified().ok() == before.modified().ok()
    });
    if read != before.len() || !unchanged {
        return Pin::Unpinnable(CHANGED_WHILE_READ);
    }
    Pin::Digest(digest(&content))
}

fn python_module_files(base: &Path, module: &str) -> Vec<(String, PathBuf)> {
    let parts: Vec<&str> = module.split('.').collect();
    if parts
        .iter()
        .any(|part| part.is_empty() || Path::new(part).components().count() != 1)
    {
        return Vec::new();
    }
    let package: PathBuf = parts.iter().collect();
    let mut relative = vec![
        package.join(PYTHON_MAIN),
        package.join(PYTHON_PACKAGE),
        package.with_extension("py"),
    ];
    if parts.len() > 1 {
        relative.push(Path::new(parts[0]).join(PYTHON_PACKAGE));
    }
    PYTHON_SOURCE_ROOTS
        .iter()
        .flat_map(|root| {
            relative.iter().map(move |file| {
                let inside = Path::new(root).join(file);
                (
                    format!("-m {module}: {}", path_label(&inside)),
                    base.join(&inside),
                )
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("agi-launch-files-{}-{name}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    fn labels(files: &[(String, PathBuf)]) -> Vec<&str> {
        files.iter().map(|(label, _)| label.as_str()).collect()
    }

    #[test]
    fn a_folder_argument_lists_its_manifest_and_the_entry_the_manifest_names() {
        let project = Scratch::new("folder");
        let files = pinnable_launch_files(Some(&project.0), "node", &args(&["."]), &|manifest| {
            assert_eq!(manifest, project.0.join(".").join("package.json"));
            vec!["dist/server.js".to_string()]
        });

        let mut expected = vec!["node".to_string(), "./package.json".to_string()];
        expected.extend(
            OTHER_FOLDER_MANIFESTS
                .iter()
                .map(|name| format!("./{name}")),
        );
        expected.extend(["./dist/server.js".to_string(), "./__main__.py".to_string()]);
        assert_eq!(labels(&files), expected);
        for manifest in [
            "./pyproject.toml",
            "./Cargo.toml",
            "./Makefile",
            "./deno.json",
        ] {
            assert!(labels(&files).contains(&manifest), "{manifest}");
        }
        let entry = files
            .iter()
            .find(|(label, _)| label == "./dist/server.js")
            .expect("the entry the manifest names");
        assert_eq!(entry.1, project.0.join(".").join("dist/server.js"));
    }

    #[test]
    fn a_folder_with_no_named_entry_lists_the_default_one() {
        let project = Scratch::new("default");
        std::fs::create_dir_all(project.0.join("server")).unwrap();
        let files = pinnable_launch_files(Some(&project.0), "node", &args(&["server"]), &|_| {
            Vec::new()
        });

        assert!(labels(&files).contains(&"server/index.js"));
    }

    #[test]
    fn a_tool_that_runs_its_project_lists_the_launch_folders_manifests() {
        let project = Scratch::new("runner");
        for (command, arguments) in [
            ("npm", vec!["run", "serve"]),
            ("/usr/local/bin/pnpm", vec!["serve"]),
            ("yarn.cmd", vec!["start"]),
            ("bun", vec!["run", "serve"]),
            ("uv", vec!["run", "server"]),
            ("cargo", vec!["run"]),
        ] {
            let files =
                pinnable_launch_files(Some(&project.0), command, &args(&arguments), &|_| {
                    Vec::new()
                });
            for manifest in ["package.json", "pyproject.toml", "uv.lock", "Cargo.toml"] {
                let listed = files
                    .iter()
                    .find(|(label, _)| *label == format!("./{manifest}"))
                    .unwrap_or_else(|| panic!("{command} lists no {manifest}"));
                assert_eq!(listed.1, project.0.join(manifest));
            }
        }
        assert!(
            launch_folders(Some(&project.0), "npx", &args(&["-y", "pkg@1.0.0"])).is_empty(),
            "a tool that fetches the package it runs does not run the launch folder"
        );
    }

    #[test]
    fn a_file_is_listed_only_where_it_is_read_as_code() {
        let project = Scratch::new("data");
        for file in ["server.js", "preload.js", "data.sqlite", "notes.log"] {
            std::fs::write(project.0.join(file), "x").unwrap();
        }
        std::fs::create_dir_all(project.0.join("ws")).unwrap();
        std::fs::write(project.0.join("ws").join("server.py"), "x").unwrap();
        let listed = |command: &str, arguments: &[&str]| -> Vec<String> {
            pinnable_launch_files(Some(&project.0), command, &args(arguments), &|_| Vec::new())
                .into_iter()
                .filter(|(_, path)| path.is_file())
                .map(|(label, _)| label)
                .collect()
        };

        assert_eq!(
            listed(
                "node",
                &[
                    "--require",
                    "./preload.js",
                    "server.js",
                    "--db",
                    "./data.sqlite",
                    "--log=notes.log"
                ]
            ),
            vec!["./preload.js", "server.js"]
        );
        assert_eq!(
            listed("./server.js", &["--db", "data.sqlite"]),
            vec!["./server.js"]
        );
        assert_eq!(listed("bun", &["run", "server.js"]), vec!["server.js"]);
        assert_eq!(
            listed("uv", &["--directory", "ws", "run", "server.py"]),
            vec!["ws/server.py"]
        );
        assert!(listed("some-server", &["data.sqlite", "notes.log"]).is_empty());
    }

    #[test]
    fn a_python_module_lists_the_files_python_would_run_for_it() {
        let project = Scratch::new("python");
        let files = pinnable_launch_files(
            Some(&project.0),
            "python3",
            &args(&["-m", "tools.server"]),
            &|_| Vec::new(),
        );
        let listed = labels(&files);

        for expected in [
            "-m tools.server: tools/server/__main__.py",
            "-m tools.server: tools/server/__init__.py",
            "-m tools.server: tools/server.py",
            "-m tools.server: tools/__init__.py",
            "-m tools.server: src/tools/server/__main__.py",
        ] {
            assert!(
                listed.contains(&expected),
                "{expected} missing from {listed:?}"
            );
        }
        assert!(
            pinnable_launch_files(
                Some(&project.0),
                "python3",
                &args(&["-m", "../escape"]),
                &|_| Vec::new()
            )
            .iter()
            .all(|(label, _)| !label.starts_with("-m")),
            "a module name is never read as a path"
        );
    }

    #[test]
    fn a_writable_folder_with_nothing_to_pin_is_named_and_one_with_a_manifest_is_not() {
        let project = Scratch::new("unpinnable");
        let code = project.0.join("ws");
        std::fs::create_dir_all(&code).unwrap();
        std::fs::write(code.join("server.py"), "print('x')").unwrap();
        let roots = vec![std::fs::canonicalize(&project.0).unwrap()];
        let launch = args(&["--directory", "ws", "run", "server"]);

        assert_eq!(
            unpinnable_launch_folder(Some(&project.0), "uv", &launch, &roots, &|_| Vec::new()),
            Some("ws".to_string())
        );
        assert_eq!(
            unpinnable_launch_folder(Some(&project.0), "uv", &launch, &[], &|_| Vec::new()),
            None,
            "a folder no sandbox can write needs no pin"
        );

        std::fs::write(code.join("uv.lock"), "version = 1").unwrap();
        assert_eq!(
            unpinnable_launch_folder(Some(&project.0), "uv", &launch, &roots, &|_| Vec::new()),
            None
        );
        let files = pinnable_launch_files(Some(&project.0), "uv", &launch, &|_| Vec::new());
        assert!(labels(&files).contains(&"ws/uv.lock"));
        assert!(labels(&files).contains(&"ws/pyproject.toml"));
    }

    #[test]
    fn a_script_name_that_matches_a_folder_is_not_read_as_one() {
        let project = Scratch::new("script-name");
        std::fs::create_dir_all(project.0.join("test")).unwrap();
        std::fs::create_dir_all(project.0.join("ws")).unwrap();
        let folders = |command: &str, arguments: &[&str]| -> Vec<String> {
            launch_folders(Some(&project.0), command, &args(arguments))
                .into_iter()
                .map(|(token, _)| token)
                .collect()
        };

        assert_eq!(folders("npm", &["run", "test"]), vec!["."]);
        assert_eq!(
            folders("npm", &["--prefix", "ws", "run", "test"]),
            vec!["ws"]
        );
        assert_eq!(folders("pnpm", &["--dir=ws", "test"]), vec!["ws"]);
        assert_eq!(folders("npm", &["run", "./test"]), vec!["."]);
        assert_eq!(folders("node", &["test"]), vec!["test"]);
        assert_eq!(folders("bun", &["run", "./test"]), vec!["./test"]);
        assert_eq!(folders("bun", &["run", "test"]), vec!["."]);
    }

    #[test]
    fn a_folder_is_code_only_where_the_tool_reads_it_as_code() {
        let project = Scratch::new("positions");
        std::fs::create_dir_all(project.0.join("srv")).unwrap();
        std::fs::create_dir_all(project.0.join("data")).unwrap();
        let root = project.0.to_string_lossy().into_owned();
        let folders = |command: &str, arguments: &[&str]| -> Vec<String> {
            launch_folders(Some(&project.0), command, &args(arguments))
                .into_iter()
                .map(|(token, _)| token)
                .collect()
        };

        assert!(
            folders(
                "npx",
                &["-y", "@modelcontextprotocol/server-filesystem", &root]
            )
            .is_empty(),
            "the folder a file server is pointed at is data"
        );
        assert!(folders("docker", &["run", "-v", &root, "image"]).is_empty());
        assert!(folders("node", &["server.js", "data"]).is_empty());
        assert_eq!(
            folders("uv", &["--directory", &root, "run", "x"]),
            vec![root.clone()]
        );
        assert_eq!(folders("deno", &["run", "srv"]), vec!["srv"]);
        assert_eq!(folders("go", &["run", "./srv"]), vec!["./srv"]);
        assert_eq!(folders("node", &["--inspect", "srv"]), vec!["srv"]);
        assert_eq!(folders("python3", &["srv", "data"]), vec!["srv"]);
        assert!(folders("python3", &["-m", "srv"]).is_empty());
        assert_eq!(
            folders("cargo", &["run", "--manifest-path", "srv"]),
            vec!["srv"]
        );
        assert_eq!(folders("npx", &["."]), vec!["."]);
    }

    #[test]
    fn a_launch_with_no_known_folder_lists_nothing_relative() {
        assert!(
            pinnable_launch_files(None, "npm", &args(&["run", "serve", "."]), &|_| Vec::new())
                .is_empty()
        );
        assert!(
            pinnable_launch_files(None, "npx", &args(&["-y", "pkg@1.0.0"]), &|_| Vec::new())
                .is_empty()
        );
    }

    fn launch_pins(
        project: &Path,
        command: &str,
        arguments: &[&str],
    ) -> std::collections::BTreeMap<String, String> {
        pinned_launch_file_digests(
            project,
            true,
            command,
            &args(arguments),
            &|_| Vec::new(),
            &|content: &[u8]| format!("{} bytes", content.len()),
        )
    }

    #[test]
    fn a_wrapper_is_looked_through_for_the_file_it_ends_up_running() {
        let project = Scratch::new("wrappers");
        for file in ["x.js", "x.ts", "x.py", "serve.sh", "start.ps1", ".env"] {
            std::fs::write(project.0.join(file), "code").unwrap();
        }
        for (command, arguments, file) in [
            ("env", vec!["A=1", "node", "x.js"], "x.js"),
            ("/usr/bin/env", vec!["node", "x.js"], "x.js"),
            (
                "env",
                vec!["-i", "-u", "HOME", "A=1", "B=2", "./serve.sh", "--stdio"],
                "./serve.sh",
            ),
            ("sh", vec!["-c", "node x.js"], "x.js"),
            ("bash", vec!["-lc", "exec node ./x.js --stdio"], "./x.js"),
            ("zsh", vec!["-c", "A=1 npx tsx x.ts"], "x.ts"),
            (
                "sh",
                vec!["-e", "-c", "./serve.sh", "ignored"],
                "./serve.sh",
            ),
            ("bash", vec!["-o", "errexit", "-c", "node x.js"], "x.js"),
            ("bash", vec!["serve.sh"], "serve.sh"),
            ("npx", vec!["tsx", "x.ts"], "x.ts"),
            ("npx", vec!["-y", "tsx@4.19.0", "x.ts"], "x.ts"),
            ("npx", vec!["-p", "typescript", "ts-node", "x.ts"], "x.ts"),
            ("pnpm", vec!["dlx", "tsx", "x.ts"], "x.ts"),
            ("pnpm", vec!["exec", "tsx", "x.ts"], "x.ts"),
            ("pnpm", vec!["node", "x.js"], "x.js"),
            ("yarn", vec!["node", "x.js"], "x.js"),
            ("npm", vec!["exec", "--", "tsx", "x.ts"], "x.ts"),
            ("bunx", vec!["tsx", "x.ts"], "x.ts"),
            ("bun", vec!["x", "tsx", "x.ts"], "x.ts"),
            ("uvx", vec!["--from", "tools", "python", "x.py"], "x.py"),
            ("cmd", vec!["/c", "npx", "tsx", "x.ts"], "x.ts"),
            ("cmd.exe", vec!["/d", "/C", "node x.js"], "x.js"),
            (
                "powershell",
                vec![
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    "node x.js",
                ],
                "x.js",
            ),
            ("powershell.exe", vec!["-nop", "node", "x.js"], "x.js"),
            ("pwsh", vec!["-c", "npx tsx x.ts"], "x.ts"),
            ("pwsh", vec!["-NoLogo", "-File", "start.ps1"], "start.ps1"),
            ("env", vec!["sh", "-c", "exec env A=1 npx tsx x.ts"], "x.ts"),
            ("tsx", vec!["watch", "x.ts"], "x.ts"),
            (
                "npx",
                vec!["tsx", "watch", "--clear-screen=false", "x.ts"],
                "x.ts",
            ),
            ("node", vec!["--env-file", ".env", "x.js"], ".env"),
            ("node", vec!["--env-file=.env", "x.js"], "x.js"),
            ("node", vec!["--env-file-if-exists=.env", "x.js"], ".env"),
        ] {
            let pinned = launch_pins(&project.0, command, &arguments);
            assert_eq!(
                pinned.get(file).map(String::as_str),
                Some("4 bytes"),
                "{command} {arguments:?} pins {pinned:?}"
            );
            assert!(
                pinned.values().all(|pin| unpinnable_reason(pin).is_none()),
                "{command} {arguments:?} was read and is still marked: {pinned:?}"
            );
            assert_eq!(unchecked_launch(command, &args(&arguments)), None);
        }
    }

    #[test]
    fn a_recipe_runner_pins_the_file_its_recipes_are_read_from() {
        let project = Scratch::new("recipes");
        for file in ["Makefile", "justfile", "deno.json", "build.mk"] {
            std::fs::write(project.0.join(file), "code").unwrap();
        }
        std::fs::create_dir_all(project.0.join("sub")).unwrap();
        std::fs::write(project.0.join("sub/Makefile"), "code").unwrap();
        for (command, arguments, file) in [
            ("make", vec!["serve"], "./Makefile"),
            ("gmake", vec!["serve"], "./Makefile"),
            ("make", vec!["-f", "build.mk", "serve"], "build.mk"),
            ("make", vec!["--file=build.mk", "serve"], "build.mk"),
            ("make", vec!["-C", "sub", "serve"], "sub/Makefile"),
            ("just", vec!["serve"], "./justfile"),
            ("deno", vec!["task", "dev"], "./deno.json"),
            ("sh", vec!["-c", "make serve"], "./Makefile"),
        ] {
            let pinned = launch_pins(&project.0, command, &arguments);
            assert_eq!(
                pinned.get(file).map(String::as_str),
                Some("4 bytes"),
                "{command} {arguments:?} pins {pinned:?}"
            );
            assert!(
                pinned.values().all(|pin| unpinnable_reason(pin).is_none()),
                "{command} {arguments:?}: {pinned:?}"
            );
        }
        assert!(
            !launch_pins(&project.0, "make", &["-f", "build.mk", "serve"])
                .contains_key("./Makefile"),
            "the makefile that was named is the one make reads"
        );
    }

    #[test]
    fn a_package_runner_pins_the_settings_it_reads_before_it_runs_anything() {
        let project = Scratch::new("runner-settings");
        for file in [".npmrc", ".yarnrc.yml", "bunfig.toml", "x.ts"] {
            std::fs::write(project.0.join(file), "code").unwrap();
        }
        for (command, arguments) in [
            ("npx", vec!["-y", "server@1.0.0"]),
            ("pnpm", vec!["dlx", "server"]),
            ("yarn", vec!["dlx", "server"]),
            ("bunx", vec!["server"]),
            ("bun", vec!["run", "x.ts"]),
            ("npm", vec!["run", "serve"]),
            ("env", vec!["A=1", "npx", "server"]),
            ("cmd", vec!["/c", "npx", "-y", "server"]),
        ] {
            let pinned = launch_pins(&project.0, command, &arguments);
            for settings in RUNNER_SETTINGS_FILES {
                assert_eq!(
                    pinned.get(&format!("./{settings}")).map(String::as_str),
                    Some("4 bytes"),
                    "{command} {arguments:?} pins {pinned:?}"
                );
            }
        }
        for (command, arguments) in [("node", vec!["x.ts"]), ("uvx", vec!["server"])] {
            let pinned = launch_pins(&project.0, command, &arguments);
            assert!(
                !pinned.contains_key("./.npmrc"),
                "{command} reads no package runner's settings: {pinned:?}"
            );
        }
    }

    #[test]
    fn a_container_is_marked_only_when_it_runs_what_this_machine_holds() {
        for (command, arguments, label, reason) in [
            (
                "docker",
                vec!["run", "-i", "--rm", "-v", "./src:/app", "image"],
                "docker run -v",
                CONTAINER_GIVEN_HOST_FILES,
            ),
            (
                "podman",
                vec!["run", "--mount=type=bind,src=.,dst=/app", "image"],
                "podman run --mount",
                CONTAINER_GIVEN_HOST_FILES,
            ),
            (
                "docker",
                vec!["--context", "remote", "run", "--volume", "a:b", "image"],
                "docker run --volume",
                CONTAINER_GIVEN_HOST_FILES,
            ),
            (
                "/usr/local/bin/docker",
                vec!["compose", "up"],
                "/usr/local/bin/docker compose",
                CONTAINERS_FROM_A_FILE,
            ),
            (
                "docker-compose",
                vec!["up"],
                "docker-compose",
                CONTAINERS_FROM_A_FILE,
            ),
        ] {
            assert_eq!(
                unchecked_launch(command, &args(&arguments)),
                Some((label.to_string(), reason)),
                "{command} {arguments:?}"
            );
        }
        for arguments in [
            vec!["run", "-i", "--rm", "ghcr.io/example/server:1.0.0"],
            vec!["run", "-i", "-e", "API_TOKEN", "--network", "host", "image"],
            vec!["exec", "-i", "running", "server"],
        ] {
            assert_eq!(
                unchecked_launch("docker", &args(&arguments)),
                None,
                "an image alone runs what the image holds: {arguments:?}"
            );
        }
    }

    #[test]
    fn a_variable_set_on_the_command_line_is_held_to_the_hosts_list() {
        let project = Scratch::new("assignments");
        std::fs::write(project.0.join("x.js"), "code").unwrap();
        let loads_code = |name: &str| matches!(name, "NODE_OPTIONS" | "BASH_ENV");
        for (command, arguments, label) in [
            (
                "env",
                vec!["NODE_OPTIONS=--require ./h.js", "node", "x.js"],
                "env NODE_OPTIONS=",
            ),
            (
                "env",
                vec!["A=1", "BASH_ENV=./h.sh", "bash", "run.sh"],
                "env BASH_ENV=",
            ),
            (
                "sh",
                vec!["-c", "A=1 NODE_OPTIONS=--inspect node x.js"],
                "sh NODE_OPTIONS=",
            ),
            (
                "cmd",
                vec!["/c", "env", "BASH_ENV=h.sh", "node", "x.js"],
                "env BASH_ENV=",
            ),
        ] {
            let marked = Some((label.to_string(), CODE_LOADING_VARIABLE));
            let arguments = args(&arguments);
            assert_eq!(
                unchecked_launch_holding(command, &arguments, &loads_code),
                marked,
                "{command} {arguments:?}"
            );
            assert_eq!(unchecked_launch(command, &arguments), None);
            let pinned = pinned_launch_file_digests_holding(
                &project.0,
                true,
                command,
                &arguments,
                &|_| Vec::new(),
                &|content: &[u8]| format!("{} bytes", content.len()),
                &loads_code,
            );
            assert_eq!(
                pinned.get(label).and_then(|pin| unpinnable_reason(pin)),
                Some(CODE_LOADING_VARIABLE),
                "{pinned:?}"
            );
        }
        let ordinary = args(&["A=1", "LOG_LEVEL=debug", "node", "x.js"]);
        assert_eq!(
            unchecked_launch_holding("env", &ordinary, &loads_code),
            None
        );
        assert_eq!(
            unchecked_launch_holding(
                "sh",
                &args(&["-c", "NODE_OPTIONS=x node x.js | tee log"]),
                &loads_code
            ),
            Some(("sh -c".to_string(), THROUGH_A_SHELL)),
            "what could not be read at all is said first"
        );
    }

    #[test]
    fn a_launch_that_cannot_be_read_is_marked_with_what_makes_it_so() {
        let project = Scratch::new("unread");
        std::fs::write(project.0.join("x.js"), "code").unwrap();
        for (command, arguments, label, reason) in [
            (
                "sh",
                vec!["-c", "node x.js && echo done"],
                "sh -c",
                THROUGH_A_SHELL,
            ),
            (
                "bash",
                vec!["-lc", "source env.sh; node x.js"],
                "bash -lc",
                THROUGH_A_SHELL,
            ),
            ("zsh", vec!["-c", "node $SERVER"], "zsh -c", THROUGH_A_SHELL),
            ("sh", vec!["-c", "node 'x.js'"], "sh -c", THROUGH_A_SHELL),
            (
                "sh",
                vec!["-c", "node x.js\nnode y.js"],
                "sh -c",
                THROUGH_A_SHELL,
            ),
            ("sh", vec!["-c", ". ./env.sh"], "sh -c", THROUGH_A_SHELL),
            ("sh", vec!["-c", "cd srv"], "sh -c", THROUGH_A_SHELL),
            ("sh", vec!["-c", "eval node x.js"], "sh -c", THROUGH_A_SHELL),
            (
                "sh",
                vec!["-c", "trap ./x.js EXIT"],
                "sh -c",
                THROUGH_A_SHELL,
            ),
            (
                "sh",
                vec!["-c", "exec -a name node x.js"],
                "sh -c",
                THROUGH_A_SHELL,
            ),
            ("sh", vec!["-c", ""], "sh -c", THROUGH_A_SHELL),
            (
                "/bin/dash",
                vec!["-ec", "true"],
                "/bin/dash -ec",
                THROUGH_A_SHELL,
            ),
            (
                "env",
                vec!["A=1", "sh", "-c", "node x.js | tee log"],
                "sh -c",
                THROUGH_A_SHELL,
            ),
            (
                "cmd",
                vec!["/c", "node x.js & del x.js"],
                "cmd /c",
                THROUGH_A_SHELL,
            ),
            (
                "cmd",
                vec!["/c", "call", "start.bat"],
                "cmd /c",
                THROUGH_A_SHELL,
            ),
            (
                "cmd",
                vec!["/c", "node", "my file.js"],
                "cmd /c",
                THROUGH_A_SHELL,
            ),
            (
                "cmd.exe",
                vec!["/K", "node %ENTRY%"],
                "cmd.exe /K",
                THROUGH_A_SHELL,
            ),
            (
                "powershell",
                vec!["-EncodedCommand", "bgBvAGQAZQA="],
                "powershell -EncodedCommand",
                THROUGH_A_SHELL,
            ),
            (
                "powershell",
                vec!["-enc", "bgBvAGQAZQA="],
                "powershell -enc",
                THROUGH_A_SHELL,
            ),
            (
                "pwsh",
                vec!["-c", "& { node x.js }"],
                "pwsh -c",
                THROUGH_A_SHELL,
            ),
            (
                "powershell",
                vec!["Invoke-Expression", "x"],
                "powershell -Command",
                THROUGH_A_SHELL,
            ),
            ("npx", vec!["-c", "node x.js"], "npx -c", THROUGH_A_SHELL),
            (
                "pnpm",
                vec!["--shell-mode", "exec", "node x.js"],
                "pnpm --shell-mode",
                THROUGH_A_SHELL,
            ),
            (
                "npm",
                vec!["exec", "--call=node x.js"],
                "npm --call",
                THROUGH_A_SHELL,
            ),
            (
                "env",
                vec!["-S", "node x.js"],
                "env -S",
                WRAPPER_OPTION_NOT_READ,
            ),
            (
                "env",
                vec!["-C", "srv", "node", "x.js"],
                "env -C",
                WRAPPER_OPTION_NOT_READ,
            ),
            (
                "node",
                vec!["-e", "require('./x.js')"],
                "node -e",
                CODE_ON_THE_COMMAND_LINE,
            ),
            (
                "node",
                vec!["--require", "./x.js", "--eval=1"],
                "node --eval",
                CODE_ON_THE_COMMAND_LINE,
            ),
            ("bun", vec!["-p", "1"], "bun -p", CODE_ON_THE_COMMAND_LINE),
            (
                "npx",
                vec!["tsx", "-e", "import('./x.ts')"],
                "tsx -e",
                CODE_ON_THE_COMMAND_LINE,
            ),
            (
                "python3",
                vec!["-c", "import server"],
                "python3 -c",
                CODE_ON_THE_COMMAND_LINE,
            ),
            (
                "python3",
                vec!["-uc", "import server"],
                "python3 -uc",
                CODE_ON_THE_COMMAND_LINE,
            ),
            (
                "deno",
                vec!["eval", "await import('./x.ts')"],
                "deno eval",
                CODE_ON_THE_COMMAND_LINE,
            ),
            (
                "perl",
                vec!["-ne", "print"],
                "perl -ne",
                CODE_ON_THE_COMMAND_LINE,
            ),
            (
                "php",
                vec!["-r", "include 'x.php';"],
                "php -r",
                CODE_ON_THE_COMMAND_LINE,
            ),
            (
                "env",
                vec!["env", "env", "env", "env", "node", "x.js"],
                "node",
                TOO_MANY_WRAPPERS,
            ),
        ] {
            let pinned = launch_pins(&project.0, command, &arguments);
            assert_eq!(
                pinned.get(label).and_then(|pin| unpinnable_reason(pin)),
                Some(reason),
                "{command} {arguments:?} pins {pinned:?}"
            );
            assert_eq!(
                unchecked_launch(command, &args(&arguments)),
                Some((label.to_string(), reason))
            );
        }
    }

    #[test]
    fn an_option_after_the_entry_or_of_another_tool_marks_nothing() {
        let project = Scratch::new("read");
        for (command, arguments) in [
            ("node", vec!["server.js", "-e", "production"]),
            ("python3", vec!["-u", "server.py", "-c", "config.yaml"]),
            ("python3", vec!["-m", "server", "-c", "config.yaml"]),
            ("node", vec!["-c", "server.js"]),
            ("node", vec!["-r", "./preload.js", "server.js"]),
            ("npx", vec!["-y", "server@1.0.0", "-c", "config.json"]),
            ("npm", vec!["run", "serve", "-c"]),
            ("uvx", vec!["-c", "constraints.txt", "server"]),
            ("bun", vec!["-c", "bunfig.toml", "run", "server.ts"]),
            ("docker", vec!["run", "-i", "-e", "A=1", "image"]),
            ("bash", vec!["start.sh", "-c", "x"]),
            ("bash", vec!["--rcfile", "-c", "start.sh"]),
            ("cmd", vec!["start.bat", "/c", "x"]),
            ("pwsh", vec!["start.ps1", "-Command", "x"]),
            ("some-server", vec!["-c", "node x.js | sh"]),
        ] {
            assert_eq!(
                unchecked_launch(command, &args(&arguments)),
                None,
                "{command} {arguments:?}"
            );
            assert!(launch_pins(&project.0, command, &arguments).is_empty());
        }
    }

    #[test]
    fn a_package_runner_lists_the_program_the_project_has_installed() {
        let project = Scratch::new("local-program");
        let installed = project.0.join("node_modules").join(".bin");
        std::fs::create_dir_all(&installed).unwrap();
        std::fs::write(installed.join("server"), "planted").unwrap();
        std::fs::write(installed.join("tsx"), "tsx").unwrap();
        std::fs::write(project.0.join("x.ts"), "code").unwrap();
        let label = |program: &str| format!("{LOCAL_PROGRAMS}/{program}");

        for (command, arguments) in [
            ("npx", vec!["-y", "@scope/server@1.0.0", "--stdio"]),
            ("npx", vec!["server"]),
            ("pnpm", vec!["exec", "server"]),
            ("yarn", vec!["dlx", "server@latest"]),
            ("bunx", vec!["server"]),
            ("sh", vec!["-c", "npx server"]),
        ] {
            let pinned = launch_pins(&project.0, command, &arguments);
            assert_eq!(
                pinned.get(&label("server")).map(String::as_str),
                Some("7 bytes"),
                "{command} {arguments:?} pins {pinned:?}"
            );
        }
        let pinned = launch_pins(&project.0, "npx", &["tsx", "x.ts"]);
        assert_eq!(pinned[&label("tsx")], "3 bytes");
        assert_eq!(pinned["x.ts"], "4 bytes");
        assert!(
            launch_pins(&project.0, "uvx", &["server"]).is_empty(),
            "a runner that keeps its packages elsewhere reads nothing from the project"
        );
        assert!(
            launch_pins(&project.0, "npm", &["run", "server"]).is_empty(),
            "a script's name is not a program"
        );
    }

    #[test]
    fn a_launch_pins_the_content_of_each_file_it_runs_that_is_there() {
        let project = Scratch::new("digests");
        std::fs::write(project.0.join("server.js"), "first").unwrap();
        let length = |content: &[u8]| format!("{} bytes", content.len());
        let pinned = |starts_in_project| {
            pinned_launch_file_digests(
                &project.0,
                starts_in_project,
                "node",
                &args(&["./server.js", "./missing.js", "data.db"]),
                &|_| Vec::new(),
                &length,
            )
        };

        let approved = pinned(true);
        assert_eq!(
            approved.into_iter().collect::<Vec<_>>(),
            vec![("./server.js".to_string(), "5 bytes".to_string())],
            "only the entry file is code, and only a file that exists has content to pin"
        );

        std::fs::write(project.0.join("server.js"), "edited since").unwrap();
        assert_eq!(pinned(true)["./server.js"], "12 bytes");
        assert!(
            pinned(false).is_empty(),
            "a relative name was read from a folder the server does not start in"
        );
    }

    fn pins(project: &Path, entry: &str) -> std::collections::BTreeMap<String, String> {
        pinned_launch_file_digests(
            project,
            true,
            "node",
            &args(&[entry]),
            &|_| Vec::new(),
            &|content: &[u8]| format!("{} bytes", content.len()),
        )
    }

    #[test]
    fn an_ordinary_file_is_pinned_by_the_digest_of_every_byte_of_it() {
        let project = Scratch::new("digest-whole");
        let content: Vec<u8> = (0..=255u8).cycle().take(200_000).collect();
        std::fs::write(project.0.join("server.js"), &content).unwrap();
        let seen = std::cell::RefCell::new(Vec::new());

        let pinned = pinned_launch_file_digests(
            &project.0,
            true,
            "node",
            &args(&["./server.js"]),
            &|_| Vec::new(),
            &|bytes: &[u8]| {
                seen.borrow_mut().push(bytes.to_vec());
                "digest".to_string()
            },
        );

        assert_eq!(pinned["./server.js"], "digest");
        assert_eq!(
            seen.into_inner(),
            vec![content],
            "the digest is of the whole file and nothing else, as it was before the reads were bounded"
        );
        assert_eq!(unpinnable_reason("digest"), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_fifo_where_a_file_was_is_marked_and_never_read() {
        let project = Scratch::new("fifo");
        let made = std::process::Command::new("mkfifo")
            .arg(project.0.join("server.js"))
            .status()
            .unwrap();
        assert!(made.success());

        let started = std::time::Instant::now();
        let pinned = pins(&project.0, "./server.js");
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        assert_eq!(
            unpinnable_reason(&pinned["./server.js"]),
            Some(NOT_A_REGULAR_FILE)
        );
    }

    #[test]
    fn a_file_over_the_size_limit_is_marked_and_not_read_into_memory() {
        let project = Scratch::new("oversized");
        let file = std::fs::File::create(project.0.join("server.js")).unwrap();
        file.set_len(PINNED_FILE_SIZE_LIMIT + 1).unwrap();
        drop(file);

        let pinned = pins(&project.0, "./server.js");
        assert_eq!(unpinnable_reason(&pinned["./server.js"]), Some(TOO_LARGE));
        assert!(TOO_LARGE.contains(&(PINNED_FILE_SIZE_LIMIT / (1024 * 1024)).to_string()));

        let file = std::fs::File::create(project.0.join("server.js")).unwrap();
        file.set_len(PINNED_FILE_SIZE_LIMIT).unwrap();
        drop(file);
        assert_eq!(
            pins(&project.0, "./server.js")["./server.js"],
            format!("{PINNED_FILE_SIZE_LIMIT} bytes"),
            "a file exactly at the limit is still pinned"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_swapped_in_after_the_path_was_resolved_is_marked() {
        let project = Scratch::new("swapped");
        let roots = crate::host_path::untrusted_roots(&[project.0.as_path()]);
        std::fs::write(project.0.join("real.js"), "real").unwrap();
        std::os::unix::fs::symlink("real.js", project.0.join("server.js")).unwrap();
        let length = |content: &[u8]| format!("{} bytes", content.len());

        // What `pin` opens is the path as it resolved. A link at that very
        // path is one put there since, and is not followed.
        let resolved_then_swapped = std::fs::canonicalize(&project.0).unwrap().join("server.js");
        let mut opened = 0;
        let swapped = matches!(
            crate::wrap::open_regular(&resolved_then_swapped, false),
            Err(crate::wrap::NotOpened::Unopened)
        );
        assert!(swapped, "the open followed a link at the last component");

        let through_the_link = pin(&project.0.join("server.js"), &roots, &mut opened, &length);
        assert!(
            matches!(through_the_link, Pin::Digest(ref digest) if digest == "4 bytes"),
            "a link that was there when the path was resolved is read as the file it names"
        );
    }

    #[test]
    fn files_past_the_count_limit_are_marked_and_not_opened() {
        let project = Scratch::new("too-many");
        let roots = crate::host_path::untrusted_roots(&[project.0.as_path()]);
        let length = |content: &[u8]| format!("{} bytes", content.len());
        let mut opened = 0;
        for index in 0..PINNED_FILE_COUNT_LIMIT + 2 {
            let file = project.0.join(format!("entry-{index}.js"));
            std::fs::write(&file, "x").unwrap();
            let pinned = pin(&file, &roots, &mut opened, &length);
            if index < PINNED_FILE_COUNT_LIMIT {
                assert!(matches!(pinned, Pin::Digest(_)), "entry {index}");
            } else {
                assert!(
                    matches!(pinned, Pin::Unpinnable(reason) if reason == TOO_MANY),
                    "entry {index}"
                );
            }
        }
        assert_eq!(opened, PINNED_FILE_COUNT_LIMIT);
        assert!(TOO_MANY.contains(&PINNED_FILE_COUNT_LIMIT.to_string()));

        let missing = pin(&project.0.join("missing.js"), &roots, &mut opened, &length);
        assert!(
            matches!(missing, Pin::Absent),
            "a file that is not there has nothing to pin"
        );
        std::fs::create_dir_all(project.0.join("folder.js")).unwrap();
        assert!(matches!(
            pin(&project.0.join("folder.js"), &roots, &mut opened, &length),
            Pin::Absent
        ));
    }
}
