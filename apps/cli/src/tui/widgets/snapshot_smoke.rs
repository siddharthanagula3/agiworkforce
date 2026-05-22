//! Phase D-B baseline insta snapshot — locks the rendered shape of
//! `ListSelectionView<T>` so regressions in the shared overlay surface
//! show up as a diff instead of silent visual drift.

#![cfg(test)]

use super::list_selection_view::ListSelectionView;
use super::model_picker::{self, ModelPickerState};
use super::screen_renderers::{
    render_keybindings, render_mcp_list, render_sandbox, render_skills, render_tasks, render_usage,
    SandboxMode, UsageSummary,
};
use crate::model_catalog::Model;
use ratatui::Terminal;
use ratatui::backend::TestBackend;
use ratatui::layout::Rect;

// ---------------------------------------------------------------------------
// Helper: render the model picker overlay to a string via TestBackend.
// ---------------------------------------------------------------------------

fn fixture_models() -> Vec<Model> {
    // Use generic fixture model names that don't hardcode real IDs.
    // The catalog is the source of truth for real names; tests here verify
    // the visual geometry of the picker, not provider data.
    vec![
        Model {
            id: "fixture-flagship".into(),
            provider: "anthropic".into(),
            display_name: "Fixture Flagship".into(),
            context_window: 200_000,
            max_output_tokens: 8_192,
            input_price_per_1m: 15.0,
            output_price_per_1m: 75.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: true,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: true,
            release_date: "2025-01-01".into(),
            status: "active".into(),
            cloud_eligible: false,
        },
        Model {
            id: "fixture-balanced".into(),
            provider: "anthropic".into(),
            display_name: "Fixture Balanced".into(),
            context_window: 200_000,
            max_output_tokens: 8_192,
            input_price_per_1m: 3.0,
            output_price_per_1m: 15.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: true,
            release_date: "2025-01-01".into(),
            status: "active".into(),
            cloud_eligible: false,
        },
        Model {
            id: "fixture-fast".into(),
            provider: "openai".into(),
            display_name: "Fixture Fast".into(),
            context_window: 128_000,
            max_output_tokens: 4_096,
            input_price_per_1m: 1.0,
            output_price_per_1m: 3.0,
            supports_tools: true,
            supports_vision: false,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            release_date: "2025-01-01".into(),
            status: "active".into(),
            cloud_eligible: false,
        },
    ]
}

fn draw_model_picker(
    state: &ModelPickerState,
    current: &str,
    width: u16,
    height: u16,
) -> Terminal<TestBackend> {
    let area = Rect::new(0, 0, width, height);
    let mut terminal = Terminal::new(TestBackend::new(width, height)).expect("terminal");
    terminal
        .draw(|f| model_picker::render(f, area, state, current))
        .expect("draw");
    terminal
}

#[test]
fn list_selection_view_snapshot() {
    // Generic fixture strings on purpose — keeps the snapshot stable across
    // models.json updates and avoids tripping the no-hardcoded-IDs rule.
    let view: ListSelectionView<String> = ListSelectionView::new(
        "Choose item",
        vec!["alpha".into(), "beta".into(), "gamma".into()],
    );
    let rendered =
        <ListSelectionView<String> as super::interactive::InteractiveView>::render(&view);
    insta::assert_snapshot!("list_selection_view_baseline", rendered);
}

#[test]
fn render_tasks_empty_baseline() {
    let rendered = render_tasks(&[]);
    insta::assert_snapshot!("render_tasks_empty_baseline", rendered);
}

#[test]
fn render_sandbox_contained_baseline() {
    let rendered = render_sandbox(SandboxMode::Contained);
    insta::assert_snapshot!("render_sandbox_contained_baseline", rendered);
}

#[test]
fn render_skills_empty_baseline() {
    let rendered = render_skills(&[]);
    insta::assert_snapshot!("render_skills_empty_baseline", rendered);
}

#[test]
fn render_keybindings_baseline() {
    let rendered = render_keybindings();
    insta::assert_snapshot!("render_keybindings_baseline", rendered);
}

#[test]
fn render_mcp_list_empty_baseline() {
    let rendered = render_mcp_list(&[]);
    insta::assert_snapshot!("render_mcp_list_empty_baseline", rendered);
}

#[test]
fn render_usage_default_baseline() {
    let rendered = render_usage(&UsageSummary::default());
    insta::assert_snapshot!("render_usage_default_baseline", rendered);
}

// ---------------------------------------------------------------------------
// Model picker overlay snapshots — lock the visual geometry of the picker so
// regressions in the border/search/list/effort layout show up as a diff.
// ---------------------------------------------------------------------------

#[test]
fn model_picker_idle_search_shows_placeholder() {
    let models = fixture_models();
    let mut state = ModelPickerState::default();
    state.open(&models, "fixture-flagship");

    let terminal = draw_model_picker(&state, "fixture-flagship", 80, 20);
    insta::assert_snapshot!("model_picker_idle_search_shows_placeholder", terminal.backend());
}

#[test]
fn model_picker_search_active_filters_list() {
    let models = fixture_models();
    let mut state = ModelPickerState::default();
    state.open(&models, "fixture-flagship");
    // Simulate pressing '/' to focus search, then typing 'open'.
    state.search_focused = true;
    state.search = "open".into();
    state.rebuild_rows(&models);
    // Move cursor to first selectable row (cursor_down wraps to first).
    state.cursor_down();

    let terminal = draw_model_picker(&state, "fixture-flagship", 80, 20);
    insta::assert_snapshot!("model_picker_search_active_filters_list", terminal.backend());
}

#[test]
fn model_picker_current_model_marked_with_bullet() {
    let models = fixture_models();
    let mut state = ModelPickerState::default();
    state.open(&models, "fixture-balanced");

    let terminal = draw_model_picker(&state, "fixture-balanced", 80, 20);
    // The current model must show the bullet marker in the rendered output.
    let rendered = format!("{}", terminal.backend());
    assert!(
        rendered.contains('●'),
        "expected ● bullet for the current model in rendered picker"
    );
    insta::assert_snapshot!("model_picker_current_model_bullet", terminal.backend());
}

// ---------------------------------------------------------------------------
// Slash-command palette (CommandPopup) snapshots — lock the border, filter
// bar, command rows, and footer hint so regressions surface as a diff.
// ---------------------------------------------------------------------------

#[test]
fn slash_palette_empty_filter_shows_all_commands_baseline() {
    use super::command_popup::{CommandPopup, RegistryCommand};
    use super::interactive::InteractiveView;

    let popup = CommandPopup::new(vec![
        RegistryCommand::new("plan", "Switch to plan mode"),
        RegistryCommand::new("model", "Choose model and reasoning effort"),
        RegistryCommand::new("resume", "Resume a saved chat"),
        RegistryCommand::new("theme", "Choose a syntax highlighting theme"),
    ]);
    let rendered = popup.render();
    insta::assert_snapshot!("slash_palette_empty_filter_all_commands_baseline", rendered);
}

#[test]
fn slash_palette_filter_narrows_to_matching_command() {
    use super::command_popup::{CommandPopup, RegistryCommand};
    use super::interactive::{InteractiveView, KeyAction};

    // Use descriptions that do NOT contain the filter token "resu" so that
    // only the name-match on "resume" survives the filter.
    let mut popup = CommandPopup::new(vec![
        RegistryCommand::new("plan", "Enter collaborative planning"),
        RegistryCommand::new("model", "Pick inference model"),
        RegistryCommand::new("resume", "Continue a previous session"),
    ]);
    popup.handle_key(KeyAction::Char('r'));
    popup.handle_key(KeyAction::Char('e'));
    popup.handle_key(KeyAction::Char('s'));
    popup.handle_key(KeyAction::Char('u'));
    let rendered = popup.render();
    assert!(
        rendered.contains("/resume"),
        "expected /resume in filtered palette, got:\n{rendered}"
    );
    assert!(
        !rendered.contains("/plan"),
        "expected /plan to be filtered out, got:\n{rendered}"
    );
    insta::assert_snapshot!("slash_palette_filter_narrows_to_resume", rendered);
}
