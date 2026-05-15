use crate::app_event::AppEvent;
use crate::bottom_pane::chat_composer::ActivePopup;
use crate::bottom_pane::chat_composer::ChatComposer;
use crate::bottom_pane::chat_composer::ComposerMentionBinding;
use crate::bottom_pane::chat_composer::InputResult;
use crate::bottom_pane::chat_composer_history::HistoryEntry;
use crate::bottom_pane::composer::text_ops;
use crate::bottom_pane::footer::esc_hint_mode;
use crate::bottom_pane::footer::reset_mode_after_activity;
use crate::bottom_pane::footer::toggle_shortcut_mode;
use crate::bottom_pane::MentionBinding;
use crate::bottom_pane::textarea::TextArea;
use crate::history_cell;
use crate::key_hint::has_ctrl_or_alt;
use agiworkforce_core::plugins::PluginCapabilitySummary;
use agiworkforce_core::skills::model::SkillMetadata;
use agiworkforce_protocol::models::local_image_label_text;
use agiworkforce_protocol::user_input::ByteRange;
use agiworkforce_protocol::user_input::TextElement;
use agiworkforce_protocol::user_input::MAX_USER_INPUT_TEXT_CHARS;
use crossterm::event::KeyCode;
use crossterm::event::KeyEvent;
use crossterm::event::KeyEventKind;
use crossterm::event::KeyModifiers;
use std::collections::HashMap;
use std::collections::HashSet;
use std::ops::Range;
use std::sync::Arc;
#[cfg(not(target_os = "linux"))]
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
#[cfg(not(target_os = "linux"))]
use std::thread;
use std::time::Duration;
use std::time::Instant;
#[cfg(not(target_os = "linux"))]
use tokio::runtime::Handle;

use crate::bottom_pane::paste_burst::CharDecision;
use crate::bottom_pane::prompt_args::expand_custom_prompt;
use crate::bottom_pane::prompt_args::expand_if_numeric_with_positional_args;
use crate::bottom_pane::prompt_args::parse_slash_name;
use crate::bottom_pane::prompt_args::prompt_argument_names;
use crate::bottom_pane::prompt_args::prompt_command_with_arg_placeholders;
use crate::bottom_pane::prompt_args::prompt_has_numeric_placeholders;
use crate::bottom_pane::slash_commands;
use crate::slash_command::SlashCommand;
use agiworkforce_protocol::custom_prompts::PROMPTS_CMD_PREFIX;
use agiworkforce_protocol::user_input::MAX_USER_INPUT_TEXT_CHARS as _MAX;
use text_ops::expand_pending_pastes;
use text_ops::user_input_too_large_message;
use text_ops::LARGE_PASTE_CHAR_THRESHOLD;

use super::super::command_popup::CommandItem;

fn is_mention_name_char(byte: u8) -> bool {
    matches!(byte, b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'-')
}

fn find_next_mention_token_range(text: &str, token: &str, from: usize) -> Option<Range<usize>> {
    if token.is_empty() || from >= text.len() {
        return None;
    }
    let bytes = text.as_bytes();
    let token_bytes = token.as_bytes();
    let mut index = from;

    while index < bytes.len() {
        if bytes[index] != b'$' {
            index += 1;
            continue;
        }

        let end = index.saturating_add(token_bytes.len());
        if end > bytes.len() {
            return None;
        }
        if &bytes[index..end] != token_bytes {
            index += 1;
            continue;
        }

        if bytes
            .get(end)
            .is_none_or(|byte| !is_mention_name_char(*byte))
        {
            return Some(index..end);
        }
        index += 1;
    }
    None
}

impl ChatComposer {
    /// Handle a key event coming from the main UI.
    pub fn handle_key_event(&mut self, key_event: KeyEvent) -> (InputResult, bool) {
        if matches!(key_event.kind, KeyEventKind::Release) {
            self.voice_state.key_release_supported = true;
        }

        // Timer-based conversion is handled in the pre-draw tick.
        // If recording, stop on Space release when supported. On terminals without key-release
        // events, Space repeat events are handled as "still held" and stop is driven by timeout
        // in `process_space_hold_trigger`.
        if let Some(result) = self.handle_key_event_while_recording(key_event) {
            return result;
        }

        if !self.input_enabled {
            return (InputResult::None, false);
        }

        // Outside of recording, ignore all key releases globally except for Space,
        // which is handled explicitly for hold-to-talk behavior below.
        if matches!(key_event.kind, KeyEventKind::Release)
            && !matches!(key_event.code, KeyCode::Char(' '))
        {
            return (InputResult::None, false);
        }

        // If a space hold is pending and another non-space key is pressed, cancel the hold
        // and convert the element into a plain space.
        if self.voice_state.space_hold_started_at.is_some()
            && !matches!(key_event.code, KeyCode::Char(' '))
        {
            self.voice_state.space_hold_started_at = None;
            if let Some(id) = self.voice_state.space_hold_element_id.take() {
                let _ = self.textarea.replace_element_by_id(&id, " ");
            }
            self.voice_state.space_hold_trigger = None;
            self.voice_state.space_hold_repeat_seen = false;
            // fall through to normal handling of this other key
        }

        if let Some(result) = self.handle_voice_space_key_event(&key_event) {
            return result;
        }

        let result = match &mut self.active_popup {
            ActivePopup::Command(_) => self.handle_key_event_with_slash_popup(key_event),
            ActivePopup::File(_) => self.handle_key_event_with_file_popup(key_event),
            ActivePopup::Skill(_) => self.handle_key_event_with_skill_popup(key_event),
            ActivePopup::None => self.handle_key_event_without_popup(key_event),
        };
        // Update (or hide/show) popup after processing the key.
        self.sync_popups();
        result
    }

    /// Return true if either the slash-command popup or the file-search popup is active.
    pub(crate) fn popup_active(&self) -> bool {
        !matches!(self.active_popup, ActivePopup::None)
    }

    /// Handle key event when the slash-command popup is visible.
    fn handle_key_event_with_slash_popup(&mut self, key_event: KeyEvent) -> (InputResult, bool) {
        if self.handle_shortcut_overlay_key(&key_event) {
            return (InputResult::None, true);
        }
        if key_event.code == KeyCode::Esc {
            let next_mode = esc_hint_mode(self.footer_mode, self.is_task_running);
            if next_mode != self.footer_mode {
                self.footer_mode = next_mode;
                return (InputResult::None, true);
            }
        } else {
            self.footer_mode = reset_mode_after_activity(self.footer_mode);
        }
        let ActivePopup::Command(popup) = &mut self.active_popup else {
            unreachable!();
        };

        match key_event {
            KeyEvent {
                code: KeyCode::Up, ..
            }
            | KeyEvent {
                code: KeyCode::Char('p'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => {
                popup.move_up();
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Down,
                ..
            }
            | KeyEvent {
                code: KeyCode::Char('n'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => {
                popup.move_down();
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Esc, ..
            } => {
                // Dismiss the slash popup; keep the current input untouched.
                self.active_popup = ActivePopup::None;
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Tab, ..
            } => {
                // Ensure popup filtering/selection reflects the latest composer text
                // before applying completion.
                let first_line = self.textarea.text().lines().next().unwrap_or("");
                popup.on_composer_text_change(first_line.to_string());
                if let Some(sel) = popup.selected_item() {
                    let mut cursor_target: Option<usize> = None;
                    match sel {
                        CommandItem::Builtin(cmd) => {
                            if cmd == SlashCommand::Skills {
                                self.textarea.set_text_clearing_elements("");
                                return (InputResult::Command(cmd), true);
                            }

                            let starts_with_cmd = first_line
                                .trim_start()
                                .starts_with(&format!("/{}", cmd.command()));
                            if !starts_with_cmd {
                                self.textarea
                                    .set_text_clearing_elements(&format!("/{} ", cmd.command()));
                            }
                            if !self.textarea.text().is_empty() {
                                cursor_target = Some(self.textarea.text().len());
                            }
                        }
                        CommandItem::UserPrompt(idx) => {
                            if let Some(prompt) = popup.prompt(idx) {
                                match text_ops::prompt_selection_action(
                                    prompt,
                                    first_line,
                                    crate::bottom_pane::composer::text_ops::PromptSelectionMode::Completion,
                                    &self.textarea.text_elements(),
                                ) {
                                    crate::bottom_pane::composer::text_ops::PromptSelectionAction::Insert { text, cursor } => {
                                        let target = cursor.unwrap_or(text.len());
                                        // Inserted prompt text is plain input; discard any elements.
                                        self.textarea.set_text_clearing_elements(&text);
                                        cursor_target = Some(target);
                                    }
                                    crate::bottom_pane::composer::text_ops::PromptSelectionAction::Submit { .. } => {}
                                }
                            }
                        }
                    }
                    if let Some(pos) = cursor_target {
                        self.textarea.set_cursor(pos);
                    }
                }
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Enter,
                modifiers: KeyModifiers::NONE,
                ..
            } => {
                // If the current line starts with a custom prompt name and includes
                // positional args for a numeric-style template, expand and submit
                // immediately regardless of the popup selection.
                let mut text = self.textarea.text().to_string();
                let mut text_elements = self.textarea.text_elements();
                if !self.pending_pastes.is_empty() {
                    let (expanded, expanded_elements) =
                        expand_pending_pastes(&text, text_elements, &self.pending_pastes);
                    text = expanded;
                    text_elements = expanded_elements;
                }
                let first_line = text.lines().next().unwrap_or("");
                if let Some((name, _rest, _rest_offset)) = parse_slash_name(first_line)
                    && let Some(prompt_name) = name.strip_prefix(&format!("{PROMPTS_CMD_PREFIX}:"))
                    && let Some(prompt) = self.custom_prompts.iter().find(|p| p.name == prompt_name)
                    && let Some(expanded) =
                        expand_if_numeric_with_positional_args(prompt, first_line, &text_elements)
                {
                    self.prune_attached_images_for_submission(
                        &expanded.text,
                        &expanded.text_elements,
                    );
                    self.pending_pastes.clear();
                    self.textarea.set_text_clearing_elements("");
                    return (
                        InputResult::Submitted {
                            text: expanded.text,
                            text_elements: expanded.text_elements,
                        },
                        true,
                    );
                }

                // Fall back to standard submit path.
                if let Some(sel) = popup.selected_item() {
                    match sel {
                        CommandItem::Builtin(cmd) => {
                            if self.reject_slash_command_if_unavailable(cmd) {
                                return (InputResult::None, true);
                            }
                            if cmd == SlashCommand::Skills {
                                self.textarea.set_text_clearing_elements("");
                                return (InputResult::Command(cmd), true);
                            }
                            if cmd.supports_inline_args() {
                                let first_line_raw =
                                    self.textarea.text().lines().next().unwrap_or("").to_string();
                                let already_has_cmd = first_line_raw
                                    .trim_start()
                                    .starts_with(&format!("/{}", cmd.command()));
                                if !already_has_cmd {
                                    self.textarea.set_text_clearing_elements(&format!(
                                        "/{} ",
                                        cmd.command()
                                    ));
                                }
                                return self.handle_submission(false);
                            }
                            self.textarea.set_text_clearing_elements("");
                            return (InputResult::Command(cmd), true);
                        }
                        CommandItem::UserPrompt(idx) => {
                            if let ActivePopup::Command(popup) = &self.active_popup {
                                if let Some(prompt) = popup.prompt(idx) {
                                    let first_line =
                                        self.textarea.text().lines().next().unwrap_or("");
                                    match text_ops::prompt_selection_action(
                                        prompt,
                                        first_line,
                                        crate::bottom_pane::composer::text_ops::PromptSelectionMode::Submit,
                                        &self.textarea.text_elements(),
                                    ) {
                                        crate::bottom_pane::composer::text_ops::PromptSelectionAction::Submit {
                                            text,
                                            text_elements,
                                        } => {
                                            let original_pending = self.pending_pastes.clone();
                                            self.prune_attached_images_for_submission(
                                                &text,
                                                &text_elements,
                                            );
                                            self.pending_pastes.clear();
                                            self.textarea.set_text_clearing_elements("");
                                            return (
                                                InputResult::Submitted {
                                                    text,
                                                    text_elements,
                                                },
                                                true,
                                            );
                                        }
                                        crate::bottom_pane::composer::text_ops::PromptSelectionAction::Insert {
                                            text,
                                            cursor,
                                        } => {
                                            let target = cursor.unwrap_or(text.len());
                                            self.textarea.set_text_clearing_elements(&text);
                                            self.textarea.set_cursor(target);
                                            return (InputResult::None, true);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                self.handle_submission(false)
            }
            input => self.handle_input_basic(input),
        }
    }

    /// Non-ASCII character handling path for `handle_input_basic_with_time`.
    ///
    /// Because this path mixes "insert immediately" with "maybe retro-grab later", it must clamp
    /// the cursor to a UTF-8 char boundary before slicing `textarea.text()`.
    #[inline]
    fn handle_non_ascii_char(&mut self, input: KeyEvent, now: Instant) -> (InputResult, bool) {
        if self.disable_paste_burst {
            // When burst detection is disabled, treat IME/non-ASCII input as normal typing.
            // In particular, do not retro-capture or buffer already-inserted prefix text.
            self.textarea.input(input);
            let text_after = self.textarea.text();
            self.pending_pastes
                .retain(|(placeholder, _)| text_after.contains(placeholder));
            return (InputResult::None, true);
        }
        if let KeyEvent {
            code: KeyCode::Char(ch),
            ..
        } = input
        {
            if self.paste_burst.try_append_char_if_active(ch, now) {
                return (InputResult::None, true);
            }
            // Non-ASCII input often comes from IMEs and can arrive in quick bursts.
            // We do not want to hold the first char (flicker suppression) on this path, but we
            // still want to detect paste-like bursts. Before applying any non-ASCII input, flush
            // any existing burst buffer (including a pending first char from the ASCII path) so
            // we don't carry that transient state forward.
            if let Some(pasted) = self.paste_burst.flush_before_modified_input() {
                self.handle_paste(pasted);
            }
            if let Some(decision) = self.paste_burst.on_plain_char_no_hold(now) {
                match decision {
                    CharDecision::BufferAppend => {
                        self.paste_burst.append_char_to_buffer(ch, now);
                        return (InputResult::None, true);
                    }
                    CharDecision::BeginBuffer { retro_chars } => {
                        // For non-ASCII we inserted prior chars immediately, so if this turns out
                        // to be paste-like we need to retroactively grab & remove the already-
                        // inserted prefix from the textarea before buffering the burst.
                        let cur = self.textarea.cursor();
                        let txt = self.textarea.text();
                        let safe_cur = text_ops::clamp_to_char_boundary(txt, cur);
                        let before = &txt[..safe_cur];
                        if let Some(grab) =
                            self.paste_burst
                                .decide_begin_buffer(now, before, retro_chars as usize)
                        {
                            if !grab.grabbed.is_empty() {
                                self.textarea.replace_range(grab.start_byte..safe_cur, "");
                            }
                            // seed the paste burst buffer with everything (grabbed + new)
                            self.paste_burst.append_char_to_buffer(ch, now);
                            return (InputResult::None, true);
                        }
                        // If decide_begin_buffer opted not to start buffering,
                        // fall through to normal insertion below.
                    }
                    _ => unreachable!("on_plain_char_no_hold returned unexpected variant"),
                }
            }
        }
        if let Some(pasted) = self.paste_burst.flush_before_modified_input() {
            self.handle_paste(pasted);
        }
        self.textarea.input(input);

        let text_after = self.textarea.text();
        self.pending_pastes
            .retain(|(placeholder, _)| text_after.contains(placeholder));
        (InputResult::None, true)
    }

    /// Handle key events when file search popup is visible.
    fn handle_key_event_with_file_popup(&mut self, key_event: KeyEvent) -> (InputResult, bool) {
        if self.handle_shortcut_overlay_key(&key_event) {
            return (InputResult::None, true);
        }
        if key_event.code == KeyCode::Esc {
            let next_mode = esc_hint_mode(self.footer_mode, self.is_task_running);
            if next_mode != self.footer_mode {
                self.footer_mode = next_mode;
                return (InputResult::None, true);
            }
        } else {
            self.footer_mode = reset_mode_after_activity(self.footer_mode);
        }
        let ActivePopup::File(popup) = &mut self.active_popup else {
            unreachable!();
        };

        match key_event {
            KeyEvent {
                code: KeyCode::Up, ..
            }
            | KeyEvent {
                code: KeyCode::Char('p'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => {
                popup.move_up();
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Down,
                ..
            }
            | KeyEvent {
                code: KeyCode::Char('n'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => {
                popup.move_down();
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Esc, ..
            } => {
                // Dismiss the file popup, record the token as "dismissed" so we don't immediately re-show it.
                let current_token = Self::current_at_token(&self.textarea).unwrap_or_default();
                self.dismissed_file_popup_token = Some(current_token);
                self.active_popup = ActivePopup::None;
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Tab | KeyCode::Enter,
                modifiers: KeyModifiers::NONE,
                ..
            } => {
                if let ActivePopup::File(popup) = &self.active_popup {
                    if let Some(path) = popup.selected_path() {
                        let path_string = path.to_string_lossy().to_string();
                        self.insert_selected_path(&path_string);
                        self.active_popup = ActivePopup::None;
                        return (InputResult::None, true);
                    }
                }
                // No selection — fall through to submit on Enter.
                if matches!(key_event.code, KeyCode::Enter) {
                    return self.handle_submission(false);
                }
                (InputResult::None, true)
            }
            input => self.handle_input_basic(input),
        }
    }

    /// Handle key events when skill/mention popup is visible.
    fn handle_key_event_with_skill_popup(&mut self, key_event: KeyEvent) -> (InputResult, bool) {
        if self.handle_shortcut_overlay_key(&key_event) {
            return (InputResult::None, true);
        }
        if key_event.code == KeyCode::Esc {
            let next_mode = esc_hint_mode(self.footer_mode, self.is_task_running);
            if next_mode != self.footer_mode {
                self.footer_mode = next_mode;
                return (InputResult::None, true);
            }
        } else {
            self.footer_mode = reset_mode_after_activity(self.footer_mode);
        }
        let ActivePopup::Skill(popup) = &mut self.active_popup else {
            unreachable!();
        };

        match key_event {
            KeyEvent {
                code: KeyCode::Up, ..
            }
            | KeyEvent {
                code: KeyCode::Char('p'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => {
                popup.move_up();
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Down,
                ..
            }
            | KeyEvent {
                code: KeyCode::Char('n'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => {
                popup.move_down();
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Esc, ..
            } => {
                let current_token = self.current_mention_token().unwrap_or_default();
                self.dismissed_mention_popup_token = Some(current_token);
                self.active_popup = ActivePopup::None;
                (InputResult::None, true)
            }
            KeyEvent {
                code: KeyCode::Tab | KeyCode::Enter,
                modifiers: KeyModifiers::NONE,
                ..
            } => {
                if let ActivePopup::Skill(popup) = &self.active_popup {
                    if let Some(item) = popup.selected_item() {
                        let (insert_text, path) = match item {
                            crate::bottom_pane::skill_popup::MentionItem::Skill(s) => {
                                (format!("${}", s.name), None)
                            }
                            crate::bottom_pane::skill_popup::MentionItem::Plugin(p) => {
                                (format!("${}", p.name), None)
                            }
                            crate::bottom_pane::skill_popup::MentionItem::Connector(c) => {
                                (format!("${}", c.label), Some(c.id.clone()))
                            }
                        };
                        self.insert_selected_mention(&insert_text, path.as_deref());
                        self.active_popup = ActivePopup::None;
                        return (InputResult::None, true);
                    }
                }
                if matches!(key_event.code, KeyCode::Enter) {
                    return self.handle_submission(false);
                }
                (InputResult::None, true)
            }
            input => self.handle_input_basic(input),
        }
    }

    pub fn skills(&self) -> Option<&Vec<SkillMetadata>> {
        self.skills.as_ref()
    }

    pub fn plugins(&self) -> Option<&Vec<PluginCapabilitySummary>> {
        self.plugins.as_ref()
    }

    pub(crate) fn mentions_enabled(&self) -> bool {
        let skills_ready = self
            .skills
            .as_ref()
            .is_some_and(|skills| !skills.is_empty());
        let plugins_ready = self
            .plugins
            .as_ref()
            .is_some_and(|plugins| !plugins.is_empty());
        let connectors_ready = self.connectors_enabled
            && self
                .connectors_snapshot
                .as_ref()
                .is_some_and(|snapshot| !snapshot.connectors.is_empty());
        skills_ready || plugins_ready || connectors_ready
    }

    /// Extract a token prefixed with `prefix` under the cursor, if any.
    ///
    /// The returned string **does not** include the prefix.
    pub(crate) fn current_prefixed_token(
        textarea: &TextArea,
        prefix: char,
        allow_empty: bool,
    ) -> Option<String> {
        let cursor_offset = textarea.cursor();
        let text = textarea.text();

        // Adjust the provided byte offset to the nearest valid char boundary at or before it.
        let mut safe_cursor = cursor_offset.min(text.len());
        // If we're not on a char boundary, move back to the start of the current char.
        if safe_cursor < text.len() && !text.is_char_boundary(safe_cursor) {
            // Find the last valid boundary <= cursor_offset.
            safe_cursor = text
                .char_indices()
                .map(|(i, _)| i)
                .take_while(|&i| i <= cursor_offset)
                .last()
                .unwrap_or(0);
        }

        // Split the line around the (now safe) cursor position.
        let before_cursor = &text[..safe_cursor];
        let after_cursor = &text[safe_cursor..];

        // Detect whether we're on whitespace at the cursor boundary.
        let at_whitespace = if safe_cursor < text.len() {
            text[safe_cursor..]
                .chars()
                .next()
                .map(char::is_whitespace)
                .unwrap_or(false)
        } else {
            false
        };

        // Left candidate: token containing the cursor position.
        let start_left = before_cursor
            .char_indices()
            .rfind(|(_, c)| c.is_whitespace())
            .map(|(idx, c)| idx + c.len_utf8())
            .unwrap_or(0);
        let end_left_rel = after_cursor
            .char_indices()
            .find(|(_, c)| c.is_whitespace())
            .map(|(idx, _)| idx)
            .unwrap_or(after_cursor.len());
        let end_left = safe_cursor + end_left_rel;
        let token_left = if start_left < end_left {
            Some(&text[start_left..end_left])
        } else {
            None
        };

        // Right candidate: token immediately after any whitespace from the cursor.
        let ws_len_right: usize = after_cursor
            .chars()
            .take_while(|c| c.is_whitespace())
            .map(char::len_utf8)
            .sum();
        let start_right = safe_cursor + ws_len_right;
        let end_right_rel = text[start_right..]
            .char_indices()
            .find(|(_, c)| c.is_whitespace())
            .map(|(idx, _)| idx)
            .unwrap_or(text.len() - start_right);
        let end_right = start_right + end_right_rel;
        let token_right = if start_right < end_right {
            Some(&text[start_right..end_right])
        } else {
            None
        };

        let prefix_str = prefix.to_string();
        let left_match = token_left.filter(|t| t.starts_with(prefix));
        let right_match = token_right.filter(|t| t.starts_with(prefix));

        let left_prefixed = left_match.map(|t| t[prefix.len_utf8()..].to_string());
        let right_prefixed = right_match.map(|t| t[prefix.len_utf8()..].to_string());

        if at_whitespace {
            if right_prefixed.is_some() {
                return right_prefixed;
            }
            if token_left.is_some_and(|t| t == prefix_str) {
                return allow_empty.then(String::new);
            }
            return left_prefixed;
        }
        if after_cursor.starts_with(prefix) {
            let prefix_starts_token = before_cursor
                .chars()
                .next_back()
                .is_none_or(char::is_whitespace);
            return if prefix_starts_token {
                right_prefixed.or(left_prefixed)
            } else {
                left_prefixed
            };
        }
        left_prefixed.or(right_prefixed)
    }

    /// Extract the `@token` that the cursor is currently positioned on, if any.
    ///
    /// The returned string **does not** include the leading `@`.
    pub(crate) fn current_at_token(textarea: &TextArea) -> Option<String> {
        Self::current_prefixed_token(textarea, '@', /*allow_empty*/ false)
    }

    pub(crate) fn current_mention_token(&self) -> Option<String> {
        if !self.mentions_enabled() {
            return None;
        }
        Self::current_prefixed_token(&self.textarea, '$', /*allow_empty*/ true)
    }

    /// Replace the active `@token` (the one under the cursor) with `path`.
    fn insert_selected_path(&mut self, path: &str) {
        let cursor_offset = self.textarea.cursor();
        let text = self.textarea.text();
        // Clamp to a valid char boundary to avoid panics when slicing.
        let safe_cursor = text_ops::clamp_to_char_boundary(text, cursor_offset);

        let before_cursor = &text[..safe_cursor];
        let after_cursor = &text[safe_cursor..];

        // Determine token boundaries.
        let start_idx = before_cursor
            .char_indices()
            .rfind(|(_, c)| c.is_whitespace())
            .map(|(idx, c)| idx + c.len_utf8())
            .unwrap_or(0);

        let end_rel_idx = after_cursor
            .char_indices()
            .find(|(_, c)| c.is_whitespace())
            .map(|(idx, _)| idx)
            .unwrap_or(after_cursor.len());
        let end_idx = safe_cursor + end_rel_idx;

        // If the path contains whitespace, wrap it in double quotes so the
        // local prompt arg parser treats it as a single argument. Avoid adding
        // quotes when the path already contains one to keep behavior simple.
        let needs_quotes = path.chars().any(char::is_whitespace);
        let inserted = if needs_quotes && !path.contains('"') {
            format!("\"{path}\"")
        } else {
            path.to_string()
        };

        // Replace just the active `@token` so unrelated text elements, such as
        // large-paste placeholders, remain atomic and can still expand on submit.
        self.textarea
            .replace_range(start_idx..end_idx, &format!("{inserted} "));
        let new_cursor = start_idx.saturating_add(inserted.len()).saturating_add(1);
        self.textarea.set_cursor(new_cursor);
    }

    fn insert_selected_mention(&mut self, insert_text: &str, path: Option<&str>) {
        let cursor_offset = self.textarea.cursor();
        let text = self.textarea.text();
        let safe_cursor = text_ops::clamp_to_char_boundary(text, cursor_offset);

        let before_cursor = &text[..safe_cursor];
        let after_cursor = &text[safe_cursor..];

        let start_idx = before_cursor
            .char_indices()
            .rfind(|(_, c)| c.is_whitespace())
            .map(|(idx, c)| idx + c.len_utf8())
            .unwrap_or(0);

        let end_rel_idx = after_cursor
            .char_indices()
            .find(|(_, c)| c.is_whitespace())
            .map(|(idx, _)| idx)
            .unwrap_or(after_cursor.len());
        let end_idx = safe_cursor + end_rel_idx;

        // Remove the active token and insert the selected mention as an atomic element.
        self.textarea.replace_range(start_idx..end_idx, "");
        self.textarea.set_cursor(start_idx);
        let id = self.textarea.insert_element(insert_text);

        if let (Some(path), Some(mention)) =
            (path, Self::mention_name_from_insert_text(insert_text))
        {
            self.mention_bindings.insert(
                id,
                ComposerMentionBinding {
                    mention,
                    path: path.to_string(),
                },
            );
        }

        self.textarea.insert_str(" ");
        let new_cursor = start_idx
            .saturating_add(insert_text.len())
            .saturating_add(1);
        self.textarea.set_cursor(new_cursor);
    }

    pub(crate) fn mention_name_from_insert_text(insert_text: &str) -> Option<String> {
        let name = insert_text.strip_prefix('$')?;
        if name.is_empty() {
            return None;
        }
        if name
            .as_bytes()
            .iter()
            .all(|byte| is_mention_name_char(*byte))
        {
            Some(name.to_string())
        } else {
            None
        }
    }

    pub(crate) fn current_mention_elements(&self) -> Vec<(u64, String)> {
        self.textarea
            .text_element_snapshots()
            .into_iter()
            .filter_map(|snapshot| {
                Self::mention_name_from_insert_text(snapshot.text.as_str())
                    .map(|mention| (snapshot.id, mention))
            })
            .collect()
    }

    pub(crate) fn snapshot_mention_bindings(&self) -> Vec<MentionBinding> {
        let mut ordered = Vec::new();
        for (id, mention) in self.current_mention_elements() {
            if let Some(binding) = self.mention_bindings.get(&id)
                && binding.mention == mention
            {
                ordered.push(MentionBinding {
                    mention: binding.mention.clone(),
                    path: binding.path.clone(),
                });
            }
        }
        ordered
    }

    pub(crate) fn bind_mentions_from_snapshot(&mut self, mention_bindings: Vec<MentionBinding>) {
        self.mention_bindings.clear();
        if mention_bindings.is_empty() {
            return;
        }

        let text = self.textarea.text().to_string();
        let mut scan_from = 0usize;
        for binding in mention_bindings {
            let token = format!("${}", binding.mention);
            let Some(range) =
                find_next_mention_token_range(text.as_str(), token.as_str(), scan_from)
            else {
                continue;
            };

            let id = if let Some(id) = self.textarea.add_element_range(range.clone()) {
                Some(id)
            } else {
                self.textarea.element_id_for_exact_range(range.clone())
            };

            if let Some(id) = id {
                self.mention_bindings.insert(
                    id,
                    ComposerMentionBinding {
                        mention: binding.mention,
                        path: binding.path,
                    },
                );
                scan_from = range.end;
            }
        }
    }

    /// Prepare text for submission/queuing. Returns None if submission should be suppressed.
    /// On success, clears pending paste payloads because placeholders have been expanded.
    ///
    /// When `record_history` is true, the final submission is stored for ↑/↓ recall.
    pub(crate) fn prepare_submission_text(
        &mut self,
        record_history: bool,
    ) -> Option<(String, Vec<TextElement>)> {
        let mut text = self.textarea.text().to_string();
        let original_input = text.clone();
        let original_text_elements = self.textarea.text_elements();
        let original_mention_bindings = self.snapshot_mention_bindings();
        let original_local_image_paths = self
            .attached_images
            .iter()
            .map(|img| img.path.clone())
            .collect::<Vec<_>>();
        let original_pending_pastes = self.pending_pastes.clone();
        let mut text_elements = original_text_elements.clone();
        let input_starts_with_space = original_input.starts_with(' ');
        self.recent_submission_mention_bindings.clear();
        self.textarea.set_text_clearing_elements("");

        if !self.pending_pastes.is_empty() {
            // Expand placeholders so element byte ranges stay aligned.
            let (expanded, expanded_elements) =
                expand_pending_pastes(&text, text_elements, &self.pending_pastes);
            text = expanded;
            text_elements = expanded_elements;
        }

        let expanded_input = text.clone();

        // If there is neither text nor attachments, suppress submission entirely.
        text = text.trim().to_string();
        text_elements = text_ops::trim_text_elements(&expanded_input, &text, text_elements);

        if self.slash_commands_enabled()
            && let Some((name, _rest, _rest_offset)) = parse_slash_name(&text)
        {
            let treat_as_plain_text = input_starts_with_space || name.contains('/');
            if !treat_as_plain_text {
                let is_builtin =
                    slash_commands::find_builtin_command(name, self.builtin_command_flags())
                        .is_some();
                let prompt_prefix = format!("{PROMPTS_CMD_PREFIX}:");
                let is_known_prompt = name
                    .strip_prefix(&prompt_prefix)
                    .map(|prompt_name| {
                        self.custom_prompts
                            .iter()
                            .any(|prompt| prompt.name == prompt_name)
                    })
                    .unwrap_or(false);
                if !is_builtin && !is_known_prompt {
                    let message = format!(
                        r#"Unrecognized command '/{name}'. Type "/" for a list of supported commands."#
                    );
                    self.app_event_tx.send(AppEvent::InsertHistoryCell(Box::new(
                        history_cell::new_info_event(message, /*hint*/ None),
                    )));
                    self.set_text_content_with_mention_bindings(
                        original_input.clone(),
                        original_text_elements,
                        original_local_image_paths,
                        original_mention_bindings,
                    );
                    self.pending_pastes.clone_from(&original_pending_pastes);
                    self.textarea.set_cursor(original_input.len());
                    return None;
                }
            }
        }

        if self.slash_commands_enabled() {
            let expanded_prompt =
                match expand_custom_prompt(&text, &text_elements, &self.custom_prompts) {
                    Ok(expanded) => expanded,
                    Err(err) => {
                        self.app_event_tx.send(AppEvent::InsertHistoryCell(Box::new(
                            history_cell::new_error_event(err.user_message()),
                        )));
                        self.set_text_content_with_mention_bindings(
                            original_input.clone(),
                            original_text_elements,
                            original_local_image_paths,
                            original_mention_bindings,
                        );
                        self.pending_pastes.clone_from(&original_pending_pastes);
                        self.textarea.set_cursor(original_input.len());
                        return None;
                    }
                };
            if let Some(expanded) = expanded_prompt {
                text = expanded.text;
                text_elements = expanded.text_elements;
            }
        }
        let actual_chars = text.chars().count();
        if actual_chars > MAX_USER_INPUT_TEXT_CHARS {
            let message = user_input_too_large_message(actual_chars);
            self.app_event_tx.send(AppEvent::InsertHistoryCell(Box::new(
                history_cell::new_error_event(message),
            )));
            self.set_text_content_with_mention_bindings(
                original_input.clone(),
                original_text_elements,
                original_local_image_paths,
                original_mention_bindings,
            );
            self.pending_pastes.clone_from(&original_pending_pastes);
            self.textarea.set_cursor(original_input.len());
            return None;
        }
        // Custom prompt expansion can remove or rewrite image placeholders, so prune any
        // attachments that no longer have a corresponding placeholder in the expanded text.
        self.prune_attached_images_for_submission(&text, &text_elements);
        if text.is_empty() && self.attached_images.is_empty() && self.remote_image_urls.is_empty() {
            return None;
        }
        self.recent_submission_mention_bindings = original_mention_bindings.clone();
        if record_history
            && (!text.is_empty()
                || !self.attached_images.is_empty()
                || !self.remote_image_urls.is_empty())
        {
            let local_image_paths = self
                .attached_images
                .iter()
                .map(|img| img.path.clone())
                .collect();
            self.history.record_local_submission(HistoryEntry {
                text: text.clone(),
                text_elements: text_elements.clone(),
                local_image_paths,
                remote_image_urls: self.remote_image_urls.clone(),
                mention_bindings: original_mention_bindings,
                pending_pastes: Vec::new(),
            });
        }
        self.pending_pastes.clear();
        Some((text, text_elements))
    }

    /// Common logic for handling message submission/queuing.
    /// Returns the appropriate InputResult based on `should_queue`.
    pub(crate) fn handle_submission(&mut self, should_queue: bool) -> (InputResult, bool) {
        self.handle_submission_with_time(should_queue, Instant::now())
    }

    fn handle_submission_with_time(
        &mut self,
        should_queue: bool,
        now: Instant,
    ) -> (InputResult, bool) {
        // If the first line is a bare built-in slash command (no args),
        // dispatch it even when the slash popup isn't visible.
        if let Some(result) = self.try_dispatch_bare_slash_command() {
            return (result, true);
        }

        // If we're in a paste-like burst capture, treat Enter/Tab as part of the burst
        // and accumulate it rather than submitting or inserting immediately.
        // Do not treat as paste inside a slash-command context.
        let in_slash_context = self.slash_commands_enabled()
            && (matches!(self.active_popup, ActivePopup::Command(_))
                || self
                    .textarea
                    .text()
                    .lines()
                    .next()
                    .unwrap_or("")
                    .starts_with('/'));
        if !self.disable_paste_burst
            && self.paste_burst.is_active()
            && !in_slash_context
            && self.paste_burst.append_newline_if_active(now)
        {
            return (InputResult::None, true);
        }

        // During a paste-like burst, treat Enter as a newline instead of submit.
        if !in_slash_context
            && !self.disable_paste_burst
            && self
                .paste_burst
                .newline_should_insert_instead_of_submit(now)
        {
            self.textarea.insert_str("\n");
            self.paste_burst.extend_window(now);
            return (InputResult::None, true);
        }

        let original_input = self.textarea.text().to_string();
        let original_text_elements = self.textarea.text_elements();
        let original_mention_bindings = self.snapshot_mention_bindings();
        let original_local_image_paths = self
            .attached_images
            .iter()
            .map(|img| img.path.clone())
            .collect::<Vec<_>>();
        let original_pending_pastes = self.pending_pastes.clone();
        if let Some(result) = self.try_dispatch_slash_command_with_args() {
            return (result, true);
        }

        if let Some((text, text_elements)) =
            self.prepare_submission_text(/*record_history*/ true)
        {
            if should_queue {
                (
                    InputResult::Queued {
                        text,
                        text_elements,
                    },
                    true,
                )
            } else {
                // Do not clear attached_images here; ChatWidget drains them via take_recent_submission_images().
                (
                    InputResult::Submitted {
                        text,
                        text_elements,
                    },
                    true,
                )
            }
        } else {
            // Restore text if submission was suppressed.
            self.set_text_content_with_mention_bindings(
                original_input,
                original_text_elements,
                original_local_image_paths,
                original_mention_bindings,
            );
            self.pending_pastes = original_pending_pastes;
            (InputResult::None, true)
        }
    }

    /// Check if the first line is a bare slash command (no args) and dispatch it.
    fn try_dispatch_bare_slash_command(&mut self) -> Option<InputResult> {
        if !self.slash_commands_enabled() {
            return None;
        }
        let first_line = self.textarea.text().lines().next().unwrap_or("");
        if let Some((name, rest, _rest_offset)) = parse_slash_name(first_line)
            && rest.is_empty()
            && let Some(cmd) =
                slash_commands::find_builtin_command(name, self.builtin_command_flags())
        {
            if self.reject_slash_command_if_unavailable(cmd) {
                return Some(InputResult::None);
            }
            self.textarea.set_text_clearing_elements("");
            Some(InputResult::Command(cmd))
        } else {
            None
        }
    }

    /// Check if the input is a slash command with args (e.g., /review args) and dispatch it.
    fn try_dispatch_slash_command_with_args(&mut self) -> Option<InputResult> {
        if !self.slash_commands_enabled() {
            return None;
        }
        let text = self.textarea.text().to_string();
        if text.starts_with(' ') {
            return None;
        }

        let (name, rest, rest_offset) = parse_slash_name(&text)?;
        if rest.is_empty() || name.contains('/') {
            return None;
        }

        let cmd = slash_commands::find_builtin_command(name, self.builtin_command_flags())?;

        if !cmd.supports_inline_args() {
            return None;
        }
        if self.reject_slash_command_if_unavailable(cmd) {
            return Some(InputResult::None);
        }

        let mut args_elements =
            Self::slash_command_args_elements(rest, rest_offset, &self.textarea.text_elements());
        let trimmed_rest = rest.trim();
        args_elements = text_ops::trim_text_elements(rest, trimmed_rest, args_elements);
        Some(InputResult::CommandWithArgs(
            cmd,
            trimmed_rest.to_string(),
            args_elements,
        ))
    }

    /// Expand pending placeholders and extract normalized inline-command args.
    pub(crate) fn prepare_inline_args_submission(
        &mut self,
        record_history: bool,
    ) -> Option<(String, Vec<TextElement>)> {
        let (prepared_text, prepared_elements) = self.prepare_submission_text(record_history)?;
        let (_, prepared_rest, prepared_rest_offset) = parse_slash_name(&prepared_text)?;
        let mut args_elements = Self::slash_command_args_elements(
            prepared_rest,
            prepared_rest_offset,
            &prepared_elements,
        );
        let trimmed_rest = prepared_rest.trim();
        args_elements = text_ops::trim_text_elements(prepared_rest, trimmed_rest, args_elements);
        Some((trimmed_rest.to_string(), args_elements))
    }

    pub(crate) fn reject_slash_command_if_unavailable(&self, cmd: SlashCommand) -> bool {
        if !self.is_task_running || cmd.available_during_task() {
            return false;
        }
        let message = format!(
            "'/{}' is disabled while a task is in progress.",
            cmd.command()
        );
        self.app_event_tx.send(AppEvent::InsertHistoryCell(Box::new(
            history_cell::new_error_event(message),
        )));
        true
    }

    /// Translate full-text element ranges into command-argument ranges.
    ///
    /// `rest_offset` is the byte offset where `rest` begins in the full text.
    fn slash_command_args_elements(
        rest: &str,
        rest_offset: usize,
        text_elements: &[TextElement],
    ) -> Vec<TextElement> {
        if rest.is_empty() || text_elements.is_empty() {
            return Vec::new();
        }
        text_elements
            .iter()
            .filter_map(|elem| {
                if elem.byte_range.end <= rest_offset {
                    return None;
                }
                let start = elem.byte_range.start.saturating_sub(rest_offset);
                let mut end = elem.byte_range.end.saturating_sub(rest_offset);
                if start >= rest.len() {
                    return None;
                }
                end = end.min(rest.len());
                (start < end).then_some(elem.map_range(|_| ByteRange { start, end }))
            })
            .collect()
    }

    fn clear_remote_image_selection(&mut self) {
        self.selected_remote_image_index = None;
    }

    fn remove_selected_remote_image(&mut self, selected_index: usize) {
        if selected_index >= self.remote_image_urls.len() {
            self.clear_remote_image_selection();
            return;
        }
        self.remote_image_urls.remove(selected_index);
        self.selected_remote_image_index = if self.remote_image_urls.is_empty() {
            None
        } else {
            Some(selected_index.min(self.remote_image_urls.len() - 1))
        };
        self.relabel_attached_images_and_update_placeholders();
        self.sync_popups();
    }

    fn handle_remote_image_selection_key(
        &mut self,
        key_event: &KeyEvent,
    ) -> Option<(InputResult, bool)> {
        if self.remote_image_urls.is_empty()
            || key_event.modifiers != KeyModifiers::NONE
            || key_event.kind != KeyEventKind::Press
        {
            return None;
        }

        match key_event.code {
            KeyCode::Up => {
                if let Some(selected) = self.selected_remote_image_index {
                    self.selected_remote_image_index = Some(selected.saturating_sub(1));
                    Some((InputResult::None, true))
                } else if self.textarea.cursor() == 0 {
                    self.selected_remote_image_index = Some(self.remote_image_urls.len() - 1);
                    Some((InputResult::None, true))
                } else {
                    None
                }
            }
            KeyCode::Down => {
                if let Some(selected) = self.selected_remote_image_index {
                    if selected + 1 < self.remote_image_urls.len() {
                        self.selected_remote_image_index = Some(selected + 1);
                    } else {
                        self.clear_remote_image_selection();
                    }
                    Some((InputResult::None, true))
                } else {
                    None
                }
            }
            KeyCode::Delete | KeyCode::Backspace => {
                if let Some(selected) = self.selected_remote_image_index {
                    self.remove_selected_remote_image(selected);
                    Some((InputResult::None, true))
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    /// Handle key event when no popup is visible.
    fn handle_key_event_without_popup(&mut self, key_event: KeyEvent) -> (InputResult, bool) {
        if let Some((result, redraw)) = self.handle_remote_image_selection_key(&key_event) {
            return (result, redraw);
        }
        if self.selected_remote_image_index.is_some() {
            self.clear_remote_image_selection();
        }
        if self.handle_shortcut_overlay_key(&key_event) {
            return (InputResult::None, true);
        }
        if key_event.code == KeyCode::Esc {
            if self.is_empty() {
                let next_mode = esc_hint_mode(self.footer_mode, self.is_task_running);
                if next_mode != self.footer_mode {
                    self.footer_mode = next_mode;
                    return (InputResult::None, true);
                }
            }
        } else {
            self.footer_mode = reset_mode_after_activity(self.footer_mode);
        }
        match key_event {
            KeyEvent {
                code: KeyCode::Char('d'),
                modifiers: crossterm::event::KeyModifiers::CONTROL,
                kind: KeyEventKind::Press,
                ..
            } if self.is_empty() => (InputResult::None, false),
            // -------------------------------------------------------------
            // History navigation (Up / Down) – only when the composer is not
            // empty or when the cursor is at the correct position, to avoid
            // interfering with normal cursor movement.
            // -------------------------------------------------------------
            KeyEvent {
                code: KeyCode::Up | KeyCode::Down,
                kind: KeyEventKind::Press | KeyEventKind::Repeat,
                ..
            }
            | KeyEvent {
                code: KeyCode::Char('p') | KeyCode::Char('n'),
                modifiers: KeyModifiers::CONTROL,
                ..
            } => {
                if self
                    .history
                    .should_handle_navigation(self.textarea.text(), self.textarea.cursor())
                {
                    let replace_entry = match key_event.code {
                        KeyCode::Up => self.history.navigate_up(&self.app_event_tx),
                        KeyCode::Down => self.history.navigate_down(&self.app_event_tx),
                        KeyCode::Char('p') => self.history.navigate_up(&self.app_event_tx),
                        KeyCode::Char('n') => self.history.navigate_down(&self.app_event_tx),
                        _ => unreachable!(),
                    };
                    if let Some(entry) = replace_entry {
                        self.apply_history_entry(entry);
                        return (InputResult::None, true);
                    }
                }
                self.handle_input_basic(key_event)
            }
            KeyEvent {
                code: KeyCode::Tab,
                modifiers: KeyModifiers::NONE,
                kind: KeyEventKind::Press,
                ..
            } if !self.is_bang_shell_command() => self.handle_submission(self.is_task_running),
            KeyEvent {
                code: KeyCode::Enter,
                modifiers: KeyModifiers::NONE,
                ..
            } => self.handle_submission(/*should_queue*/ false),
            input => self.handle_input_basic(input),
        }
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn handle_voice_space_key_event(
        &mut self,
        _key_event: &KeyEvent,
    ) -> Option<(InputResult, bool)> {
        None
    }

    #[cfg(not(target_os = "linux"))]
    pub(crate) fn handle_voice_space_key_event(
        &mut self,
        key_event: &KeyEvent,
    ) -> Option<(InputResult, bool)> {
        if !self.voice_transcription_enabled() || !matches!(key_event.code, KeyCode::Char(' ')) {
            return None;
        }
        match key_event.kind {
            KeyEventKind::Press => {
                if self.paste_burst.is_active() {
                    return None;
                }

                // If textarea is empty, start recording immediately without inserting a space.
                if self.textarea.text().is_empty() {
                    if self.start_recording_with_placeholder() {
                        return Some((InputResult::None, true));
                    }
                    return None;
                }

                // If a hold is already pending, swallow further press events to
                // avoid inserting multiple spaces and resetting the timer on key repeat.
                if self.voice_state.space_hold_started_at.is_some() {
                    if !self.voice_state.key_release_supported {
                        self.voice_state.space_hold_repeat_seen = true;
                    }
                    return Some((InputResult::None, false));
                }

                // Insert a named element that renders as a space so we can later
                // remove it on timeout or convert it to a plain space on release.
                let elem_id = self.next_id();
                self.textarea.insert_named_element(" ", elem_id.clone());

                // Record pending hold metadata.
                self.voice_state.space_hold_started_at = Some(Instant::now());
                self.voice_state.space_hold_element_id = Some(elem_id);
                self.voice_state.space_hold_repeat_seen = false;

                // Spawn a delayed task to flip an atomic flag; we check it on next key event.
                let flag = Arc::new(AtomicBool::new(false));
                let frame = self.frame_requester.clone();
                Self::schedule_space_hold_timer(flag.clone(), frame);
                self.voice_state.space_hold_trigger = Some(flag);

                Some((InputResult::None, true))
            }
            // If we see a repeat before release, handling occurs in the top-level pending block.
            KeyEventKind::Repeat => {
                // Swallow repeats while a hold is pending to avoid extra spaces.
                if self.voice_state.space_hold_started_at.is_some() {
                    if !self.voice_state.key_release_supported {
                        self.voice_state.space_hold_repeat_seen = true;
                    }
                    return Some((InputResult::None, false));
                }
                // Fallback: if no pending hold, treat as normal input.
                None
            }
            // Space release without pending (fallback): treat as normal input.
            KeyEventKind::Release => {
                // If a hold is pending, convert the element to a plain space and clear state.
                self.voice_state.space_hold_started_at = None;
                if let Some(id) = self.voice_state.space_hold_element_id.take() {
                    let _ = self.textarea.replace_element_by_id(&id, " ");
                }
                self.voice_state.space_hold_trigger = None;
                self.voice_state.space_hold_repeat_seen = false;
                Some((InputResult::None, true))
            }
        }
    }

    #[cfg(target_os = "linux")]
    pub(crate) fn handle_key_event_while_recording(
        &mut self,
        _key_event: KeyEvent,
    ) -> Option<(InputResult, bool)> {
        None
    }

    #[cfg(not(target_os = "linux"))]
    pub(crate) fn handle_key_event_while_recording(
        &mut self,
        key_event: KeyEvent,
    ) -> Option<(InputResult, bool)> {
        if self.voice_state.voice.is_some() {
            let should_stop = if self.voice_state.key_release_supported {
                match key_event.kind {
                    KeyEventKind::Release => matches!(key_event.code, KeyCode::Char(' ')),
                    KeyEventKind::Press | KeyEventKind::Repeat => {
                        !matches!(key_event.code, KeyCode::Char(' '))
                    }
                }
            } else {
                match key_event.kind {
                    KeyEventKind::Release => matches!(key_event.code, KeyCode::Char(' ')),
                    KeyEventKind::Press | KeyEventKind::Repeat => {
                        if matches!(key_event.code, KeyCode::Char(' ')) {
                            self.voice_state.space_recording_last_repeat_at = Some(Instant::now());
                            false
                        } else {
                            true
                        }
                    }
                }
            };

            if should_stop {
                let needs_redraw = self.stop_recording_and_start_transcription();
                return Some((InputResult::None, needs_redraw));
            }

            // Swallow non-stopping keys while recording.
            return Some((InputResult::None, false));
        }

        None
    }

    pub(crate) fn is_bang_shell_command(&self) -> bool {
        self.textarea.text().trim_start().starts_with('!')
    }

    /// Handles keys that mutate the textarea, including paste-burst detection.
    fn handle_input_basic(&mut self, input: KeyEvent) -> (InputResult, bool) {
        // Ignore key releases here to avoid treating them as additional input
        // (e.g., appending the same character twice via paste-burst logic).
        if !matches!(input.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
            return (InputResult::None, false);
        }

        self.handle_input_basic_with_time(input, Instant::now())
    }

    pub(crate) fn handle_input_basic_with_time(
        &mut self,
        input: KeyEvent,
        now: Instant,
    ) -> (InputResult, bool) {
        // If we have a buffered non-bracketed paste burst and enough time has
        // elapsed since the last char, flush it before handling a new input.
        self.handle_paste_burst_flush(now);

        if !matches!(input.code, KeyCode::Esc) {
            self.footer_mode = reset_mode_after_activity(self.footer_mode);
        }

        // If we're capturing a burst and receive Enter, accumulate it instead of inserting.
        if matches!(input.code, KeyCode::Enter)
            && !self.disable_paste_burst
            && self.paste_burst.is_active()
            && self.paste_burst.append_newline_if_active(now)
        {
            return (InputResult::None, true);
        }

        // Intercept plain Char inputs to optionally accumulate into a burst buffer.
        if let KeyEvent {
            code: KeyCode::Char(ch),
            modifiers,
            ..
        } = input
        {
            let has_ctrl_or_alt = has_ctrl_or_alt(modifiers);
            if !has_ctrl_or_alt && !self.disable_paste_burst {
                // Non-ASCII characters (e.g., from IMEs) can arrive in quick bursts, so avoid
                // holding the first char while still allowing burst detection for paste input.
                if !ch.is_ascii() {
                    return self.handle_non_ascii_char(input, now);
                }

                match self.paste_burst.on_plain_char(ch, now) {
                    CharDecision::BufferAppend => {
                        self.paste_burst.append_char_to_buffer(ch, now);
                        return (InputResult::None, true);
                    }
                    CharDecision::BeginBuffer { retro_chars } => {
                        let cur = self.textarea.cursor();
                        let txt = self.textarea.text();
                        let safe_cur = text_ops::clamp_to_char_boundary(txt, cur);
                        let before = &txt[..safe_cur];
                        if let Some(grab) =
                            self.paste_burst
                                .decide_begin_buffer(now, before, retro_chars as usize)
                        {
                            if !grab.grabbed.is_empty() {
                                self.textarea.replace_range(grab.start_byte..safe_cur, "");
                            }
                            self.paste_burst.append_char_to_buffer(ch, now);
                            return (InputResult::None, true);
                        }
                        // If decide_begin_buffer opted not to start buffering,
                        // fall through to normal insertion below.
                    }
                    CharDecision::BeginBufferFromPending => {
                        // First char was held; now append the current one.
                        self.paste_burst.append_char_to_buffer(ch, now);
                        return (InputResult::None, true);
                    }
                    CharDecision::RetainFirstChar => {
                        // Keep the first fast char pending momentarily.
                        return (InputResult::None, true);
                    }
                }
            }
            if let Some(pasted) = self.paste_burst.flush_before_modified_input() {
                self.handle_paste(pasted);
            }
        }

        // Flush any buffered burst before applying a non-char input (arrow keys, etc).
        if !matches!(input.code, KeyCode::Char(_) | KeyCode::Enter)
            && let Some(pasted) = self.paste_burst.flush_before_modified_input()
        {
            self.handle_paste(pasted);
        }
        // For non-char inputs (or after flushing), handle normally.
        // Track element removals so we can drop any corresponding placeholders without scanning
        // the full text. (Placeholders are atomic elements; when deleted, the element disappears.)
        let elements_before = if self.pending_pastes.is_empty()
            && self.attached_images.is_empty()
            && self.remote_image_urls.is_empty()
        {
            None
        } else {
            Some(self.textarea.element_payloads())
        };

        self.textarea.input(input);

        if let Some(elements_before) = elements_before {
            self.reconcile_deleted_elements(elements_before);
        }

        // Update paste-burst heuristic for plain Char (no Ctrl/Alt) events.
        let crossterm::event::KeyEvent {
            code, modifiers, ..
        } = input;
        match code {
            KeyCode::Char(_) => {
                let has_ctrl_or_alt = has_ctrl_or_alt(modifiers);
                if has_ctrl_or_alt {
                    self.paste_burst.clear_window_after_non_char();
                }
            }
            KeyCode::Enter => {
                // Keep burst window alive (supports blank lines in paste).
            }
            _ => {
                // Other keys: clear burst window (buffer should have been flushed above if needed).
                self.paste_burst.clear_window_after_non_char();
            }
        }

        (InputResult::None, true)
    }

    pub(crate) fn reconcile_deleted_elements(&mut self, elements_before: Vec<String>) {
        let elements_after: HashSet<String> =
            self.textarea.element_payloads().into_iter().collect();

        let mut removed_any_image = false;
        for removed in elements_before
            .into_iter()
            .filter(|payload| !elements_after.contains(payload))
        {
            self.pending_pastes.retain(|(ph, _)| ph != &removed);

            if let Some(idx) = self
                .attached_images
                .iter()
                .position(|img| img.placeholder == removed)
            {
                self.attached_images.remove(idx);
                removed_any_image = true;
            }
        }

        if removed_any_image {
            self.relabel_attached_images_and_update_placeholders();
        }
    }

    pub(crate) fn relabel_attached_images_and_update_placeholders(&mut self) {
        for idx in 0..self.attached_images.len() {
            let expected = local_image_label_text(self.remote_image_urls.len() + idx + 1);
            let current = self.attached_images[idx].placeholder.clone();
            if current == expected {
                continue;
            }

            self.attached_images[idx].placeholder = expected.clone();
            let _renamed = self.textarea.replace_element_payload(&current, &expected);
        }
    }

    fn handle_shortcut_overlay_key(&mut self, key_event: &KeyEvent) -> bool {
        if key_event.kind != KeyEventKind::Press {
            return false;
        }

        let toggles = matches!(key_event.code, KeyCode::Char('?'))
            && !has_ctrl_or_alt(key_event.modifiers)
            && self.is_empty()
            && !self.is_in_paste_burst();

        if !toggles {
            return false;
        }

        let next = toggle_shortcut_mode(
            self.footer_mode,
            self.quit_shortcut_hint_visible(),
            self.is_empty(),
        );
        let changed = next != self.footer_mode;
        self.footer_mode = next;
        changed
    }

    #[cfg(not(target_os = "linux"))]
    pub(crate) fn schedule_space_hold_timer(flag: Arc<AtomicBool>, frame: Option<crate::tui::FrameRequester>) {
        const HOLD_DELAY_MILLIS: u64 = 1_000;
        if let Ok(handle) = Handle::try_current() {
            let flag_clone = flag;
            let frame_clone = frame;
            handle.spawn(async move {
                tokio::time::sleep(Duration::from_millis(HOLD_DELAY_MILLIS)).await;
                Self::complete_space_hold_timer(flag_clone, frame_clone);
            });
        } else {
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(HOLD_DELAY_MILLIS));
                Self::complete_space_hold_timer(flag, frame);
            });
        }
    }

    #[cfg(not(target_os = "linux"))]
    fn complete_space_hold_timer(flag: Arc<AtomicBool>, frame: Option<crate::tui::FrameRequester>) {
        flag.store(true, Ordering::Relaxed);
        if let Some(frame) = frame {
            frame.schedule_frame();
        }
    }
}
