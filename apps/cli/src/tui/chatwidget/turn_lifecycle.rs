//! Turn lifecycle management for `ChatWidget`.
//!
//! Covers the path from a completed or aborted agent turn back to idle:
//! - `finalize_turn`: clear streaming state and running indicators
//! - error / warning / model-reroute display helpers
//! - MCP server startup status tracking
//! - interrupt handling + composer restore after abort

use super::*;

impl ChatWidget {
    /// Finalize any active exec as failed and stop/clear agent-turn UI state.
    ///
    /// This does not clear MCP startup tracking, because MCP startup can overlap with turn cleanup
    /// and should continue to drive the bottom-pane running indicator while it is in progress.
    pub(super) fn finalize_turn(&mut self) {
        // Ensure any spinner is replaced by a red ✗ and flushed into history.
        self.finalize_active_cell_as_failed();
        // Reset running state and clear streaming buffers.
        self.agent_turn_running = false;
        self.turn_sleep_inhibitor
            .set_turn_running(/*turn_running*/ false);
        self.update_task_running_state();
        self.running_commands.clear();
        self.suppressed_exec_calls.clear();
        self.last_unified_wait = None;
        self.unified_exec_wait_streak = None;
        self.adaptive_chunking.reset();
        self.stream_controller = None;
        self.plan_stream_controller = None;
        self.pending_status_indicator_restore = false;
        self.request_status_line_branch_refresh();
        self.maybe_show_pending_rate_limit_prompt();
    }

    pub(super) fn on_server_overloaded_error(&mut self, message: String) {
        self.submit_pending_steers_after_interrupt = false;
        self.finalize_turn();

        let message = if message.trim().is_empty() {
            "The service is currently experiencing high load.".to_string()
        } else {
            message
        };

        self.add_to_history(history_cell::new_warning_event(message));
        self.request_redraw();
        self.maybe_send_next_queued_input();
    }

    pub(super) fn on_error(&mut self, message: String) {
        self.submit_pending_steers_after_interrupt = false;
        self.finalize_turn();
        self.add_to_history(history_cell::new_error_event(message));
        self.request_redraw();

        // After an error ends the turn, try sending the next queued input.
        self.maybe_send_next_queued_input();
    }

    pub(super) fn on_warning(&mut self, message: impl Into<String>) {
        self.add_to_history(history_cell::new_warning_event(message.into()));
        self.request_redraw();
    }

    pub(super) fn on_model_reroute(&mut self, event: ModelRerouteEvent) {
        let reason = match event.reason {
            ModelRerouteReason::HighRiskCyberActivity => "high-risk safety fallback",
        };
        self.add_to_history(history_cell::new_model_reroute_event(
            event.from_model,
            event.to_model,
            reason,
        ));
        self.request_redraw();
    }

    pub(super) fn on_mcp_startup_update(&mut self, ev: McpStartupUpdateEvent) {
        let mut status = self.mcp_startup_status.take().unwrap_or_default();
        if let McpStartupStatus::Failed { error } = &ev.status {
            self.on_warning(error);
        }
        status.insert(ev.server, ev.status);
        self.mcp_startup_status = Some(status);
        self.update_task_running_state();
        if let Some(current) = &self.mcp_startup_status {
            let total = current.len();
            let mut starting: Vec<_> = current
                .iter()
                .filter_map(|(name, state)| {
                    if matches!(state, McpStartupStatus::Starting) {
                        Some(name)
                    } else {
                        None
                    }
                })
                .collect();
            starting.sort();
            if let Some(first) = starting.first() {
                let completed = total.saturating_sub(starting.len());
                let max_to_show = 3;
                let mut to_show: Vec<String> = starting
                    .iter()
                    .take(max_to_show)
                    .map(ToString::to_string)
                    .collect();
                if starting.len() > max_to_show {
                    to_show.push("…".to_string());
                }
                let header = if total > 1 {
                    format!(
                        "Starting MCP servers ({completed}/{total}): {}",
                        to_show.join(", ")
                    )
                } else {
                    format!("Booting MCP server: {first}")
                };
                self.set_status_header(header);
            }
        }
        self.request_redraw();
    }

    pub(super) fn on_mcp_startup_complete(&mut self, ev: McpStartupCompleteEvent) {
        let agi_apps_ready = ev.ready.iter().any(|server| server == "agi_apps");
        let mut parts = Vec::new();
        if !ev.failed.is_empty() {
            let failed_servers: Vec<_> = ev.failed.iter().map(|f| f.server.clone()).collect();
            parts.push(format!("failed: {}", failed_servers.join(", ")));
        }
        if !ev.cancelled.is_empty() {
            self.on_warning(format!(
                "MCP startup interrupted. The following servers were not initialized: {}",
                ev.cancelled.join(", ")
            ));
        }
        if !parts.is_empty() {
            self.on_warning(format!("MCP startup incomplete ({})", parts.join("; ")));
        }

        self.mcp_startup_status = None;
        self.update_task_running_state();
        self.maybe_send_next_queued_input();
        if self.connectors_enabled() && agi_apps_ready {
            // Populate `$` app mentions from the session's already-started MCP manager
            // instead of doing a separate TUI-side connector prefetch.
            self.submit_op(Op::ListMcpTools);
        }
        self.request_redraw();
    }

    /// Handle a turn aborted due to user interrupt (Esc).
    /// When there are queued user messages, restore them into the composer
    /// separated by newlines rather than auto‑submitting the next one.
    pub(super) fn on_interrupted_turn(&mut self, reason: TurnAbortReason) {
        // Finalize, log a gentle prompt, and clear running state.
        self.finalize_turn();
        let send_pending_steers_immediately = self.submit_pending_steers_after_interrupt;
        self.submit_pending_steers_after_interrupt = false;
        if reason != TurnAbortReason::ReviewEnded {
            if send_pending_steers_immediately {
                self.add_to_history(history_cell::new_info_event(
                    "Model interrupted to submit steer instructions.".to_owned(),
                    /*hint*/ None,
                ));
            } else {
                self.add_to_history(history_cell::new_error_event(
                    "Conversation interrupted - tell the model what to do differently. Something went wrong? Hit `/feedback` to report the issue.".to_owned(),
                ));
            }
        }

        // Core clears pending_input before emitting TurnAborted, so any unacknowledged steers
        // still tracked here must be restored locally instead of waiting for a later commit.
        if send_pending_steers_immediately {
            let pending_steers: Vec<UserMessage> = self
                .pending_steers
                .drain(..)
                .map(|pending| pending.user_message)
                .collect();
            if !pending_steers.is_empty() {
                self.submit_user_message(merge_user_messages(pending_steers));
            } else if let Some(combined) = self.drain_pending_messages_for_restore() {
                self.restore_user_message_to_composer(combined);
            }
        } else if let Some(combined) = self.drain_pending_messages_for_restore() {
            self.restore_user_message_to_composer(combined);
        }
        self.refresh_pending_input_preview();

        self.request_redraw();
    }

    /// Merge pending steers, queued drafts, and the current composer state into a single message.
    ///
    /// Each pending message numbers attachments from `[Image #1]` relative to its own remote
    /// images. When we concatenate multiple messages after interrupt, we must renumber local-image
    /// placeholders in a stable order and rebase text element byte ranges so the restored composer
    /// state stays aligned with the merged attachment list. Returns `None` when there is nothing to
    /// restore.
    fn drain_pending_messages_for_restore(&mut self) -> Option<UserMessage> {
        if self.pending_steers.is_empty() && !self.has_queued_follow_up_messages() {
            return None;
        }

        let existing_message = UserMessage {
            text: self.bottom_pane.composer_text(),
            text_elements: self.bottom_pane.composer_text_elements(),
            local_images: self.bottom_pane.composer_local_images(),
            remote_image_urls: self.bottom_pane.remote_image_urls(),
            mention_bindings: self.bottom_pane.composer_mention_bindings(),
        };

        let mut to_merge: Vec<UserMessage> = self.rejected_steers_queue.drain(..).collect();
        to_merge.extend(
            self.pending_steers
                .drain(..)
                .map(|steer| steer.user_message),
        );
        to_merge.extend(self.queued_user_messages.drain(..));
        if !existing_message.text.is_empty()
            || !existing_message.local_images.is_empty()
            || !existing_message.remote_image_urls.is_empty()
        {
            to_merge.push(existing_message);
        }

        Some(merge_user_messages(to_merge))
    }

    fn restore_user_message_to_composer(&mut self, user_message: UserMessage) {
        let UserMessage {
            text,
            local_images,
            remote_image_urls,
            text_elements,
            mention_bindings,
        } = user_message;
        let local_image_paths = local_images.into_iter().map(|img| img.path).collect();
        self.set_remote_image_urls(remote_image_urls);
        self.bottom_pane.set_composer_text_with_mention_bindings(
            text,
            text_elements,
            local_image_paths,
            mention_bindings,
        );
    }

    pub(crate) fn capture_thread_input_state(&self) -> Option<ThreadInputState> {
        let composer = ThreadComposerState {
            text: self.bottom_pane.composer_text(),
            text_elements: self.bottom_pane.composer_text_elements(),
            local_images: self.bottom_pane.composer_local_images(),
            remote_image_urls: self.bottom_pane.remote_image_urls(),
            mention_bindings: self.bottom_pane.composer_mention_bindings(),
            pending_pastes: self.bottom_pane.composer_pending_pastes(),
        };
        Some(ThreadInputState {
            composer: composer.has_content().then_some(composer),
            pending_steers: self
                .pending_steers
                .iter()
                .map(|pending| pending.user_message.clone())
                .collect(),
            rejected_steers_queue: self.rejected_steers_queue.clone(),
            queued_user_messages: self.queued_user_messages.clone(),
            current_collaboration_mode: self.current_collaboration_mode.clone(),
            active_collaboration_mask: self.active_collaboration_mask.clone(),
            task_running: self.bottom_pane.is_task_running(),
            agent_turn_running: self.agent_turn_running,
        })
    }

    pub(crate) fn restore_thread_input_state(&mut self, input_state: Option<ThreadInputState>) {
        let restored_task_running = input_state.as_ref().is_some_and(|state| state.task_running);
        if let Some(input_state) = input_state {
            self.current_collaboration_mode = input_state.current_collaboration_mode;
            self.active_collaboration_mask = input_state.active_collaboration_mask;
            self.agent_turn_running = input_state.agent_turn_running;
            self.update_collaboration_mode_indicator();
            self.refresh_model_display();
            if let Some(composer) = input_state.composer {
                let local_image_paths = composer
                    .local_images
                    .into_iter()
                    .map(|img| img.path)
                    .collect();
                self.set_remote_image_urls(composer.remote_image_urls);
                self.bottom_pane.set_composer_text_with_mention_bindings(
                    composer.text,
                    composer.text_elements,
                    local_image_paths,
                    composer.mention_bindings,
                );
                self.bottom_pane
                    .set_composer_pending_pastes(composer.pending_pastes);
            } else {
                self.set_remote_image_urls(Vec::new());
                self.bottom_pane.set_composer_text_with_mention_bindings(
                    String::new(),
                    Vec::new(),
                    Vec::new(),
                    Vec::new(),
                );
                self.bottom_pane.set_composer_pending_pastes(Vec::new());
            }
            self.pending_steers = input_state
                .pending_steers
                .into_iter()
                .map(|user_message| PendingSteer {
                    compare_key: PendingSteerCompareKey {
                        message: user_message.text.clone(),
                        image_count: user_message.local_images.len()
                            + user_message.remote_image_urls.len(),
                    },
                    user_message,
                })
                .collect();
            self.rejected_steers_queue = input_state.rejected_steers_queue;
            self.queued_user_messages = input_state.queued_user_messages;
        } else {
            self.agent_turn_running = false;
            self.pending_steers.clear();
            self.rejected_steers_queue.clear();
            self.set_remote_image_urls(Vec::new());
            self.bottom_pane.set_composer_text_with_mention_bindings(
                String::new(),
                Vec::new(),
                Vec::new(),
                Vec::new(),
            );
            self.bottom_pane.set_composer_pending_pastes(Vec::new());
            self.queued_user_messages.clear();
        }
        self.turn_sleep_inhibitor
            .set_turn_running(self.agent_turn_running);
        self.update_task_running_state();
        if restored_task_running && !self.bottom_pane.is_task_running() {
            self.bottom_pane.set_task_running(/*running*/ true);
            self.refresh_terminal_title();
        }
        self.refresh_pending_input_preview();
        self.request_redraw();
    }
}
