//! Codex-style workspace-write sandbox: the program may read anywhere on the
//! machine, so toolchains under `$HOME` (`~/.cargo`, `~/.nvm`, shell profiles)
//! keep working, but it may write only to the workspace, the extra roots the
//! caller names and a private scratch TMPDIR.
//!
//! [`crate::wrap`] keeps the narrow profile that also confines reads; this is
//! the wider one for commands a person or agent runs in a project.

use crate::host_path::{launcher_command, verify_scratch_root};
use crate::wrap::{
    bubblewrap_prefix_hiding, bubblewrap_unprotected_paths, escape_resolved_seatbelt_path,
    host_user_git_config_paths, mach_lookup_rule, named_roots, nested_in_another_root,
    resolve_existing_prefix, seatbelt_checkout_pins, seatbelt_environment,
    seatbelt_git_config_denials, seatbelt_git_denials, seatbelt_network_rules,
    seatbelt_project_entry_rules, seatbelt_protection_rules, seatbelt_root_pin, writable_roots,
    WORKSPACE_ROOT,
};
use crate::{NetworkPolicy, SandboxBackend, SandboxPolicy, SandboxSpec};
use std::path::{Path, PathBuf};

/// What [`full_read_program`] needs. `extra_writable_roots` are absolute
/// directories outside the workspace the program may also write to, such as
/// package-manager caches.
#[derive(Debug, Clone, Copy)]
pub struct FullReadSpec<'a> {
    pub workspace_dir: &'a Path,
    pub extra_writable_roots: &'a [PathBuf],
    pub network_policy: NetworkPolicy,
}

/// Where a user keeps credentials, relative to the home directory: keys,
/// cloud and cluster logins, registry and forge tokens, git's credential
/// stores, the macOS keychains, shell histories, which hold whatever was once
/// typed or pasted at a prompt, and browser profiles, which hold session
/// cookies and saved passwords, under the names macOS and Linux give them. A
/// program that both reads anywhere and reaches the internet, such as an MCP
/// server, could otherwise send any of them out.
///
/// The folders of other coding agents are named file by file, not whole:
/// `~/.claude` and `~/.codex` also hold the programs, plugins and skills
/// those tools install, and a sandboxed command that lives there has to be
/// able to start. What is named is what holds a sign-in or what was said: the
/// credential file, the settings and configuration that carry keys for tool
/// servers, transcripts and prompt history, saved copies of the
/// configuration, pasted text and attachments, and the snapshots of a
/// shell's environment. [`credential_copies`] adds the files whose names
/// change from one version to the next.
///
/// The rest are the files where command-line tools keep a login, by the
/// name each tool gives it on macOS and on Linux: forges and their helpers,
/// hosting and database platforms, secret managers, package managers' own
/// configuration where a registry token sits, infrastructure tools, tunnels,
/// model hubs, a database client's password file, and the desktop chat apps'
/// own data. Each is the file itself, or the narrowest folder that holds
/// nothing a program runs from, so a tool installed beside its login still
/// starts. `~/.zsh_sessions` is where macOS keeps each terminal window's own
/// shell history, and `~/.cursor/mcp.json` is an editor's list of tool
/// servers with the tokens they are started with.
const CREDENTIAL_PATHS: [&str; 111] = [
    ".ssh",
    ".aws",
    ".gnupg",
    ".config/gcloud",
    ".azure",
    ".kube",
    ".docker/config.json",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    ".config/git/credentials",
    "Library/Keychains",
    ".config/gh",
    ".cargo/credentials.toml",
    ".cargo/credentials",
    ".claude.json",
    ".claude/.credentials.json",
    ".claude/settings.json",
    ".claude/projects",
    ".claude/sessions",
    ".claude/history.jsonl",
    ".claude/backups",
    ".claude/paste-cache",
    ".claude/shell-snapshots",
    ".claude/session-env",
    ".codex/auth.json",
    ".codex/config.toml",
    ".codex/sessions",
    ".codex/history.jsonl",
    ".codex/session_index.jsonl",
    ".codex/attachments",
    ".codex/shell_snapshots",
    ".zsh_history",
    ".zsh_sessions",
    ".bash_history",
    ".cursor/mcp.json",
    "Library/Application Support/Google/Chrome",
    "Library/Application Support/Chromium",
    "Library/Application Support/Microsoft Edge",
    "Library/Application Support/BraveSoftware",
    "Library/Application Support/Arc",
    "Library/Application Support/Firefox",
    "Library/Safari",
    "Library/Cookies",
    "Library/Containers/com.apple.Safari",
    ".config/google-chrome",
    ".config/chromium",
    ".config/microsoft-edge",
    ".config/BraveSoftware",
    ".mozilla",
    ".local/share/opencode/auth.json",
    ".local/state/gh",
    ".config/glab-cli",
    ".config/hub",
    ".config/github-copilot",
    "Library/Application Support/com.vercel.cli/auth.json",
    ".local/share/com.vercel.cli/auth.json",
    "Library/Preferences/netlify/config.json",
    ".config/netlify/config.json",
    ".fly/config.yml",
    ".supabase/access-token",
    ".railway/config.json",
    ".doppler",
    ".config/op",
    ".op",
    ".config/stripe/config.toml",
    ".config/neonctl/credentials.json",
    ".config/doctl/config.yaml",
    ".config/pnpm/rc",
    "Library/Preferences/pnpm/rc",
    ".yarnrc.yml",
    ".yarnrc",
    ".bunfig.toml",
    ".config/pip/pip.conf",
    ".pip/pip.conf",
    ".config/pypoetry/auth.toml",
    "Library/Application Support/pypoetry/auth.toml",
    ".gem/credentials",
    ".m2/settings.xml",
    ".gradle/gradle.properties",
    ".composer/auth.json",
    ".config/composer/auth.json",
    ".config/helm/registry/config.json",
    "Library/Preferences/helm/registry/config.json",
    ".terraform.d/credentials.tfrc.json",
    ".terraformrc",
    ".pulumi/credentials.json",
    ".config/ngrok/ngrok.yml",
    "Library/Application Support/ngrok/ngrok.yml",
    ".ngrok2/ngrok.yml",
    ".cloudflared",
    ".wrangler/config/default.toml",
    ".config/.wrangler/config/default.toml",
    "Library/Preferences/.wrangler/config/default.toml",
    ".config/configstore/firebase-tools.json",
    ".expo/state.json",
    ".sentryclirc",
    ".cache/huggingface/token",
    ".cache/huggingface/stored_tokens",
    ".huggingface/token",
    ".ollama/id_ed25519",
    ".vault-token",
    ".config/rclone/rclone.conf",
    ".boto",
    ".s3cfg",
    ".pgpass",
    ".my.cnf",
    "Library/Application Support/Claude",
    "Library/Application Support/com.openai.chat",
    "Library/Application Support/com.openai.atlas",
];

/// The credential locations under `home`, for
/// [`full_read_program_guarding`]. A host adds its own data and config
/// directories, which hold its tokens.
pub fn credential_paths(home: &Path) -> Vec<PathBuf> {
    CREDENTIAL_PATHS
        .iter()
        .map(|path| home.join(path))
        .chain(credential_copies(home))
        .collect()
}

/// Credential files under `home` whose names are not fixed, found as they
/// are now: the copies a tool keeps beside `~/.claude.json` under that name
/// with a further extension, and the databases at the top of `~/.codex`,
/// which hold its threads, memories and logs and carry a version in their
/// names. One that appears after a program has started is not covered until
/// the next launch.
fn credential_copies(home: &Path) -> Vec<PathBuf> {
    let listed = |folder: PathBuf, names: fn(&str) -> bool| -> Vec<PathBuf> {
        let Ok(entries) = std::fs::read_dir(&folder) else {
            return Vec::new();
        };
        let mut found: Vec<PathBuf> = entries
            .flatten()
            .filter(|entry| entry.file_name().to_str().is_some_and(names))
            .map(|entry| entry.path())
            .collect();
        found.sort();
        found
    };
    let mut copies = listed(home.to_path_buf(), |name| {
        name.strip_prefix(".claude.json")
            .is_some_and(|rest| rest.starts_with('.'))
    });
    copies.extend(listed(home.join(".codex"), |name| name.contains(".sqlite")));
    copies
}

/// Seatbelt rules that stop reads of `unreadable`. SBPL is last-match-wins,
/// so they follow `(allow file-read*)`. A root in `readable` that sits inside
/// one of them, such as a workspace in the host's own data directory, is
/// readable again, and so is the metadata of each folder between the two:
/// without it a program cannot change into the root or resolve a path there.
fn seatbelt_read_denials(unreadable: &[PathBuf], readable: &[PathBuf]) -> Result<String, String> {
    let mut rules = String::new();
    let mut denied = Vec::new();
    for path in unreadable {
        let resolved = resolve_existing_prefix(path);
        let escaped = escape_resolved_seatbelt_path(path, &resolved)?;
        rules.push_str(&format!("(deny file-read* (subpath \"{escaped}\"))\n"));
        denied.push(resolved);
    }
    for root in readable {
        let Some(inside) = denied.iter().find(|denied| root.starts_with(denied)) else {
            continue;
        };
        for folder in root
            .ancestors()
            .skip(1)
            .take_while(|folder| folder.starts_with(inside))
        {
            let escaped = escape_resolved_seatbelt_path(folder, folder)?;
            rules.push_str(&format!(
                "(allow file-read-metadata (literal \"{escaped}\"))\n"
            ));
        }
        let escaped = escape_resolved_seatbelt_path(root, root)?;
        rules.push_str(&format!("(allow file-read* (subpath \"{escaped}\"))\n"));
    }
    Ok(rules)
}

fn write_policy(spec: &FullReadSpec<'_>) -> SandboxPolicy {
    SandboxPolicy::WorkspaceWrite {
        writable_roots: spec.extra_writable_roots.to_vec(),
    }
}

pub fn full_read_seatbelt_profile(
    spec: &FullReadSpec<'_>,
    scratch_dir: &Path,
) -> Result<String, String> {
    let policy = write_policy(spec);
    let narrow = SandboxSpec {
        policy: &policy,
        workspace_dir: spec.workspace_dir,
        network_policy: spec.network_policy,
        protected_paths: &[],
    };
    read_anywhere_profile(&narrow, scratch_dir)
}

/// The Seatbelt profile for a command an agent runs in a project: it reads
/// anywhere but `unreadable`, so a toolchain installed under the home folder
/// starts, and writes what `spec` lets it write and nothing `spec` protects.
/// The profile that also confines reads ([`crate::wrap::seatbelt_profile`])
/// cannot run `~/.cargo/bin/rustfmt`, or anything rustup, nvm or pyenv
/// installed. A workspace nothing may write gets no write rule but the
/// scratch directory's; one inside an unreadable folder, such as a checkout
/// kept in the host's own data folder, stays readable.
pub fn command_seatbelt_profile(
    spec: &SandboxSpec<'_>,
    unreadable: &[PathBuf],
    scratch_dir: &Path,
) -> Result<String, String> {
    let mut profile = read_anywhere_profile(spec, scratch_dir)?;
    profile.push_str(&seatbelt_protection_rules(spec.protected_paths)?);
    let mut readable: Vec<PathBuf> = writable_roots(spec)?
        .into_iter()
        .map(|root| root.resolved)
        .collect();
    let workspace = resolve_existing_prefix(spec.workspace_dir);
    if !readable.contains(&workspace) {
        readable.push(workspace);
    }
    readable.push(verify_scratch_root(scratch_dir)?);
    profile.push_str(&seatbelt_read_denials(unreadable, &readable)?);
    Ok(profile)
}

/// The profile both of those start from: every read allowed, and the writes
/// of `narrow`.
fn read_anywhere_profile(narrow: &SandboxSpec<'_>, scratch_dir: &Path) -> Result<String, String> {
    let network_rules = seatbelt_network_rules(narrow.network_policy);
    let mach_rules = mach_lookup_rule(narrow.network_policy);

    let mut write_rules = String::from(
        "(allow file-write* (literal \"/dev/null\") (literal \"/dev/tty\") (literal \"/dev/dtracehelper\"))\n",
    );
    let scratch = escape_resolved_seatbelt_path(scratch_dir, &verify_scratch_root(scratch_dir)?)?;
    write_rules.push_str(&format!("(allow file-write* (subpath \"{scratch}\"))\n"));
    let mut pins = seatbelt_root_pin(&scratch);
    let roots = writable_roots(narrow)?;
    let mut entry_rules = String::new();
    for (position, root) in roots.iter().enumerate() {
        let escaped = escape_resolved_seatbelt_path(&root.named, &root.resolved)?;
        pins.push_str(&seatbelt_root_pin(&escaped));
        if !nested_in_another_root(root, &roots) {
            write_rules.push_str(&format!("(allow file-write* (subpath \"{escaped}\"))\n"));
        }
        if position == WORKSPACE_ROOT {
            entry_rules = seatbelt_project_entry_rules(&root.resolved.to_string_lossy());
        }
    }
    pins.push_str(&seatbelt_checkout_pins(&named_roots(&roots))?);
    write_rules.push_str(&entry_rules);
    write_rules.push_str(&pins);
    write_rules.push_str(&seatbelt_git_denials(&named_roots(&roots))?);
    write_rules.push_str(&seatbelt_git_config_denials(&host_user_git_config_paths()));

    Ok(format!(
        r#"(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))
(allow sysctl-read)
{mach_rules}(allow system-socket)
(allow ipc-posix-sem)
(allow ipc-posix-shm)
(allow pseudo-tty)
(allow file-ioctl (literal "/dev/ptmx") (regex #"^/dev/ttys[0-9]+"))
(allow file-read*)
{network_rules}{write_rules}"#,
        mach_rules = mach_rules,
        network_rules = network_rules,
        write_rules = write_rules,
    ))
}

/// Rewrite a program and its arguments to run under the full-read sandbox.
/// Bubblewrap already binds `/` read-only, so on Linux only the writable binds
/// differ from the narrow profile. Seatbelt needs `scratch_dir`, which becomes
/// the program's TMPDIR. The command is the launcher's absolute path
/// ([`crate::sandbox_launcher`]); without one this fails.
pub fn full_read_program(
    backend: SandboxBackend,
    spec: &FullReadSpec<'_>,
    scratch_dir: Option<&Path>,
    program: &str,
    args: &[String],
) -> Result<(String, Vec<String>), String> {
    let wrapped = full_read_args(backend, spec, scratch_dir, program, args)?;
    Ok((launcher_command(backend)?, wrapped))
}

/// The launcher's arguments for [`full_read_program`].
fn full_read_args(
    backend: SandboxBackend,
    spec: &FullReadSpec<'_>,
    scratch_dir: Option<&Path>,
    program: &str,
    args: &[String],
) -> Result<Vec<String>, String> {
    match backend {
        SandboxBackend::MacosSeatbelt => {
            let scratch_dir = scratch_dir.ok_or_else(|| {
                "Seatbelt execution requires a private scratch directory".to_string()
            })?;
            let mut wrapped = vec![
                "-p".to_string(),
                full_read_seatbelt_profile(spec, scratch_dir)?,
                "/usr/bin/env".to_string(),
            ];
            wrapped.extend(
                seatbelt_environment(scratch_dir)?
                    .into_iter()
                    .map(|(name, value)| format!("{name}={value}")),
            );
            wrapped.push(program.to_string());
            wrapped.extend(args.iter().cloned());
            Ok(wrapped)
        }
        SandboxBackend::LinuxBubblewrap => {
            protected_args(backend, spec, &[], &[], None, program, args).map(|(wrapped, _)| wrapped)
        }
    }
}

/// A program rewritten by [`full_read_program_protecting`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtectedProgram {
    pub command: String,
    pub args: Vec<String>,
    /// Protected paths the sandbox could not keep read-only, for the caller to
    /// log: on bubblewrap, a path that does not exist and sits directly in a
    /// writable root has nothing to bind over. No placeholder is created for
    /// it, since an empty file where a loader expects JSON breaks the loader.
    pub unprotected: Vec<PathBuf>,
}

/// [`full_read_program`] with `protected_paths` kept read-only even when they
/// sit inside a writable root, so a sandboxed process cannot rewrite the hook
/// or server configuration that decides what runs next. Seatbelt is
/// last-match-wins, so the denials follow the allows, and it names a path
/// whether it exists yet or not; bubblewrap applies later mounts over earlier
/// ones, so the read-only binds follow the writable binds.
pub fn full_read_program_protecting(
    backend: SandboxBackend,
    spec: &FullReadSpec<'_>,
    protected_paths: &[PathBuf],
    scratch_dir: Option<&Path>,
    program: &str,
    args: &[String],
) -> Result<ProtectedProgram, String> {
    full_read_program_guarding(
        backend,
        spec,
        protected_paths,
        &[],
        scratch_dir,
        program,
        args,
    )
}

/// [`full_read_program_protecting`] for a program that must not read
/// `unreadable` either, such as [`credential_paths`]. The full-read sandbox
/// reads everywhere else, so a program that also keeps the network, as an
/// MCP server does, is given no key, token or keychain to send out. A
/// writable root inside one of them stays readable.
pub fn full_read_program_guarding(
    backend: SandboxBackend,
    spec: &FullReadSpec<'_>,
    protected_paths: &[PathBuf],
    unreadable: &[PathBuf],
    scratch_dir: Option<&Path>,
    program: &str,
    args: &[String],
) -> Result<ProtectedProgram, String> {
    let (wrapped, unprotected) = protected_args(
        backend,
        spec,
        protected_paths,
        unreadable,
        scratch_dir,
        program,
        args,
    )?;
    Ok(ProtectedProgram {
        command: launcher_command(backend)?,
        args: wrapped,
        unprotected,
    })
}

/// The launcher's arguments for [`full_read_program_protecting`], with the
/// protected paths it could not keep read-only.
fn protected_args(
    backend: SandboxBackend,
    spec: &FullReadSpec<'_>,
    protected_paths: &[PathBuf],
    unreadable: &[PathBuf],
    scratch_dir: Option<&Path>,
    program: &str,
    args: &[String],
) -> Result<(Vec<String>, Vec<PathBuf>), String> {
    match backend {
        SandboxBackend::MacosSeatbelt => {
            let mut wrapped = full_read_args(backend, spec, scratch_dir, program, args)?;
            let mut rules = seatbelt_protection_rules(protected_paths)?;
            if !unreadable.is_empty() {
                let policy = write_policy(spec);
                let narrow = SandboxSpec {
                    policy: &policy,
                    workspace_dir: spec.workspace_dir,
                    network_policy: spec.network_policy,
                    protected_paths: &[],
                };
                let mut readable: Vec<PathBuf> = writable_roots(&narrow)?
                    .into_iter()
                    .map(|root| root.resolved)
                    .collect();
                if let Some(scratch_dir) = scratch_dir {
                    readable.push(verify_scratch_root(scratch_dir)?);
                }
                rules.push_str(&seatbelt_read_denials(unreadable, &readable)?);
            }
            let profile = wrapped
                .get_mut(1)
                .ok_or_else(|| "Seatbelt profile is missing".to_string())?;
            profile.push_str(&rules);
            Ok((wrapped, Vec::new()))
        }
        SandboxBackend::LinuxBubblewrap => {
            let policy = write_policy(spec);
            let narrow = SandboxSpec {
                policy: &policy,
                workspace_dir: spec.workspace_dir,
                network_policy: spec.network_policy,
                protected_paths,
            };
            let mut wrapped = bubblewrap_prefix_hiding(&narrow, unreadable)?;
            wrapped.push(program.to_string());
            wrapped.extend(args.iter().cloned());
            Ok((wrapped, bubblewrap_unprotected_paths(&narrow)?))
        }
    }
}

// Seatbelt and bubblewrap exist only on Unix, and these tests spell Unix
// paths that are not absolute on Windows.
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn spec<'a>(roots: &'a [PathBuf], network_policy: NetworkPolicy) -> FullReadSpec<'a> {
        FullReadSpec {
            workspace_dir: Path::new("/Users/someone/project"),
            extra_writable_roots: roots,
            network_policy,
        }
    }

    #[test]
    fn seatbelt_reads_everywhere_and_writes_only_to_named_roots() {
        let roots = [PathBuf::from("/Users/someone/.npm")];
        let args = full_read_args(
            SandboxBackend::MacosSeatbelt,
            &spec(&roots, NetworkPolicy::AllowExternal),
            Some(Path::new("/private/tmp/agi-scratch")),
            "/bin/bash",
            &["-lc".to_string(), "cargo test".to_string()],
        )
        .expect("wrap");

        let profile = &args[1];
        assert!(profile.contains("(deny default)"));
        assert!(profile.contains("(allow file-read*)\n"));
        assert!(profile.contains("(allow file-write* (subpath \"/Users/someone/project\"))"));
        assert!(profile.contains("(allow file-write* (subpath \"/Users/someone/.npm\"))"));
        assert!(profile.contains("(allow file-write* (subpath \"/private/tmp/agi-scratch\"))"));
        assert!(!profile.contains("(subpath \"/Users/someone\"))"));
        assert!(profile.contains("(deny network-outbound (remote ip \"localhost:*\"))"));
        let launched: Vec<&String> = args[2..]
            .iter()
            .filter(|arg| !arg.starts_with("DEVELOPER_DIR="))
            .collect();
        assert_eq!(
            launched,
            [
                "/usr/bin/env",
                "TMPDIR=/private/tmp/agi-scratch",
                "/bin/bash",
                "-lc",
                "cargo test",
            ]
        );
    }

    #[test]
    fn a_guarded_program_cannot_read_credentials_and_still_reads_its_own_root() {
        let workspace = Path::new("/Users/someone/.app/workspace");
        let spec = FullReadSpec {
            workspace_dir: workspace,
            extra_writable_roots: &[],
            network_policy: NetworkPolicy::AllowExternal,
        };
        let unreadable = [
            PathBuf::from("/Users/someone/.ssh"),
            PathBuf::from("/Users/someone/.npmrc"),
            PathBuf::from("/Users/someone/.app"),
        ];
        let (args, _) = protected_args(
            SandboxBackend::MacosSeatbelt,
            &spec,
            &[],
            &unreadable,
            Some(Path::new("/private/tmp/agi-scratch")),
            "/usr/bin/env",
            &["node".to_string()],
        )
        .expect("wrap");
        let profile = &args[1];
        let at = |rule: &str| {
            profile
                .find(rule)
                .unwrap_or_else(|| panic!("{rule} is missing from:\n{profile}"))
        };

        let read_everywhere = at("(allow file-read*)\n");
        for denied in ["/Users/someone/.ssh", "/Users/someone/.npmrc"] {
            assert!(
                at(&format!("(deny file-read* (subpath \"{denied}\"))")) > read_everywhere,
                "last match wins, so the denial follows the allow"
            );
        }
        let app_denied = at("(deny file-read* (subpath \"/Users/someone/.app\"))");
        assert!(
            at("(allow file-read-metadata (literal \"/Users/someone/.app\"))") > app_denied,
            "the folder above the workspace can be entered, not listed"
        );
        assert!(at("(allow file-read* (subpath \"/Users/someone/.app/workspace\"))") > app_denied);
        assert!(!profile.contains("(allow file-read* (subpath \"/Users/someone/.app\"))"));
        assert!(profile.contains("(allow network-outbound)"));
    }

    #[test]
    fn a_command_reads_anywhere_but_the_credentials_and_writes_what_its_policy_lets_it() {
        let workspace = Path::new("/Users/someone/.app/workspace");
        let unreadable = [
            PathBuf::from("/Users/someone/.ssh"),
            PathBuf::from("/Users/someone/.app"),
        ];
        let protected = [workspace.join(".mcp.json")];
        let policy = SandboxPolicy::WorkspaceWrite {
            writable_roots: vec![PathBuf::from("/Users/someone/.npm")],
        };
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &protected,
        };
        let scratch = Path::new("/private/tmp/agi-scratch");
        let profile = command_seatbelt_profile(&spec, &unreadable, scratch).expect("profile");
        let at = |rule: &str| {
            profile
                .find(rule)
                .unwrap_or_else(|| panic!("{rule} is missing from:\n{profile}"))
        };

        let read_everywhere = at("(allow file-read*)\n");
        assert!(at("(deny file-read* (subpath \"/Users/someone/.ssh\"))") > read_everywhere);
        let app_denied = at("(deny file-read* (subpath \"/Users/someone/.app\"))");
        assert!(at("(allow file-read* (subpath \"/Users/someone/.app/workspace\"))") > app_denied);
        assert_eq!(
            profile
                .matches("(allow file-read* (subpath \"/Users/someone/.app/workspace\"))")
                .count(),
            1
        );
        let writes = at("(allow file-write* (subpath \"/Users/someone/.app/workspace\"))");
        at("(allow file-write* (subpath \"/Users/someone/.npm\"))");
        assert!(
            at("(deny file-write* (subpath \"/Users/someone/.app/workspace/.mcp.json\"))") > writes
        );
        assert!(crate::wrap::entry_rule(
            &profile,
            "(deny file-write* (regex \"^/Users/someone/[.]app/workspace/",
            "[.][hH][uU][sS][kK][yY](/.*)?",
        )
        .is_some_and(|denied| denied > writes));
        assert!(!profile.contains("network-outbound"));

        let read_only = SandboxSpec {
            policy: &SandboxPolicy::ReadOnly,
            ..spec
        };
        let profile = command_seatbelt_profile(&read_only, &unreadable, scratch).expect("profile");
        assert!(
            !profile.contains("(allow file-write* (subpath \"/Users/someone"),
            "a workspace nothing may write was given a write rule:\n{profile}"
        );
        assert!(profile.contains("(allow file-write* (subpath \"/private/tmp/agi-scratch\"))"));
        let app_denied = profile
            .find("(deny file-read* (subpath \"/Users/someone/.app\"))")
            .expect("credential folder denied");
        assert!(
            profile
                .find("(allow file-read* (subpath \"/Users/someone/.app/workspace\"))")
                .is_some_and(|readable| readable > app_denied),
            "a workspace inside an unreadable folder could not be read"
        );
    }

    #[test]
    fn a_program_that_is_not_guarded_reads_as_before() {
        let (args, _) = protected_args(
            SandboxBackend::MacosSeatbelt,
            &spec(&[], NetworkPolicy::Deny),
            &[],
            &[],
            Some(Path::new("/private/tmp/agi-scratch")),
            "/bin/bash",
            &[],
        )
        .expect("wrap");
        assert!(!args[1].contains("deny file-read"));
    }

    #[test]
    fn the_credential_locations_are_named_under_the_home_folder() {
        let paths = credential_paths(Path::new("/Users/someone"));
        assert_eq!(paths.len(), CREDENTIAL_PATHS.len());
        for expected in [
            "/Users/someone/.ssh",
            "/Users/someone/.aws",
            "/Users/someone/.docker/config.json",
            "/Users/someone/Library/Keychains",
            "/Users/someone/.config/gh",
            "/Users/someone/.cargo/credentials.toml",
            "/Users/someone/.config/git/credentials",
            "/Users/someone/.git-credentials",
            "/Users/someone/.claude.json",
            "/Users/someone/.claude/.credentials.json",
            "/Users/someone/.claude/projects",
            "/Users/someone/.claude/history.jsonl",
            "/Users/someone/.codex/auth.json",
            "/Users/someone/.codex/sessions",
            "/Users/someone/.codex/history.jsonl",
            "/Users/someone/.local/share/opencode/auth.json",
            "/Users/someone/.local/state/gh",
            "/Users/someone/.config/glab-cli",
            "/Users/someone/Library/Application Support/com.vercel.cli/auth.json",
            "/Users/someone/.fly/config.yml",
            "/Users/someone/.config/stripe/config.toml",
            "/Users/someone/.terraform.d/credentials.tfrc.json",
            "/Users/someone/.cache/huggingface/token",
            "/Users/someone/.ollama/id_ed25519",
            "/Users/someone/.pgpass",
            "/Users/someone/.zsh_history",
            "/Users/someone/.zsh_sessions",
            "/Users/someone/.bash_history",
            "/Users/someone/.cursor/mcp.json",
            "/Users/someone/Library/Application Support/Google/Chrome",
            "/Users/someone/Library/Application Support/Chromium",
            "/Users/someone/Library/Application Support/Microsoft Edge",
            "/Users/someone/Library/Application Support/BraveSoftware",
            "/Users/someone/Library/Application Support/Arc",
            "/Users/someone/Library/Application Support/Firefox",
            "/Users/someone/Library/Cookies",
            "/Users/someone/.mozilla",
        ] {
            assert!(paths.contains(&PathBuf::from(expected)), "{expected}");
        }
        let mut distinct = paths.clone();
        distinct.sort();
        distinct.dedup();
        assert_eq!(distinct.len(), paths.len(), "a location is listed twice");
        for whole in [
            "/Users/someone/.claude",
            "/Users/someone/.codex",
            "/Users/someone/.local/share/opencode",
            "/Users/someone/.ollama",
            "/Users/someone/.fly",
            "/Users/someone/.expo",
            "/Users/someone/.local",
            "/Users/someone/.config",
            "/Users/someone/.cache",
        ] {
            assert!(
                !paths.contains(&PathBuf::from(whole)),
                "{whole} holds programs and plugins as well as credentials"
            );
        }
    }

    #[test]
    fn credential_files_with_changing_names_are_found_as_they_are_now() {
        let home = scratch_tree("credential-copies");
        std::fs::create_dir_all(home.join(".codex/packages")).unwrap();
        for file in [
            ".claude.json",
            ".claude.json.backup.1",
            ".claude.jsonl-unrelated",
            ".codex/state_5.sqlite",
            ".codex/state_5.sqlite-wal",
            ".codex/version.json",
        ] {
            std::fs::write(home.join(file), "").unwrap();
        }

        let paths = credential_paths(&home);
        for hidden in [
            ".claude.json",
            ".claude.json.backup.1",
            ".codex/state_5.sqlite",
            ".codex/state_5.sqlite-wal",
            ".codex/auth.json",
        ] {
            assert!(paths.contains(&home.join(hidden)), "{hidden} is readable");
        }
        for readable in [
            ".claude.jsonl-unrelated",
            ".codex/version.json",
            ".codex/packages",
            ".codex",
        ] {
            assert!(
                !paths.contains(&home.join(readable)),
                "{readable} is hidden from a program that may live there"
            );
        }
        assert_eq!(
            paths
                .iter()
                .filter(|path| **path == home.join(".claude.json"))
                .count(),
            1
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn the_full_read_profile_denies_the_named_entries_below_the_workspace() {
        let profile = full_read_seatbelt_profile(
            &spec(&[PathBuf::from("/Users/someone/.npm")], NetworkPolicy::Deny),
            Path::new("/private/tmp/agi-scratch"),
        )
        .expect("profile");
        let allow = profile
            .find("(allow file-write* (subpath \"/Users/someone/project\"))")
            .expect("workspace writable");
        let deny = crate::wrap::entry_rule(
            &profile,
            "(deny file-write* (regex \"^/Users/someone/project/(.*/)?",
            "[.][hH][uU][sS][kK][yY](/.*)?",
        )
        .expect("hook manager folder denied");
        assert!(deny > allow);
        assert!(crate::wrap::entry_rule(
            &profile,
            "(deny file-write-create file-write-unlink (regex \"^/Users/someone/project/(.*/)?",
            "[.][vV][sS][cC][oO][dD][eE]",
        )
        .is_some());
        assert!(
            !profile.contains("\"^/Users/someone/[.]npm/"),
            "a cache is not a project: packages there ship these names"
        );
    }

    #[test]
    fn bubblewrap_hides_each_credential_that_exists_before_binding_the_roots() {
        let scratch =
            std::env::temp_dir().join(format!("agi-full-read-masks-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&scratch);
        std::fs::create_dir_all(scratch.join("keys")).unwrap();
        std::fs::write(scratch.join("token"), "t").unwrap();
        let unreadable = [
            scratch.join("keys"),
            scratch.join("token"),
            scratch.join("missing"),
        ];
        let (args, _) = protected_args(
            SandboxBackend::LinuxBubblewrap,
            &spec(&[], NetworkPolicy::AllowExternal),
            &[],
            &unreadable,
            None,
            "node",
            &[],
        )
        .expect("wrap");
        let keys = resolve_existing_prefix(&scratch.join("keys"));
        let token = resolve_existing_prefix(&scratch.join("token"));
        let joined = args.join(" ");
        let _ = std::fs::remove_dir_all(&scratch);

        let hidden_folder = joined
            .find(&format!("--tmpfs {}", keys.display()))
            .expect("a folder is hidden under an empty tmpfs");
        let hidden_file = joined
            .find(&format!("--ro-bind /dev/null {}", token.display()))
            .expect("a file is hidden under /dev/null");
        let first_root = joined.find("--bind ").expect("the workspace is bound");
        assert!(hidden_folder < first_root && hidden_file < first_root);
        assert!(!joined.contains("missing"));
    }

    #[test]
    fn denied_network_adds_no_network_rule() {
        let profile = full_read_seatbelt_profile(
            &spec(&[], NetworkPolicy::Deny),
            Path::new("/private/tmp/agi-scratch"),
        )
        .expect("profile");
        assert!(!profile.contains("network-outbound"));
    }

    #[test]
    fn bubblewrap_binds_the_extra_roots_writable() {
        let roots = [PathBuf::from("/home/someone/.cargo")];
        let args = full_read_args(
            SandboxBackend::LinuxBubblewrap,
            &spec(&roots, NetworkPolicy::Deny),
            None,
            "bash",
            &["-lc".to_string(), "ls".to_string()],
        )
        .expect("wrap");
        let joined = args.join(" ");
        assert!(joined.contains("--ro-bind / /"));
        for root in ["/Users/someone/project", "/home/someone/.cargo"] {
            let resolved = crate::wrap::resolve_existing_prefix(Path::new(root));
            let resolved = resolved.display();
            assert!(
                joined.contains(&format!("--bind {resolved} {resolved}")),
                "{root} is bound where it resolves: {joined}"
            );
        }
        assert!(joined.contains("--unshare-net"));
        assert!(joined.ends_with("-- bash -lc ls"));
    }

    #[test]
    fn rejects_a_root_that_would_open_the_whole_disk() {
        let roots = [PathBuf::from("/")];
        assert!(full_read_args(
            SandboxBackend::LinuxBubblewrap,
            &spec(&roots, NetworkPolicy::Deny),
            None,
            "bash",
            &[],
        )
        .is_err());
    }

    #[test]
    fn protected_paths_stay_read_only_inside_writable_roots() {
        let protected = [PathBuf::from("/Users/someone/project/.agiworkforce")];
        let (wrapped, _) = protected_args(
            SandboxBackend::MacosSeatbelt,
            &spec(&[], NetworkPolicy::Allow),
            &protected,
            &[],
            Some(Path::new("/private/tmp/agi-scratch")),
            "node",
            &[],
        )
        .expect("wrap");
        let profile = &wrapped[1];
        let allow = profile
            .find("(allow file-write* (subpath \"/Users/someone/project\"))")
            .expect("workspace writable");
        let deny = profile
            .find("(deny file-write* (subpath \"/Users/someone/project/.agiworkforce\"))")
            .expect("protected path denied");
        assert!(deny > allow, "the denial must come after the allow");

        let workspace = scratch_tree("protected");
        std::fs::create_dir_all(workspace.join(".agiworkforce")).unwrap();
        std::fs::create_dir_all(workspace.join(".vscode")).unwrap();
        let protected = [
            workspace.join(".agiworkforce"),
            workspace.join(".vscode/mcp.json"),
            workspace.join(".mcp.json"),
            PathBuf::from("/nonexistent-agi-sandbox-test/config.json"),
        ];
        let spec = FullReadSpec {
            workspace_dir: &workspace,
            extra_writable_roots: &[],
            network_policy: NetworkPolicy::Allow,
        };
        let (wrapped, unprotected) = protected_args(
            SandboxBackend::LinuxBubblewrap,
            &spec,
            &protected,
            &[],
            None,
            "node",
            &["--".to_string(), "server.js".to_string()],
        )
        .expect("wrap");
        let ws = workspace.to_str().unwrap();
        let joined = wrapped.join(" ");
        let missing: Vec<PathBuf> = [".mcp.json", "mcp.json"]
            .into_iter()
            .chain(crate::HOOK_MANAGER_PATHS)
            .chain(crate::protected_paths::instruction_folders_outside_protected_entries())
            .map(|entry| workspace.join(entry))
            .collect();
        assert_eq!(unprotected, missing);
        assert!(joined.contains(&format!(
            "--bind {ws} {ws} --ro-bind {ws}/.agiworkforce {ws}/.agiworkforce --ro-bind {ws}/.vscode {ws}/.vscode -- node -- server.js"
        )));
        assert!(!joined.contains("--ro-bind-try"));
        assert!(!joined.contains(".mcp.json"));
        assert!(!joined.contains("nonexistent-agi-sandbox-test"));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn the_workspace_extra_roots_and_scratch_cannot_be_removed_or_renamed() {
        let roots = [PathBuf::from("/Users/someone/.npm")];
        let profile = full_read_seatbelt_profile(
            &spec(&roots, NetworkPolicy::Deny),
            Path::new("/private/tmp/agi-scratch"),
        )
        .expect("profile");
        for root in [
            "/Users/someone/project",
            "/Users/someone/.npm",
            "/private/tmp/agi-scratch",
        ] {
            let allow = profile
                .find(&format!("(allow file-write* (subpath \"{root}\"))"))
                .unwrap_or_else(|| panic!("{root} not writable:\n{profile}"));
            let pin = profile
                .find(&format!("(deny file-write-unlink (literal \"{root}\"))"))
                .unwrap_or_else(|| panic!("{root} can be removed or renamed:\n{profile}"));
            assert!(pin > allow, "the pin must follow the allow");
        }
    }

    #[test]
    fn mach_lookup_is_an_allowlist_without_launch_services() {
        let offline = full_read_seatbelt_profile(
            &spec(&[], NetworkPolicy::Deny),
            Path::new("/private/tmp/agi-scratch"),
        )
        .expect("profile");
        assert!(!offline.contains("(allow mach-lookup)\n"));
        assert!(offline.contains("(global-name \"com.apple.system.opendirectoryd.libinfo\")"));
        assert!(!offline.contains("launchservicesd"));
        assert!(!offline.contains("com.apple.trustd.agent"));

        let online = full_read_seatbelt_profile(
            &spec(&[], NetworkPolicy::AllowExternal),
            Path::new("/private/tmp/agi-scratch"),
        )
        .expect("profile");
        assert!(online.contains("(global-name \"com.apple.trustd.agent\")"));
    }

    #[test]
    fn ioctl_reaches_only_terminals_and_process_info_stays_in_the_sandbox() {
        let profile = full_read_seatbelt_profile(
            &spec(&[], NetworkPolicy::Deny),
            Path::new("/private/tmp/agi-scratch"),
        )
        .expect("profile");
        assert!(!profile.contains("(allow file-ioctl)\n"));
        assert!(profile
            .contains("(allow file-ioctl (literal \"/dev/ptmx\") (regex #\"^/dev/ttys[0-9]+\"))"));
        assert!(profile.contains("(allow process-info* (target same-sandbox))"));
        assert!(!profile.contains("com.apple.FSEvents"));
    }

    #[test]
    fn git_hooks_and_config_stay_read_only_in_the_full_read_profile() {
        let workspace = scratch_tree("full-read-git");
        std::fs::create_dir_all(workspace.join(".git/hooks")).unwrap();
        let spec = FullReadSpec {
            workspace_dir: &workspace,
            extra_writable_roots: &[],
            network_policy: NetworkPolicy::Deny,
        };
        let profile =
            full_read_seatbelt_profile(&spec, Path::new("/private/tmp/agi-scratch")).unwrap();
        let ws = workspace.to_str().unwrap();
        let allow = profile
            .find(&format!("(allow file-write* (subpath \"{ws}\"))"))
            .unwrap();
        let deny = profile
            .find(&format!("(deny file-write* (subpath \"{ws}/.git\"))"))
            .expect("the whole .git, hooks and config included, is denied");
        assert!(deny > allow);
        let _ = std::fs::remove_dir_all(&workspace);
    }

    fn scratch_tree(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agi-sandbox-policy-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn the_command_is_the_absolute_launcher_or_the_wrap_fails() {
        let protected = [PathBuf::from("/Users/someone/project/.agiworkforce")];
        for backend in [
            SandboxBackend::MacosSeatbelt,
            SandboxBackend::LinuxBubblewrap,
        ] {
            let plain = full_read_program(
                backend,
                &spec(&[], NetworkPolicy::Deny),
                Some(Path::new("/private/tmp/agi-scratch")),
                "node",
                &[],
            );
            let protecting = full_read_program_protecting(
                backend,
                &spec(&[], NetworkPolicy::Deny),
                &protected,
                Some(Path::new("/private/tmp/agi-scratch")),
                "node",
                &[],
            );
            match crate::sandbox_launcher(backend) {
                Some(launcher) => {
                    assert_eq!(Path::new(&plain.expect("wrap").0), launcher);
                    assert_eq!(Path::new(&protecting.expect("wrap").command), launcher);
                    assert!(launcher.is_absolute());
                }
                None => {
                    assert!(plain.is_err(), "{backend:?}");
                    assert!(protecting.is_err(), "{backend:?}");
                }
            }
        }
    }

    #[test]
    fn seatbelt_refuses_to_run_without_a_scratch_directory() {
        assert!(full_read_args(
            SandboxBackend::MacosSeatbelt,
            &spec(&[], NetworkPolicy::Deny),
            None,
            "bash",
            &[],
        )
        .is_err());
    }
}
