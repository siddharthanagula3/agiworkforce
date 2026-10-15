//! Asking the user to approve an MCP launch, or to let one out of the
//! sandbox.
//!
//! Starting a server runs a command with the user's rights, or sends their
//! credentials to an address, and taking one out of the sandbox removes what
//! contains it. Both are decided in a dialog the operating system draws,
//! through [`crate::sys::native_confirm`], and never in the window: the
//! window renders model output and previews, so a script injected into it
//! could write a server into the configuration, connect it and answer any
//! question the page itself draws.
//!
//! The yes is recorded against the launch as it was shown, so an unchanged
//! launch starts without being asked about again. The dialog shows the
//! launch whole, by the same rules as the hooks dialog, and a launch that
//! does not fit is refused rather than shortened.

use super::config::{
    is_credential_reference, launch_files_root, launch_standing, pinned_file_labels,
    record_launch_approval, stored_secret_references, ApprovedLaunch, LaunchApproval, LaunchScope,
    LaunchStanding, McpServerConfig, StoredSecretKind,
};
use super::transport::TransportConfig;
use crate::sys::native_confirm::{
    check_it_fits, shown_value as marked, ConfirmGate, NativeConfirm, ASSUMED_ROW_CHARS,
    MAX_DIALOG_ROWS,
};

/// One MCP decision at a time, and a wait after a no that grows while the
/// noes keep coming; see [`ConfirmGate`].
static MCP_DECISIONS: ConfirmGate = ConfirmGate::new();

const START_LABEL: &str = "Start Server";
const CONNECT_LABEL: &str = "Connect Server";
const SANDBOX_OFF_LABEL: &str = "Turn Sandbox Off";
const NOT_SHOWN: &str = "(a credential, not shown)";

/// What the dialog needs to know about a launch beyond its configuration.
struct LaunchFacts {
    /// The labels of the files whose content the approval covers.
    files: Vec<String>,
    /// Where a local server starts and reads relative names from.
    starts_in: String,
    sandboxed: bool,
}

struct LaunchPrompt {
    title: String,
    body: String,
    confirm_label: &'static str,
}

fn shown_environment(server: &McpServerConfig) -> String {
    if server.env.is_empty() {
        return "nothing added".to_string();
    }
    server
        .env
        .iter()
        .collect::<std::collections::BTreeMap<_, _>>()
        .into_iter()
        .map(|(name, value)| {
            let value = if is_credential_reference(value) {
                marked(value)
            } else {
                match agiworkforce_sandbox_policy::shown_value(name, value) {
                    Some(shown) => marked(&shown),
                    None => NOT_SHOWN.to_string(),
                }
            };
            format!("{}={}", marked(name), value)
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn shown_list(items: &[String], none: &str) -> String {
    if items.is_empty() {
        return none.to_string();
    }
    items
        .iter()
        .map(|item| marked(item))
        .collect::<Vec<_>>()
        .join(" · ")
}

/// The host a remote server's address names, or the whole address when it
/// cannot be read as one.
fn remote_host(address: &str) -> String {
    match url::Url::parse(address)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
    {
        Some(host) => marked(&host),
        None => marked(address),
    }
}

/// A row for each of the user's saved keys and sign-ins the server is
/// handed, named by provider and never by value. A placeholder such as
/// `<from_api_key:openai>` in a server's configuration sends that saved key
/// to whatever the configuration names, so each gets a row of its own, and
/// for a remote server the row says which host it is sent to.
fn stored_secret_rows(server: &McpServerConfig) -> Vec<String> {
    let secrets = stored_secret_references(server);
    if secrets.is_empty() {
        return vec!["   Is given: none of your saved keys or sign-ins".to_string()];
    }
    let sent_to = match &server.transport {
        Some(TransportConfig::Http(http)) => Some(remote_host(&http.url)),
        Some(TransportConfig::Stdio) | None => None,
    };
    secrets
        .into_iter()
        .map(|secret| {
            let what = match secret.kind {
                StoredSecretKind::ApiKey => {
                    format!("your saved {} API key", marked(&secret.provider))
                }
                StoredSecretKind::SignIn => format!("your {} sign-in", marked(&secret.provider)),
            };
            match &sent_to {
                Some(host) => format!("   Is sent to {host}: {what}"),
                None => format!("   Is given: {what}"),
            }
        })
        .collect()
}

fn shown_network(server: &McpServerConfig) -> &'static str {
    if server.allow_local_network {
        "the internet and services on this computer"
    } else {
        "the internet, not services on this computer"
    }
}

fn whose(scope: &LaunchScope) -> String {
    match scope {
        LaunchScope::Project(root) => format!("from the MCP file of the project {}", marked(root)),
        LaunchScope::User => "from your own settings".to_string(),
    }
}

/// The rows for a launch, with what it runs straight under its name.
fn launch_rows(
    server_name: &str,
    server: &McpServerConfig,
    standing: &LaunchStanding,
    facts: &LaunchFacts,
) -> Vec<String> {
    let mut rows = vec![format!(
        "• {} ({})",
        marked(server_name),
        whose(&standing.scope)
    )];
    match &server.transport {
        Some(TransportConfig::Http(http)) => {
            let mut header_names: Vec<String> = http.headers.keys().cloned().collect();
            header_names.sort();
            let mut sends = Vec::new();
            if http.api_key.is_some() {
                sends.push("an API key".to_string());
            }
            match http.bearer_token.as_deref() {
                Some(token) if is_credential_reference(token) => {
                    sends.push(format!("the bearer token {}", marked(token)))
                }
                Some(_) => sends.push("a bearer token".to_string()),
                None => {}
            }
            rows.push(format!("   Address: {}", marked(&http.url)));
            rows.push(format!(
                "   Sends: {}",
                shown_list(&sends, "no credential of its own")
            ));
            rows.push(format!(
                "   Headers: {}",
                shown_list(&header_names, "none added")
            ));
            rows.push(format!(
                "   Certificate: {}",
                if http.verify_ssl {
                    "checked"
                } else {
                    "NOT checked"
                }
            ));
        }
        Some(TransportConfig::Stdio) | None => {
            rows.push(format!("   Command: {}", marked(&server.command)));
            rows.push(format!(
                "   Arguments ({}): {}",
                server.args.len(),
                shown_list(&server.args, "none")
            ));
            rows.push(format!("   Environment: {}", shown_environment(server)));
            rows.push(format!("   Starts in: {}", marked(&facts.starts_in)));
            rows.push(match &standing.approval {
                LaunchApproval::OneStartAtATime(why) => {
                    format!("   Files checked: none, because {}", marked(why))
                }
                _ => format!(
                    "   Files checked: {}",
                    shown_list(&facts.files, "none; it runs no file a sandbox can write")
                ),
            });
            rows.push(format!(
                "   Sandbox: {}",
                if facts.sandboxed {
                    "on, it writes only to its workspace"
                } else {
                    "OFF, it runs with your full user rights"
                }
            ));
        }
    }
    rows.extend(stored_secret_rows(server));
    rows.push(format!("   Reaches: {}", shown_network(server)));
    rows
}

fn too_large_to_show(what: &str, rows: usize) -> String {
    format!(
        "{what} is too large to show whole in the approval dialog: it needs about {rows} rows at {ASSUMED_ROW_CHARS} characters to a row, and the dialog shows {MAX_DIALOG_ROWS}. A server is never started, or let out of the sandbox, without being shown in full, so nothing was changed. Shorten its command, arguments or environment."
    )
}

/// The words of the dialog that approves a launch. `Err` when the launch
/// does not fit the dialog whole.
fn launch_prompt(
    server_name: &str,
    server: &McpServerConfig,
    standing: &LaunchStanding,
    facts: &LaunchFacts,
) -> Result<LaunchPrompt, String> {
    let remote = matches!(server.transport, Some(TransportConfig::Http(_)));
    let (title, confirm_label, consequence) = if remote {
        (
            "Connect this MCP server?",
            CONNECT_LABEL,
            "It is sent the credentials above, and chat can use the tools it offers.",
        )
    } else {
        (
            "Start this MCP server?",
            START_LABEL,
            "This command runs on your computer, and chat can use the tools it offers. What the files it runs go on to load is not checked.",
        )
    };
    let lasting = match &standing.approval {
        LaunchApproval::OneStartAtATime(_) => {
            "This is for this one start: you are asked again each time it starts."
        }
        _ => "You are not asked again until this launch, or a file it checks, changes.",
    };
    let body = [
        launch_rows(server_name, server, standing, facts).join("\n"),
        consequence.to_string(),
        lasting.to_string(),
        format!("Nothing changes unless you choose {confirm_label}."),
    ]
    .join("\n\n");
    check_it_fits(&body).map_err(|rows| too_large_to_show("This server's launch", rows))?;
    Ok(LaunchPrompt {
        title: title.to_string(),
        body,
        confirm_label,
    })
}

fn launch_facts(server_name: &str, server: &McpServerConfig, scope: &LaunchScope) -> LaunchFacts {
    LaunchFacts {
        files: pinned_file_labels(scope, server),
        starts_in: launch_files_root(scope),
        sandboxed: !super::sandbox::server_runs_unsandboxed(
            server_name,
            &server.command,
            &server.args,
        ),
    }
}

async fn decide<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    prompt: LaunchPrompt,
) -> Result<bool, String> {
    let request = format!("{}\n{}", prompt.confirm_label, prompt.body);
    MCP_DECISIONS
        .confirm(
            app,
            &request,
            NativeConfirm {
                title: prompt.title,
                body: prompt.body,
                confirm_label: prompt.confirm_label.to_string(),
            },
        )
        .await
        .map_err(|held| held.message())
}

/// The way a server is started by someone who can be asked: a launch that
/// is approved as it is now passes without a question, and any other is put
/// to the user in the native dialog. A yes is recorded, unless the launch
/// can be approved only one start at a time.
///
/// `server` is the entry as configured, before credentials are resolved
/// into it.
pub async fn ensure_approved<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    server_name: &str,
    server: &McpServerConfig,
) -> Result<ApprovedLaunch, String> {
    let not_started = |why: String| format!("MCP server '{server_name}' was not started: {why}");
    let standing = launch_standing(server_name, server).map_err(not_started)?;
    if standing.approval == LaunchApproval::Approved {
        return Ok(ApprovedLaunch::of(server_name, server, &standing));
    }

    let facts = launch_facts(server_name, server, &standing.scope);
    let prompt = launch_prompt(server_name, server, &standing, &facts)?;
    if !decide(app, prompt).await? {
        return Err(not_started("you did not approve it.".to_string()));
    }

    let after = launch_standing(server_name, server).map_err(not_started)?;
    if !after.is_the_launch_shown_as(&standing) {
        return Err(not_started(
            "it changed while you were deciding. Look at it again and retry.".to_string(),
        ));
    }
    if let Err(error) = record_launch_approval(server_name, &standing) {
        tracing::warn!(
            "[MCP] the approval of '{}' could not be saved, so it is asked about again next time: {}",
            server_name,
            error
        );
    }
    Ok(ApprovedLaunch::of(server_name, server, &standing))
}

/// The words of the dialog that lets a server out of the sandbox.
fn sandbox_off_prompt(
    server_name: &str,
    server: &McpServerConfig,
    consequence: &str,
) -> Result<LaunchPrompt, String> {
    let body = [
        format!(
            "• {}\n   Command: {}\n   Arguments ({}): {}\n   Environment: {}",
            marked(server_name),
            marked(&server.command),
            server.args.len(),
            shown_list(&server.args, "none"),
            shown_environment(server)
        ),
        marked(consequence),
        format!("Nothing changes unless you choose {SANDBOX_OFF_LABEL}."),
    ]
    .join("\n\n");
    check_it_fits(&body).map_err(|rows| too_large_to_show("This server's launch", rows))?;
    Ok(LaunchPrompt {
        title: "Run this MCP server outside the sandbox?".to_string(),
        body,
        confirm_label: SANDBOX_OFF_LABEL,
    })
}

/// Asks, natively, before a local server is let out of the sandbox. `Err`
/// is why it stays in.
pub async fn confirm_sandbox_off<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    server_name: &str,
    server: &McpServerConfig,
) -> Result<(), String> {
    let consequence =
        super::sandbox::unsandboxed_consequence(server_name, &server.command, &server.args);
    let prompt = sandbox_off_prompt(server_name, server, &consequence)?;
    if decide(app, prompt).await? {
        Ok(())
    } else {
        Err("The sandbox stays on for this server.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn local(command: &str, args: &[&str]) -> McpServerConfig {
        McpServerConfig {
            args: args.iter().map(|arg| arg.to_string()).collect(),
            ..serde_json::from_value(serde_json::json!({ "command": command })).unwrap()
        }
    }

    fn standing(approval: LaunchApproval) -> LaunchStanding {
        LaunchStanding::for_prompt_tests(LaunchScope::User, approval)
    }

    fn facts(files: &[&str], sandboxed: bool) -> LaunchFacts {
        LaunchFacts {
            files: files.iter().map(|file| file.to_string()).collect(),
            starts_in: "/Users/me/project".to_string(),
            sandboxed,
        }
    }

    #[test]
    fn the_dialog_shows_everything_that_decides_what_a_local_server_runs() {
        let mut server = local("node", &["server.js", "--port", "8080"]);
        server.env = HashMap::from([
            ("NODE_ENV".to_string(), "production".to_string()),
            ("GITHUB_TOKEN".to_string(), "ghp_secret".to_string()),
            (
                "OPENAI_API_KEY".to_string(),
                "<from_api_key:openai>".to_string(),
            ),
        ]);
        server.allow_local_network = true;

        let prompt = launch_prompt(
            "build",
            &server,
            &standing(LaunchApproval::NotApproved),
            &facts(&["server.js", "package.json"], true),
        )
        .expect("fits");

        assert_eq!(prompt.title, "Start this MCP server?");
        assert_eq!(prompt.confirm_label, START_LABEL);
        for expected in [
            "• build (from your own settings)\n   Command: node",
            "   Arguments (3): server.js · --port · 8080",
            "GITHUB_TOKEN=(a credential, not shown)",
            "NODE_ENV=production",
            "OPENAI_API_KEY=<from_api_key:openai>",
            "   Starts in: /Users/me/project",
            "   Files checked: server.js · package.json",
            "   Sandbox: on, it writes only to its workspace",
            "   Is given: your saved openai API key\n",
            "   Reaches: the internet and services on this computer",
            "You are not asked again until this launch, or a file it checks, changes.",
            "Nothing changes unless you choose Start Server.",
        ] {
            assert!(
                prompt.body.contains(expected),
                "{expected}\n---\n{}",
                prompt.body
            );
        }
        assert!(
            !prompt.body.contains("ghp_secret"),
            "a credential is never put on screen"
        );
    }

    #[test]
    fn a_launch_that_cannot_be_pinned_says_it_is_for_one_start_and_which_file() {
        let prompt = launch_prompt(
            "build",
            &local("node", &["server.js"]),
            &standing(LaunchApproval::OneStartAtATime(
                "server.js cannot be pinned, because it is larger than 64 MiB".to_string(),
            )),
            &facts(&[], true),
        )
        .expect("fits");

        assert!(prompt.body.contains(
            "   Files checked: none, because server.js cannot be pinned, because it is larger than 64 MiB"
        ));
        assert!(prompt
            .body
            .contains("This is for this one start: you are asked again each time it starts."));
    }

    #[test]
    fn a_remote_server_shows_where_it_connects_and_what_it_is_sent() {
        let server = McpServerConfig {
            transport: Some(TransportConfig::Http(Box::new(
                super::super::transport::HttpSseConfig {
                    url: "https://mcp.example.test/v1".to_string(),
                    bearer_token: Some("<from_oauth:github>".to_string()),
                    headers: HashMap::from([("X-Team".to_string(), "a".to_string())]),
                    verify_ssl: true,
                    ..Default::default()
                },
            ))),
            ..local("", &[])
        };

        let prompt = launch_prompt(
            "remote",
            &server,
            &standing(LaunchApproval::NotApproved),
            &facts(&[], true),
        )
        .expect("fits");

        assert_eq!(prompt.title, "Connect this MCP server?");
        assert_eq!(prompt.confirm_label, CONNECT_LABEL);
        for expected in [
            "   Address: https://mcp.example.test/v1",
            "   Sends: the bearer token <from_oauth:github>",
            "   Headers: X-Team",
            "   Certificate: checked",
            "   Is sent to mcp.example.test: your github sign-in\n",
        ] {
            assert!(
                prompt.body.contains(expected),
                "{expected}\n---\n{}",
                prompt.body
            );
        }
        assert!(!prompt.body.contains("Command:"));
    }

    #[test]
    fn each_saved_key_a_server_is_handed_has_a_row_of_its_own_naming_where_it_goes() {
        let mut local_server = local("npx", &["-y", "some-server"]);
        local_server.env = HashMap::from([
            (
                "OPENAI_API_KEY".to_string(),
                "<from_api_key:openai>".to_string(),
            ),
            (
                "ANTHROPIC_API_KEY".to_string(),
                "<from_api_key:anthropic>".to_string(),
            ),
        ]);
        assert_eq!(
            stored_secret_rows(&local_server),
            vec![
                "   Is given: your saved anthropic API key",
                "   Is given: your saved openai API key",
            ]
        );
        assert_eq!(
            stored_secret_rows(&local("node", &["server.js"])),
            vec!["   Is given: none of your saved keys or sign-ins"]
        );

        let remote = McpServerConfig {
            transport: Some(TransportConfig::Http(Box::new(
                super::super::transport::HttpSseConfig {
                    url: "https://user@collector.example.test:8443/mcp?x=1".to_string(),
                    bearer_token: Some("<from_api_key:openai>".to_string()),
                    ..Default::default()
                },
            ))),
            ..local("", &[])
        };
        assert_eq!(
            stored_secret_rows(&remote),
            vec!["   Is sent to collector.example.test: your saved openai API key"]
        );
        let prompt = launch_prompt(
            "remote",
            &remote,
            &standing(LaunchApproval::NotApproved),
            &facts(&[], true),
        )
        .expect("fits");
        assert!(prompt
            .body
            .contains("\n   Is sent to collector.example.test: your saved openai API key\n"));
        assert!(prompt
            .body
            .contains("   Sends: the bearer token <from_api_key:openai>"));

        assert_eq!(remote_host("not an address"), "not an address");
    }

    #[test]
    fn no_part_of_a_launch_can_forge_a_row_and_one_too_large_is_refused() {
        let mut forged = local("node", &["a.js\n   Sandbox: on", "b\u{00A0}c"]);
        forged
            .env
            .insert("A\nB".to_string(), "1\n• other (new)".to_string());
        let prompt = launch_prompt(
            "x\n• trusted (from your own settings)",
            &forged,
            &standing(LaunchApproval::NotApproved),
            &facts(&[], false),
        )
        .expect("fits");

        assert_eq!(
            prompt
                .body
                .lines()
                .filter(|line| line.starts_with('•'))
                .count(),
            1
        );
        assert_eq!(
            prompt
                .body
                .lines()
                .filter(|line| line.trim_start().starts_with("Sandbox:"))
                .count(),
            1
        );
        assert!(prompt
            .body
            .contains("   Sandbox: OFF, it runs with your full user rights"));
        assert!(prompt.body.contains("b\u{FFFD}c"));

        let long_argument = "x".repeat(ASSUMED_ROW_CHARS * MAX_DIALOG_ROWS);
        let refusal = launch_prompt(
            "big",
            &local("node", &[long_argument.as_str()]),
            &standing(LaunchApproval::NotApproved),
            &facts(&[], true),
        )
        .err()
        .expect("an argument nobody could read whole is not approved");
        assert!(refusal.contains("too large to show whole"), "{refusal}");
    }

    #[test]
    fn letting_a_server_out_of_the_sandbox_shows_its_launch_and_what_it_can_then_do() {
        let prompt = sandbox_off_prompt(
            "build",
            &local("node", &["server.js"]),
            "'build' will run with your full user rights.",
        )
        .expect("fits");

        assert_eq!(prompt.confirm_label, SANDBOX_OFF_LABEL);
        assert!(prompt
            .body
            .starts_with("• build\n   Command: node\n   Arguments (1): server.js"));
        assert!(prompt
            .body
            .contains("'build' will run with your full user rights."));
        assert!(prompt
            .body
            .ends_with("Nothing changes unless you choose Turn Sandbox Off."));
    }

    #[test]
    fn every_consenting_label_is_one_the_native_dialog_can_ask_with() {
        for label in [START_LABEL, CONNECT_LABEL, SANDBOX_OFF_LABEL] {
            assert!(crate::sys::native_confirm::can_ask_with(label), "{label}");
        }
    }
}
