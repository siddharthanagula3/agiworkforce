use crate::bottom_pane::chat_composer::ActivePopup;
use crate::bottom_pane::chat_composer::AttachedImage;
use crate::bottom_pane::chat_composer::ChatComposer;
use crate::bottom_pane::chat_composer::FooterFlash;
use crate::bottom_pane::chat_composer::InputResult;
use crate::bottom_pane::chat_composer_history::HistoryEntry;
use crate::bottom_pane::footer::CollaborationModeIndicator;
use crate::bottom_pane::footer::FooterMode;
use crate::bottom_pane::footer::esc_hint_mode;
use crate::bottom_pane::footer::reset_mode_after_activity;
use crate::bottom_pane::LocalImageAttachment;
use crate::bottom_pane::MentionBinding;
use crate::tui::FrameRequester;
use agiworkforce_core::plugins::PluginCapabilitySummary;
use agiworkforce_core::skills::model::SkillMetadata;
use agiworkforce_file_search::FileMatch;
use agiworkforce_protocol::models::local_image_label_text;
use agiworkforce_protocol::user_input::TextElement;
use ratatui::layout::Rect;
use ratatui::text::Line;
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;
use std::time::Instant;

use crate::app_event::ConnectorsSnapshot;
use crate::key_hint::KeyBinding;

impl ChatComposer {
    pub(crate) fn set_frame_requester(&mut self, frame_requester: FrameRequester) {
        self.frame_requester = Some(frame_requester);
    }

    pub fn set_skill_mentions(&mut self, skills: Option<Vec<SkillMetadata>>) {
        self.skills = skills;
    }

    pub fn set_plugin_mentions(&mut self, plugins: Option<Vec<PluginCapabilitySummary>>) {
        self.plugins = plugins;
        self.sync_popups();
    }

    pub fn set_plugins_command_enabled(&mut self, enabled: bool) {
        self.plugins_command_enabled = enabled;
    }

    pub fn set_connector_mentions(&mut self, connectors_snapshot: Option<ConnectorsSnapshot>) {
        self.connectors_snapshot = connectors_snapshot;
        self.sync_popups();
    }

    pub(crate) fn take_mention_bindings(&mut self) -> Vec<MentionBinding> {
        let elements = self.current_mention_elements();
        let mut ordered = Vec::new();
        for (id, mention) in elements {
            if let Some(binding) = self.mention_bindings.remove(&id)
                && binding.mention == mention
            {
                ordered.push(MentionBinding {
                    mention: binding.mention,
                    path: binding.path,
                });
            }
        }
        self.mention_bindings.clear();
        ordered
    }

    pub fn set_collaboration_modes_enabled(&mut self, enabled: bool) {
        self.collaboration_modes_enabled = enabled;
    }

    pub fn set_connectors_enabled(&mut self, enabled: bool) {
        self.connectors_enabled = enabled;
    }

    pub fn set_fast_command_enabled(&mut self, enabled: bool) {
        self.fast_command_enabled = enabled;
    }

    pub fn set_collaboration_mode_indicator(
        &mut self,
        indicator: Option<CollaborationModeIndicator>,
    ) {
        self.collaboration_mode_indicator = indicator;
    }

    pub fn set_personality_command_enabled(&mut self, enabled: bool) {
        self.personality_command_enabled = enabled;
    }

    pub fn set_realtime_conversation_enabled(&mut self, enabled: bool) {
        self.realtime_conversation_enabled = enabled;
    }

    pub fn set_audio_device_selection_enabled(&mut self, enabled: bool) {
        self.audio_device_selection_enabled = enabled;
    }

    /// Compatibility shim for tests that still toggle the removed steer mode flag.
    #[cfg(test)]
    pub fn set_steer_enabled(&mut self, _enabled: bool) {}

    pub fn set_voice_transcription_enabled(&mut self, enabled: bool) {
        self.voice_state.transcription_enabled = enabled;
        if !enabled {
            self.voice_state.space_hold_started_at = None;
            if let Some(id) = self.voice_state.space_hold_element_id.take() {
                let _ = self.textarea.replace_element_by_id(&id, " ");
            }
            self.voice_state.space_hold_trigger = None;
            self.voice_state.space_hold_repeat_seen = false;
        }
    }

    #[cfg(target_os = "windows")]
    pub fn set_windows_degraded_sandbox_active(&mut self, enabled: bool) {
        self.windows_degraded_sandbox_active = enabled;
    }

    pub fn cursor_pos(&self, area: Rect) -> Option<(u16, u16)> {
        if !self.input_enabled {
            return None;
        }

        // Hide the cursor while recording voice input.
        #[cfg(not(target_os = "linux"))]
        if self.voice_state.voice.is_some() {
            return None;
        }
        let [_, _, textarea_rect, _] = self.layout_areas(area);
        let state = *self.textarea_state.borrow();
        self.textarea.cursor_pos_with_state(textarea_rect, state)
    }

    /// Returns true if the composer currently contains no user-entered input.
    pub(crate) fn is_empty(&self) -> bool {
        self.textarea.is_empty()
            && self.attached_images.is_empty()
            && self.remote_image_urls.is_empty()
    }

    /// Record the history metadata advertised by `SessionConfiguredEvent` so
    /// that the composer can navigate cross-session history.
    pub(crate) fn set_history_metadata(&mut self, log_id: u64, entry_count: usize) {
        self.history.set_metadata(log_id, entry_count);
    }

    /// Integrate an asynchronous response to an on-demand history lookup.
    ///
    /// If the entry is present and the offset still matches the active history cursor, the
    /// composer rehydrates the entry immediately. This path intentionally routes through
    /// [`Self::apply_history_entry`] so cursor placement remains aligned with keyboard history
    /// recall semantics.
    pub(crate) fn on_history_entry_response(
        &mut self,
        log_id: u64,
        offset: usize,
        entry: Option<String>,
    ) -> bool {
        let Some(entry) = self.history.on_entry_response(log_id, offset, entry) else {
            return false;
        };
        // Persistent ↑/↓ history is text-only (backwards-compatible and avoids persisting
        // attachments), but local in-session ↑/↓ history can rehydrate elements and image paths.
        self.apply_history_entry(entry);
        true
    }

    /// Replace the composer content with text from an external editor.
    /// Clears pending paste placeholders and keeps only attachments whose
    /// placeholder labels still appear in the new text. Image placeholders
    /// are renumbered to `[Image #M+1]..[Image #N]` (where `M` is the number of
    /// remote images). Cursor is placed at the end after rebuilding elements.
    pub(crate) fn apply_external_edit(&mut self, text: String) {
        self.pending_pastes.clear();

        // Count placeholder occurrences in the new text.
        let mut placeholder_counts: HashMap<String, usize> = HashMap::new();
        for placeholder in self.attached_images.iter().map(|img| &img.placeholder) {
            if placeholder_counts.contains_key(placeholder) {
                continue;
            }
            let count = text.match_indices(placeholder).count();
            if count > 0 {
                placeholder_counts.insert(placeholder.clone(), count);
            }
        }

        // Keep attachments only while we have matching occurrences left.
        let mut kept_images = Vec::new();
        for img in self.attached_images.drain(..) {
            if let Some(count) = placeholder_counts.get_mut(&img.placeholder)
                && *count > 0
            {
                *count -= 1;
                kept_images.push(img);
            }
        }
        self.attached_images = kept_images;

        // Rebuild textarea so placeholders become elements again.
        self.textarea.set_text_clearing_elements("");
        let mut remaining: HashMap<&str, usize> = HashMap::new();
        for img in &self.attached_images {
            *remaining.entry(img.placeholder.as_str()).or_insert(0) += 1;
        }

        let mut occurrences: Vec<(usize, &str)> = Vec::new();
        for placeholder in remaining.keys() {
            for (pos, _) in text.match_indices(placeholder) {
                occurrences.push((pos, *placeholder));
            }
        }
        occurrences.sort_unstable_by_key(|(pos, _)| *pos);

        let mut idx = 0usize;
        for (pos, ph) in occurrences {
            let Some(count) = remaining.get_mut(ph) else {
                continue;
            };
            if *count == 0 {
                continue;
            }
            if pos > idx {
                self.textarea.insert_str(&text[idx..pos]);
            }
            self.textarea.insert_element(ph);
            *count -= 1;
            idx = pos + ph.len();
        }
        if idx < text.len() {
            self.textarea.insert_str(&text[idx..]);
        }

        // Keep local image placeholders normalized in attachment order after the
        // remote-image prefix.
        self.relabel_attached_images_and_update_placeholders();
        self.textarea.set_cursor(self.textarea.text().len());
        self.sync_popups();
    }

    /// Override the footer hint items displayed beneath the composer. Passing
    /// `None` restores the default shortcut footer.
    pub(crate) fn set_footer_hint_override(&mut self, items: Option<Vec<(String, String)>>) {
        self.footer_hint_override = items;
    }

    pub(crate) fn set_remote_image_urls(&mut self, urls: Vec<String>) {
        self.remote_image_urls = urls;
        self.selected_remote_image_index = None;
        self.relabel_attached_images_and_update_placeholders();
        self.sync_popups();
    }

    pub(crate) fn remote_image_urls(&self) -> Vec<String> {
        self.remote_image_urls.clone()
    }

    pub(crate) fn take_remote_image_urls(&mut self) -> Vec<String> {
        let urls = std::mem::take(&mut self.remote_image_urls);
        self.selected_remote_image_index = None;
        self.relabel_attached_images_and_update_placeholders();
        self.sync_popups();
        urls
    }

    #[cfg(test)]
    pub(crate) fn show_footer_flash(&mut self, line: Line<'static>, duration: Duration) {
        let expires_at = Instant::now()
            .checked_add(duration)
            .unwrap_or_else(Instant::now);
        self.footer_flash = Some(FooterFlash { line, expires_at });
    }

    pub(crate) fn footer_flash_visible(&self) -> bool {
        self.footer_flash
            .as_ref()
            .is_some_and(|flash| Instant::now() < flash.expires_at)
    }

    /// Replace the entire composer content with `text` and reset cursor.
    ///
    /// This is the "fresh draft" path: it clears pending paste payloads and
    /// mention link targets. Callers restoring a previously submitted draft
    /// that must keep `$name -> path` resolution should use
    /// [`Self::set_text_content_with_mention_bindings`] instead.
    pub(crate) fn set_text_content(
        &mut self,
        text: String,
        text_elements: Vec<TextElement>,
        local_image_paths: Vec<PathBuf>,
    ) {
        self.set_text_content_with_mention_bindings(
            text,
            text_elements,
            local_image_paths,
            Vec::new(),
        );
    }

    /// Replace the entire composer content while restoring mention link targets.
    ///
    /// Mention popup insertion stores both visible text (for example `$file`)
    /// and hidden mention bindings used to resolve the canonical target during
    /// submission. Use this method when restoring an interrupted or blocked
    /// draft; if callers restore only text and images, mentions can appear
    /// intact to users while resolving to the wrong target or dropping on
    /// retry.
    ///
    /// This helper intentionally places the cursor at the start of the restored text. Callers
    /// that need end-of-line restore behavior (for example shell-style history recall) should call
    /// [`Self::move_cursor_to_end`] after this method.
    pub(crate) fn set_text_content_with_mention_bindings(
        &mut self,
        text: String,
        text_elements: Vec<TextElement>,
        local_image_paths: Vec<PathBuf>,
        mention_bindings: Vec<MentionBinding>,
    ) {
        #[cfg(not(target_os = "linux"))]
        self.stop_all_transcription_spinners();

        // Clear any existing content, placeholders, and attachments first.
        self.textarea.set_text_clearing_elements("");
        self.pending_pastes.clear();
        self.attached_images.clear();
        self.mention_bindings.clear();

        self.textarea.set_text_with_elements(&text, &text_elements);

        for (idx, path) in local_image_paths.into_iter().enumerate() {
            let placeholder = local_image_label_text(self.remote_image_urls.len() + idx + 1);
            self.attached_images
                .push(AttachedImage { placeholder, path });
        }

        self.bind_mentions_from_snapshot(mention_bindings);
        self.relabel_attached_images_and_update_placeholders();
        self.selected_remote_image_index = None;
        self.textarea.set_cursor(/*pos*/ 0);
        self.sync_popups();
    }

    /// Update the placeholder text without changing input enablement.
    pub(crate) fn set_placeholder_text(&mut self, placeholder: String) {
        self.placeholder_text = placeholder;
    }

    /// Move the cursor to the end of the current text buffer.
    pub(crate) fn move_cursor_to_end(&mut self) {
        self.textarea.set_cursor(self.textarea.text().len());
        self.sync_popups();
    }

    pub(crate) fn clear_for_ctrl_c(&mut self) -> Option<String> {
        if self.is_empty() {
            return None;
        }
        let previous = self.current_text();
        let text_elements = self.textarea.text_elements();
        let local_image_paths = self
            .attached_images
            .iter()
            .map(|img| img.path.clone())
            .collect();
        let pending_pastes = std::mem::take(&mut self.pending_pastes);
        let remote_image_urls = self.remote_image_urls.clone();
        let mention_bindings = self.snapshot_mention_bindings();
        self.set_text_content(String::new(), Vec::new(), Vec::new());
        self.remote_image_urls.clear();
        self.selected_remote_image_index = None;
        self.history.reset_navigation();
        self.history.record_local_submission(HistoryEntry {
            text: previous.clone(),
            text_elements,
            local_image_paths,
            remote_image_urls,
            mention_bindings,
            pending_pastes,
        });
        Some(previous)
    }

    /// Get the current composer text.
    pub(crate) fn current_text(&self) -> String {
        self.textarea.text().to_string()
    }

    /// Rehydrate a history entry into the composer with shell-like cursor placement.
    ///
    /// This path restores text, elements, images, mention bindings, and pending paste payloads,
    /// then moves the cursor to end-of-line. If a caller reused
    /// [`Self::set_text_content_with_mention_bindings`] directly for history recall and forgot the
    /// final cursor move, repeated Up/Down would stop navigating history because cursor-gating
    /// treats interior positions as normal editing mode.
    pub(crate) fn apply_history_entry(&mut self, entry: HistoryEntry) {
        let HistoryEntry {
            text,
            text_elements,
            local_image_paths,
            remote_image_urls,
            mention_bindings,
            pending_pastes,
        } = entry;
        self.set_remote_image_urls(remote_image_urls);
        self.set_text_content_with_mention_bindings(
            text,
            text_elements,
            local_image_paths,
            mention_bindings,
        );
        self.set_pending_pastes(pending_pastes);
        self.move_cursor_to_end();
    }

    pub(crate) fn text_elements(&self) -> Vec<TextElement> {
        self.textarea.text_elements()
    }

    #[cfg(test)]
    pub(crate) fn local_image_paths(&self) -> Vec<PathBuf> {
        self.attached_images
            .iter()
            .map(|img| img.path.clone())
            .collect()
    }

    #[cfg(test)]
    pub(crate) fn status_line_text(&self) -> Option<String> {
        self.status_line_value.as_ref().map(|line| {
            line.spans
                .iter()
                .map(|span| span.content.as_ref())
                .collect::<String>()
        })
    }

    pub(crate) fn local_images(&self) -> Vec<LocalImageAttachment> {
        self.attached_images
            .iter()
            .map(|img| LocalImageAttachment {
                placeholder: img.placeholder.clone(),
                path: img.path.clone(),
            })
            .collect()
    }

    pub(crate) fn mention_bindings(&self) -> Vec<MentionBinding> {
        self.snapshot_mention_bindings()
    }

    pub(crate) fn take_recent_submission_mention_bindings(&mut self) -> Vec<MentionBinding> {
        std::mem::take(&mut self.recent_submission_mention_bindings)
    }

    pub(crate) fn prune_attached_images_for_submission(
        &mut self,
        text: &str,
        text_elements: &[TextElement],
    ) {
        if self.attached_images.is_empty() {
            return;
        }
        let image_placeholders: HashSet<&str> = text_elements
            .iter()
            .filter_map(|elem| elem.placeholder(text))
            .collect();
        self.attached_images
            .retain(|img| image_placeholders.contains(img.placeholder.as_str()));
    }

    /// Insert an attachment placeholder and track it for the next submission.
    pub fn attach_image(&mut self, path: PathBuf) {
        let image_number = self.remote_image_urls.len() + self.attached_images.len() + 1;
        let placeholder = local_image_label_text(image_number);
        // Insert as an element to match large paste placeholder behavior:
        // styled distinctly and treated atomically for cursor/mutations.
        self.textarea.insert_element(&placeholder);
        self.attached_images
            .push(AttachedImage { placeholder, path });
    }

    #[cfg(test)]
    pub fn take_recent_submission_images(&mut self) -> Vec<PathBuf> {
        let images = std::mem::take(&mut self.attached_images);
        images.into_iter().map(|img| img.path).collect()
    }

    pub fn take_recent_submission_images_with_placeholders(&mut self) -> Vec<LocalImageAttachment> {
        let images = std::mem::take(&mut self.attached_images);
        images
            .into_iter()
            .map(|img| LocalImageAttachment {
                placeholder: img.placeholder,
                path: img.path,
            })
            .collect()
    }

    /// Integrate results from an asynchronous file search.
    pub(crate) fn on_file_search_result(&mut self, query: String, matches: Vec<FileMatch>) {
        // Only apply if user is still editing a token starting with `query`.
        let current_opt = Self::current_at_token(&self.textarea);
        let Some(current_token) = current_opt else {
            return;
        };

        if !current_token.starts_with(&query) {
            return;
        }

        if let ActivePopup::File(popup) = &mut self.active_popup {
            popup.set_matches(&query, matches);
        }
    }

    /// Show the transient "press again to quit" hint for `key`.
    ///
    /// The owner (`BottomPane`/`ChatWidget`) is responsible for scheduling a
    /// redraw after [`super::QUIT_SHORTCUT_TIMEOUT`] so the hint can disappear
    /// even when the UI is otherwise idle.
    pub fn show_quit_shortcut_hint(&mut self, key: KeyBinding, has_focus: bool) {
        self.quit_shortcut_expires_at = Instant::now()
            .checked_add(super::super::QUIT_SHORTCUT_TIMEOUT)
            .or_else(|| Some(Instant::now()));
        self.quit_shortcut_key = key;
        self.footer_mode = FooterMode::QuitShortcutReminder;
        self.set_has_focus(has_focus);
    }

    /// Clear the "press again to quit" hint immediately.
    pub fn clear_quit_shortcut_hint(&mut self, has_focus: bool) {
        self.quit_shortcut_expires_at = None;
        self.footer_mode = reset_mode_after_activity(self.footer_mode);
        self.set_has_focus(has_focus);
    }

    /// Whether the quit shortcut hint should currently be shown.
    ///
    /// This is time-based rather than event-based: it may become false without
    /// any additional user input, so the UI schedules a redraw when the hint
    /// expires.
    pub(crate) fn quit_shortcut_hint_visible(&self) -> bool {
        self.quit_shortcut_expires_at
            .is_some_and(|expires_at| Instant::now() < expires_at)
    }

    pub(crate) fn insert_str(&mut self, text: &str) {
        self.textarea.insert_str(text);
        self.sync_popups();
    }

    pub(crate) fn set_has_focus(&mut self, has_focus: bool) {
        self.has_focus = has_focus;
    }

    #[cfg(not(target_os = "linux"))]
    pub(crate) fn is_recording(&self) -> bool {
        self.voice_state.voice.is_some()
    }

    #[allow(dead_code)]
    pub(crate) fn set_input_enabled(&mut self, enabled: bool, placeholder: Option<String>) {
        self.input_enabled = enabled;
        self.input_disabled_placeholder = if enabled { None } else { placeholder };

        // Avoid leaving interactive popups open while input is blocked.
        if !enabled && !matches!(self.active_popup, ActivePopup::None) {
            self.active_popup = ActivePopup::None;
        }
    }

    pub fn set_task_running(&mut self, running: bool) {
        self.is_task_running = running;
    }

    pub(crate) fn set_context_window(&mut self, percent: Option<i64>, used_tokens: Option<i64>) {
        if self.context_window_percent == percent && self.context_window_used_tokens == used_tokens
        {
            return;
        }
        self.context_window_percent = percent;
        self.context_window_used_tokens = used_tokens;
    }

    pub(crate) fn set_esc_backtrack_hint(&mut self, show: bool) {
        self.esc_backtrack_hint = show;
        if show {
            self.footer_mode = esc_hint_mode(self.footer_mode, self.is_task_running);
        } else {
            self.footer_mode = reset_mode_after_activity(self.footer_mode);
        }
    }

    pub(crate) fn set_status_line(&mut self, status_line: Option<Line<'static>>) -> bool {
        if self.status_line_value == status_line {
            return false;
        }
        self.status_line_value = status_line;
        true
    }

    pub(crate) fn set_status_line_enabled(&mut self, enabled: bool) -> bool {
        if self.status_line_enabled == enabled {
            return false;
        }
        self.status_line_enabled = enabled;
        true
    }

    /// Replaces the contextual footer label for the currently viewed agent.
    ///
    /// Returning `false` means the value was unchanged, so callers can skip redraw work. This
    /// field is intentionally just cached presentation state; `ChatComposer` does not infer which
    /// thread is active on its own.
    pub(crate) fn set_active_agent_label(&mut self, active_agent_label: Option<String>) -> bool {
        if self.active_agent_label == active_agent_label {
            return false;
        }
        self.active_agent_label = active_agent_label;
        true
    }
}
