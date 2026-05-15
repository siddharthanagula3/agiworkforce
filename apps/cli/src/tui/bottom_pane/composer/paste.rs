use crate::bottom_pane::chat_composer::ChatComposer;
use crate::bottom_pane::paste_burst::FlushResult;
use crate::clipboard_paste::normalize_pasted_path;
use crate::clipboard_paste::pasted_image_format;
use crate::bottom_pane::paste_burst::PasteBurst;
use crate::bottom_pane::composer::text_ops::LARGE_PASTE_CHAR_THRESHOLD;
use std::time::Duration;
use std::time::Instant;

impl ChatComposer {
    /// Toggle composer-side image paste handling.
    ///
    /// This only affects whether image-like paste content is converted into attachments; the
    /// `ChatWidget` layer still performs capability checks before images are submitted.
    pub fn set_image_paste_enabled(&mut self, enabled: bool) {
        self.config.image_paste_enabled = enabled;
    }

    pub(crate) fn image_paste_enabled(&self) -> bool {
        self.config.image_paste_enabled
    }

    /// Integrate pasted text into the composer.
    ///
    /// Acts as the only place where paste text is integrated, both for:
    ///
    /// - Real/explicit paste events surfaced by the terminal, and
    /// - Non-bracketed "paste bursts" that [`PasteBurst`](super::paste_burst::PasteBurst) buffers
    ///   and later flushes here.
    ///
    /// Behavior:
    ///
    /// - If the paste is larger than `LARGE_PASTE_CHAR_THRESHOLD` chars, inserts a placeholder
    ///   element (expanded on submit) and stores the full text in `pending_pastes`.
    /// - Otherwise, if the paste looks like an image path, attaches the image and inserts a
    ///   trailing space so the user can keep typing naturally.
    /// - Otherwise, inserts the pasted text directly into the textarea.
    ///
    /// In all cases, clears any paste-burst Enter suppression state so a real paste cannot affect
    /// the next user Enter key, then syncs popup state.
    pub fn handle_paste(&mut self, pasted: String) -> bool {
        #[cfg(not(target_os = "linux"))]
        if self.voice_state.voice.is_some() {
            return false;
        }
        let pasted = pasted.replace("\r\n", "\n").replace('\r', "\n");
        let char_count = pasted.chars().count();
        if char_count > LARGE_PASTE_CHAR_THRESHOLD {
            let placeholder = self.next_large_paste_placeholder(char_count);
            self.textarea.insert_element(&placeholder);
            self.pending_pastes.push((placeholder, pasted));
        } else if char_count > 1
            && self.image_paste_enabled()
            && self.handle_paste_image_path(pasted.clone())
        {
            self.textarea.insert_str(" ");
        } else {
            self.insert_str(&pasted);
        }
        self.paste_burst.clear_after_explicit_paste();
        self.sync_popups();
        true
    }

    pub fn handle_paste_image_path(&mut self, pasted: String) -> bool {
        let Some(path_buf) = normalize_pasted_path(&pasted) else {
            return false;
        };

        // normalize_pasted_path already handles Windows → WSL path conversion,
        // so we can directly try to read the image dimensions.
        match image::image_dimensions(&path_buf) {
            Ok((width, height)) => {
                tracing::info!("OK: {pasted}");
                tracing::debug!("image dimensions={}x{}", width, height);
                let format = pasted_image_format(&path_buf);
                tracing::debug!("attached image format={}", format.label());
                self.attach_image(path_buf);
                true
            }
            Err(err) => {
                tracing::trace!("ERR: {err}");
                false
            }
        }
    }

    /// Enable or disable paste-burst handling.
    ///
    /// `disable_paste_burst` is an escape hatch for terminals/platforms where the burst heuristic
    /// is unwanted or has already been handled elsewhere.
    ///
    /// When transitioning from enabled → disabled, we "defuse" any in-flight burst state so it
    /// cannot affect subsequent normal typing:
    ///
    /// - First, flush any held/buffered text immediately via
    ///   [`PasteBurst::flush_before_modified_input`], and feed it through `handle_paste(String)`.
    ///   This preserves user input and routes it through the same integration path as explicit
    ///   pastes (large-paste placeholders, image-path detection, and popup sync).
    /// - Then clear the burst timing and Enter-suppression window via
    ///   [`PasteBurst::clear_after_explicit_paste`].
    ///
    /// We intentionally do not use `clear_window_after_non_char()` here: it clears timing state
    /// without emitting any buffered text, which can leave a non-empty buffer unable to flush
    /// later (because `flush_if_due()` relies on `last_plain_char_time` to time out).
    pub(crate) fn set_disable_paste_burst(&mut self, disabled: bool) {
        let was_disabled = self.disable_paste_burst;
        self.disable_paste_burst = disabled;
        if disabled && !was_disabled {
            if let Some(pasted) = self.paste_burst.flush_before_modified_input() {
                self.handle_paste(pasted);
            }
            self.paste_burst.clear_after_explicit_paste();
        }
    }

    pub(crate) fn current_text_with_pending(&self) -> String {
        let mut text = self.textarea.text().to_string();
        for (placeholder, actual) in &self.pending_pastes {
            if text.contains(placeholder) {
                text = text.replace(placeholder, actual);
            }
        }
        text
    }

    pub(crate) fn pending_pastes(&self) -> Vec<(String, String)> {
        self.pending_pastes.clone()
    }

    pub(crate) fn set_pending_pastes(&mut self, pending_pastes: Vec<(String, String)>) {
        let text = self.textarea.text().to_string();
        self.pending_pastes = pending_pastes
            .into_iter()
            .filter(|(placeholder, _)| text.contains(placeholder))
            .collect();
    }

    pub(crate) fn flush_paste_burst_if_due(&mut self) -> bool {
        self.handle_paste_burst_flush(Instant::now())
    }

    /// Returns whether the composer is currently in any paste-burst related transient state.
    ///
    /// This includes actively buffering, having a non-empty burst buffer, or holding the first
    /// ASCII char for flicker suppression.
    pub(crate) fn is_in_paste_burst(&self) -> bool {
        self.paste_burst.is_active()
    }

    /// Returns a delay that reliably exceeds the paste-burst timing threshold.
    ///
    /// Use this in tests to avoid boundary flakiness around the `PasteBurst` timeout.
    pub(crate) fn recommended_paste_flush_delay() -> Duration {
        PasteBurst::recommended_flush_delay()
    }

    pub(crate) fn next_large_paste_placeholder(&mut self, char_count: usize) -> String {
        let base = format!("[Pasted Content {char_count} chars]");
        let next_suffix = self.large_paste_counters.entry(char_count).or_insert(0);
        *next_suffix += 1;
        if *next_suffix == 1 {
            base
        } else {
            format!("{base} #{next_suffix}")
        }
    }

    pub(crate) fn handle_paste_burst_flush(&mut self, now: Instant) -> bool {
        match self.paste_burst.flush_if_due(now) {
            FlushResult::Paste(pasted) => {
                self.handle_paste(pasted);
                true
            }
            FlushResult::Typed(ch) => {
                self.textarea.insert_str(ch.to_string().as_str());
                self.sync_popups();
                true
            }
            FlushResult::None => false,
        }
    }
}
