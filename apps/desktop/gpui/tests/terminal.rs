use agiworkforce_desktop_gpui::terminal::*;
use agiworkforce_protocol::{developer_session::DeveloperWorkspaceIdentity, workspace_terminal::*};

#[test]
fn accessible_and_copied_rows_preserve_graphemes_and_skip_wide_cell_continuations() {
    let cell = |text: &str, width| TerminalCell {
        text: text.into(),
        width,
        style: TerminalStyle::default(),
    };
    let row = [
        cell("", 1),
        cell("東", 2),
        cell("", 0),
        cell("e\u{301}", 1),
        cell("🦀", 2),
        cell("", 0),
        cell("", 1),
    ];
    assert_eq!(row_text(&row), " 東e\u{301}🦀");
    assert_eq!(row_text(&[cell("", 1), cell("", 1)]), "");
}

fn summary() -> TerminalSummary {
    TerminalSummary {
        plan: TerminalPlan {
            root_key: "root".into(),
            terminal_id: uuid::Uuid::new_v4().to_string(),
            cwd: "/fixture".into(),
            shell: "fixture-shell".into(),
            sandbox: "contained".into(),
            network_allowed: false,
            size: TerminalSize {
                rows: 4,
                columns: 20,
            },
        },
        state: TerminalState::Running,
        revision: 0,
        next_input_sequence: 0,
        exit_code: None,
        error: None,
    }
}
fn panel(summary: TerminalSummary) -> TerminalPanel {
    TerminalPanel {
        visible: true,
        root: Some(DeveloperWorkspaceIdentity {
            cwd: "/fixture".into(),
            root_key: "root".into(),
        }),
        selected: Some(summary.plan.terminal_id.clone()),
        terminals: vec![summary],
        ..Default::default()
    }
}
fn screen() -> TerminalScreen {
    TerminalScreen {
        size: TerminalSize {
            rows: 4,
            columns: 20,
        },
        cells: vec![
            vec![
                TerminalCell {
                    text: String::new(),
                    width: 1,
                    style: TerminalStyle::default()
                };
                20
            ];
            4
        ],
        cursor_row: 0,
        cursor_column: 0,
        hide_cursor: false,
        application_cursor: false,
        application_keypad: false,
        bracketed_paste: false,
        alternate_screen: false,
        scrollback: 0,
        scrollback_len: 0,
    }
}

#[test]
fn stale_metadata_cannot_rewind_input_sequences_or_reenable_an_exited_terminal() {
    let mut current = summary();
    current.revision = 9;
    current.next_input_sequence = 7;
    current.state = TerminalState::Exited;
    current.exit_code = Some(0);
    let mut panel = panel(current.clone());
    let mut stale = current;
    stale.revision = 1;
    stale.next_input_sequence = 2;
    stale.state = TerminalState::Running;
    stale.exit_code = None;
    panel.merge_summary(stale).unwrap();
    let current = panel.current().unwrap();
    assert_eq!(current.revision, 9);
    assert_eq!(current.next_input_sequence, 7);
    assert_eq!(current.state, TerminalState::Exited);
    let mut changed = current.clone();
    changed.plan.network_allowed = true;
    assert!(panel.merge_summary(changed).is_err());
}
#[test]
fn terminal_screens_require_the_exact_view_and_complete_wide_cells() {
    let current = summary();
    let params = TerminalReadParams {
        root_key: "root".into(),
        terminal_id: current.plan.terminal_id.clone(),
        scrollback: 0,
        after_revision: None,
    };
    let mut panel = panel(current.clone());
    let mut valid = screen();
    valid.cells[0][0] = TerminalCell {
        text: "東".into(),
        width: 2,
        style: TerminalStyle::default(),
    };
    valid.cells[0][1].width = 0;
    panel
        .accept_frame(
            &params,
            TerminalReadResponse {
                terminal: current.clone(),
                screen: Some(valid.clone()),
            },
        )
        .unwrap();
    let mut broken = valid;
    broken.cells[0][1].width = 1;
    assert!(validate_screen(&broken).is_err());
    let mut wrong = current;
    wrong.plan.terminal_id = uuid::Uuid::new_v4().to_string();
    assert!(panel
        .accept_frame(
            &params,
            TerminalReadResponse {
                terminal: wrong,
                screen: Some(screen())
            }
        )
        .is_err());
    assert!(panel.frame.as_ref().unwrap().screen.is_some());
}
#[test]
fn typed_input_keeps_its_terminal_identity_and_stops_at_the_queue_limit() {
    let current = summary();
    let mut panel = panel(current);
    let id = panel.owned_id().unwrap();
    let mut wrong = id.clone();
    wrong.terminal_id = uuid::Uuid::new_v4().to_string();
    assert!(panel.enqueue(wrong, "not sent".into()).is_err());
    panel.enqueue(id.clone(), "東京".into()).unwrap();
    let packet = panel.next_input().unwrap();
    assert_eq!(packet.terminal_id, id.terminal_id);
    assert_eq!(packet.text, "東京");
    assert_eq!(panel.input_bytes, 0);
    for _ in 0..MAX_PENDING_TERMINAL_INPUTS {
        panel.enqueue(id.clone(), "x".into()).unwrap();
    }
    assert!(panel.enqueue(id.clone(), "overflow".into()).is_err());
    assert!(panel.paused.contains(&id.terminal_id));
    assert!(panel.input_queue.is_empty());
}
#[test]
fn paste_controls_and_escape_wrappers_are_bounded_and_newlines_are_not_doubled() {
    assert_eq!(encode_paste("one\r\ntwo\n", false).unwrap(), "one\rtwo\r");
    assert_eq!(
        encode_paste("one\r\ntwo", true).unwrap(),
        "\x1b[200~one\ntwo\x1b[201~"
    );
    assert!(encode_paste("\x1b]52;c;data\x07", true).is_err());
    assert!(encode_paste(&"x".repeat(MAX_TERMINAL_INPUT_BYTES), true).is_err());
}
#[test]
fn keyboard_encoding_preserves_application_cursor_and_modifier_semantics() {
    assert_eq!(
        encode_key("c", true, false, false, false).as_deref(),
        Some("\x03")
    );
    assert_eq!(
        encode_key("up", false, false, false, true).as_deref(),
        Some("\x1bOA")
    );
    assert_eq!(
        encode_key("up", true, false, false, true).as_deref(),
        Some("\x1b[1;5A")
    );
    assert_eq!(
        encode_key("f1", false, true, false, false).as_deref(),
        Some("\x1b[1;2P")
    );
    assert!(encode_key("a", false, false, false, false).is_none());
}
#[test]
fn unconfirmed_launches_are_included_once_in_shutdown_scope() {
    let current = summary();
    let mut panel = panel(current.clone());
    panel.pending_start = Some(current.plan.clone());
    assert_eq!(panel.ids_for_close().len(), 1);
    let mut unknown = current.plan;
    unknown.terminal_id = uuid::Uuid::new_v4().to_string();
    panel.pending_start = Some(unknown);
    assert_eq!(panel.ids_for_close().len(), 2);
}
