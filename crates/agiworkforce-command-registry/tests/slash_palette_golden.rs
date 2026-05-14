//! Golden-file test for the AGI Workforce slash palette.
//!
//! Snapshots `builtin_slash_registry_commands()` as one line per command:
//!   `/name [alias1, alias2, ...]`
//!
//! Update the golden by setting `AGIWORKFORCE_UPDATE_GOLDEN=1`; without it,
//! drift fails CI. The golden was last calibrated 2026-05-14 against the
//! Claude Code v2.1.128 capture run at
//! `/Users/siddhartha/Desktop/reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-code/607-618_cli_slash-command-palette*.txt`.

use agiworkforce_command_registry::builtin_slash_registry_commands;

const GOLDEN_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/slash_palette_golden.txt"
);

fn render() -> String {
    let mut lines = Vec::new();
    for cmd in builtin_slash_registry_commands() {
        if cmd.aliases.is_empty() {
            lines.push(format!("/{}", cmd.name));
        } else {
            lines.push(format!("/{} [{}]", cmd.name, cmd.aliases.join(", ")));
        }
    }
    lines.push(String::new()); // trailing newline
    lines.join("\n")
}

#[test]
fn slash_palette_matches_golden() {
    let actual = render();
    if std::env::var("AGIWORKFORCE_UPDATE_GOLDEN").is_ok() {
        std::fs::write(GOLDEN_PATH, &actual).expect("write golden");
        return;
    }
    let expected = std::fs::read_to_string(GOLDEN_PATH).expect("read golden");
    if actual != expected {
        eprintln!(
            "Slash palette drifted from golden.\n\
             To accept the new state, re-run with AGIWORKFORCE_UPDATE_GOLDEN=1.\n\
             --- expected (golden) ---\n{}\n--- actual ---\n{}",
            expected, actual
        );
        panic!("slash palette golden drift");
    }
}

#[test]
fn slash_palette_has_58_commands() {
    let count = builtin_slash_registry_commands().len();
    assert_eq!(
        count, 58,
        "Expected 58 built-in slash commands (50 from M11 + 8 new from M22: /focus /background /advisor /team-onboarding /terminal-setup /reload-plugins /extra-usage /remote-env); got {count}"
    );
}

#[test]
fn m22_targeted_commands_are_all_registered() {
    use agiworkforce_command_registry::CommandRegistry;
    let mut registry = CommandRegistry::default();
    registry.extend(builtin_slash_registry_commands());

    // Commands that already existed before M22 (verified present, no-op):
    for name in ["clear", "rewind", "resume", "export"] {
        assert!(
            registry.find(name).is_some(),
            "/{name} was expected to already exist (pre-M22)"
        );
    }
    // /branch is an alias of /fork — verify it resolves:
    assert_eq!(
        registry.find("branch").map(|c| c.name.as_str()),
        Some("fork"),
        "/branch must resolve to canonical /fork"
    );

    // Newly added by M22:
    for name in [
        "focus",
        "background",
        "advisor",
        "team-onboarding",
        "terminal-setup",
        "reload-plugins",
        "extra-usage",
        "remote-env",
    ] {
        assert!(
            registry.find(name).is_some(),
            "/{name} must be registered (M22 — 2026-05-14 — Claude Code parity)"
        );
    }

    // Alias spot-checks for M22 commands:
    assert_eq!(
        registry.find("bg").map(|c| c.name.as_str()),
        Some("background"),
        "/bg must resolve to canonical /background"
    );
    assert_eq!(
        registry.find("onboarding").map(|c| c.name.as_str()),
        Some("team-onboarding"),
        "/onboarding must resolve to canonical /team-onboarding"
    );
    assert_eq!(
        registry.find("shell-setup").map(|c| c.name.as_str()),
        Some("terminal-setup"),
        "/shell-setup must resolve to canonical /terminal-setup"
    );
    assert_eq!(
        registry.find("pricing").map(|c| c.name.as_str()),
        Some("extra-usage"),
        "/pricing must resolve to canonical /extra-usage"
    );
}

#[test]
fn no_canonical_name_collides_with_an_alias_of_another_command() {
    let commands = builtin_slash_registry_commands();
    let names: std::collections::HashSet<&str> =
        commands.iter().map(|c| c.name.as_str()).collect();
    for cmd in &commands {
        for alias in &cmd.aliases {
            assert!(
                !names.contains(alias.as_str()),
                "alias /{alias} of /{} collides with canonical command /{alias}",
                cmd.name
            );
        }
    }
}
