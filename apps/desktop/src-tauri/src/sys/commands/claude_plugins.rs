//! Claude Code plugin changes for Settings, Skills and plugins.
//!
//! The page names an action and a plugin. The program and the order of its
//! arguments are fixed here and no shell reads them, so this is not a shell
//! the page can type into. Installing or updating a plugin adds code
//! that runs as the person, so it is decided in a native dialog.

use crate::sys::native_confirm::{shown_value, ConfirmGate, NativeConfirm};
use serde::Deserialize;
use std::path::PathBuf;
use std::process::{Output, Stdio};
use std::time::Duration;
use tokio::process::Command;

const PROGRAM: &str = "claude";
const VERSION_TIMEOUT: Duration = Duration::from_secs(10);
const CHANGE_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_PLUGIN_NAME_LENGTH: usize = 200;
const MAX_REPORTED_OUTPUT: usize = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClaudePluginAction {
    Install,
    Update,
    Remove,
}

impl ClaudePluginAction {
    /// The argument lists to try in turn: the CLI has spelled its plugin
    /// commands both ways, and removal as `remove` and `uninstall`.
    fn argument_lists(self, plugin: &str) -> Vec<[String; 3]> {
        let verbs: &[&str] = match self {
            Self::Install => &["install"],
            Self::Update => &["update"],
            Self::Remove => &["remove", "uninstall"],
        };
        verbs
            .iter()
            .flat_map(|verb| {
                ["plugins", "plugin"]
                    .map(|group| [group.to_string(), (*verb).to_string(), plugin.to_string()])
            })
            .collect()
    }

    fn done(self) -> &'static str {
        match self {
            Self::Install => "installed",
            Self::Update => "updated",
            Self::Remove => "removed",
        }
    }

    /// The question asked before code is added. Removing a plugin adds
    /// nothing, so it is not asked here.
    fn question(self, plugin: &str) -> Option<NativeConfirm> {
        let (title, confirm_label, verb) = match self {
            Self::Install => ("Install a Claude Code plugin?", "Install Plugin", "Install"),
            Self::Update => ("Update a Claude Code plugin?", "Update Plugin", "Update"),
            Self::Remove => return None,
        };
        Some(NativeConfirm {
            title: title.to_string(),
            body: format!(
                "{verb} {} with the claude command?\n\nA plugin can add commands, hooks and servers that run as you, outside this app's sandbox.",
                shown_value(plugin)
            ),
            confirm_label: confirm_label.to_string(),
        })
    }
}

/// `plugin` as the CLI is given it. Only the characters a plugin name or a
/// marketplace reference uses, and never a leading `-`, which the CLI would
/// read as an option.
fn plugin_name(plugin: &str) -> Result<&str, String> {
    let plugin = plugin.trim();
    let allowed =
        |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '@' | '/' | '-');
    if plugin.is_empty()
        || plugin.len() > MAX_PLUGIN_NAME_LENGTH
        || plugin.starts_with('-')
        || !plugin.chars().all(allowed)
    {
        return Err(format!(
            "\"{}\" is not a plugin name. Use letters, numbers and . _ - : @ /",
            shown_value(plugin)
        ));
    }
    Ok(plugin)
}

/// `claude` as every other host program is found: on this process's `PATH`,
/// outside the folders a sandboxed command can write. It is started
/// directly with its arguments as words; no shell reads them.
fn claude_command(arguments: &[String]) -> Result<Command, String> {
    let program = agiworkforce_sandbox_policy::host_path::find_program(
        &agiworkforce_sandbox_policy::host_path::host_path(),
        PROGRAM,
        &agiworkforce_sandbox_policy::host_path::untrusted_roots(&[]),
    )
    .ok_or_else(|| "The claude command was not found on this computer.".to_string())?;
    Ok(command_for(program, arguments))
}

fn command_for(program: PathBuf, arguments: &[String]) -> Command {
    let mut command = Command::new(program);
    command.args(arguments);
    command
}

async fn run_claude(arguments: &[String], limit: Duration) -> Result<Output, String> {
    let mut command = claude_command(arguments)?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(home) = dirs::home_dir() {
        command.current_dir(home);
    }
    match tokio::time::timeout(limit, command.output()).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(error)) => Err(format!("The claude command could not be started: {error}")),
        Err(_) => Err(format!(
            "The claude command did not finish within {} seconds.",
            limit.as_secs()
        )),
    }
}

/// What a failed run said, on one bounded line.
fn failure_detail(output: &Output) -> String {
    let said = [&output.stderr, &output.stdout]
        .into_iter()
        .map(|stream| String::from_utf8_lossy(stream).trim().to_string())
        .find(|text| !text.is_empty())
        .unwrap_or_else(|| match output.status.code() {
            Some(code) => format!("it exited with status {code}"),
            None => "it was stopped before it finished".to_string(),
        });
    let line = said.lines().next().unwrap_or_default();
    line.chars().take(MAX_REPORTED_OUTPUT).collect()
}

/// Whether the `claude` command runs here, for Settings to offer plugin
/// changes or say why it cannot.
#[tauri::command]
pub async fn claude_plugin_cli_available() -> Result<bool, String> {
    Ok(run_claude(&["--version".to_string()], VERSION_TIMEOUT)
        .await
        .is_ok_and(|output| output.status.success()))
}

/// One plugin question at a time, and a wait after a no.
static PLUGIN_DECISIONS: ConfirmGate = ConfirmGate::new();

/// Installs, updates or removes one Claude Code plugin with the `claude`
/// command. Installing and updating are decided by the person in a native
/// dialog; a declined dialog is an error that says so and changes nothing.
#[tauri::command]
pub async fn claude_plugin_change(
    action: ClaudePluginAction,
    plugin: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let plugin = plugin_name(&plugin)?;

    if let Some(question) = action.question(plugin) {
        let request = format!("{action:?} {plugin}");
        let confirmed = PLUGIN_DECISIONS
            .confirm(&app_handle, &request, question)
            .await
            .map_err(|held| held.message())?;
        if !confirmed {
            return Err(format!(
                "The plugin was not {}. You declined it in the system dialog.",
                action.done()
            ));
        }
    }

    let mut last_failure = String::new();
    for arguments in action.argument_lists(plugin) {
        let output = run_claude(&arguments, CHANGE_TIMEOUT).await?;
        if output.status.success() {
            tracing::info!("[ClaudePlugins] {} {}", action.done(), plugin);
            return Ok(());
        }
        last_failure = failure_detail(&output);
    }
    Err(format!(
        "The plugin was not {}: {last_failure}",
        action.done()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plugin_name_cannot_be_an_option_or_shell_text() {
        for refused in [
            "",
            "  ",
            "-rf",
            "--scope=project",
            "a b",
            "a;b",
            "a$(id)",
            "a`id`",
            "a|b",
            "a&b",
            "a>b",
            "a\nb",
            "a'b",
            "a\"b",
        ] {
            assert!(plugin_name(refused).is_err(), "{refused:?} was accepted");
        }
        assert!(plugin_name(&"a".repeat(MAX_PLUGIN_NAME_LENGTH + 1)).is_err());

        for accepted in [
            "formatter",
            "formatter@claude-plugins",
            "org/repo",
            "a.b_c:d-e",
        ] {
            assert_eq!(plugin_name(accepted), Ok(accepted));
        }
        assert_eq!(plugin_name("  formatter  "), Ok("formatter"));
    }

    #[test]
    fn every_run_is_the_claude_plugin_command_and_nothing_else() {
        let runs = |action: ClaudePluginAction| -> Vec<String> {
            action
                .argument_lists("formatter")
                .iter()
                .map(|arguments| arguments.join(" "))
                .collect()
        };
        assert_eq!(
            runs(ClaudePluginAction::Install),
            ["plugins install formatter", "plugin install formatter"]
        );
        assert_eq!(
            runs(ClaudePluginAction::Update),
            ["plugins update formatter", "plugin update formatter"]
        );
        assert_eq!(
            runs(ClaudePluginAction::Remove),
            [
                "plugins remove formatter",
                "plugin remove formatter",
                "plugins uninstall formatter",
                "plugin uninstall formatter"
            ]
        );
    }

    #[test]
    fn adding_code_is_asked_and_removing_it_is_not() {
        let install = ClaudePluginAction::Install
            .question("formatter@claude-plugins")
            .expect("asked");
        assert!(install.body.contains("formatter@claude-plugins"));
        assert!(install.body.contains("run as you"));
        assert!(crate::sys::native_confirm::can_ask_with(
            &install.confirm_label
        ));
        assert!(ClaudePluginAction::Update.question("formatter").is_some());
        assert!(ClaudePluginAction::Remove.question("formatter").is_none());
    }

    #[test]
    fn the_program_is_started_directly_with_the_plugin_as_one_word() {
        let command = command_for(
            PathBuf::from("/usr/local/bin/claude"),
            &[
                "plugins".to_string(),
                "install".to_string(),
                "formatter".to_string(),
            ],
        );
        let command = command.as_std();
        assert_eq!(
            command.get_program().to_string_lossy(),
            "/usr/local/bin/claude"
        );
        let arguments: Vec<String> = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();
        assert_eq!(arguments, ["plugins", "install", "formatter"]);
    }
}
