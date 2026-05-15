//! Streaming delta handling, commit-tick dispatch, and interrupt-queue management for `ChatWidget`.
//!
//! This module owns the methods that drive the streaming pipeline:
//! - receiving and routing `AgentMessage` deltas into the `StreamController`
//! - periodic commit ticks (smooth and catch-up modes)
//! - the interrupt FIFO queue that serializes events arriving mid-stream

use super::*;

impl ChatWidget {
    fn on_stream_error(&mut self, message: String, additional_details: Option<String>) {
        if self.retry_status_header.is_none() {
            self.retry_status_header = Some(self.current_status.header.clone());
        }
        self.bottom_pane.ensure_status_indicator();
        self.terminal_title_status_kind = TerminalTitleStatusKind::Thinking;
        self.set_status(
            message,
            additional_details,
            StatusDetailsCapitalization::CapitalizeFirst,
            STATUS_DETAILS_DEFAULT_MAX_LINES,
        );
    }

    pub(crate) fn pre_draw_tick(&mut self) {
        self.bottom_pane.pre_draw_tick();
        if self.should_animate_terminal_title_spinner() {
            self.refresh_terminal_title();
        }
    }

    /// Handle completion of an `AgentMessage` turn item.
    ///
    /// Commentary completion sets a deferred restore flag so the status row
    /// returns once stream queues are idle. Final-answer completion (or absent
    /// phase for legacy models) clears the flag to preserve historical behavior.
    fn on_agent_message_item_completed(&mut self, item: AgentMessageItem) {
        let mut message = String::new();
        for content in &item.content {
            match content {
                AgentMessageContent::Text { text } => message.push_str(text),
            }
        }
        self.finalize_completed_assistant_message(
            (!message.is_empty()).then_some(message.as_str()),
        );
        self.pending_status_indicator_restore = match item.phase {
            // Models that don't support preambles only output AgentMessageItems on turn completion.
            Some(MessagePhase::FinalAnswer) | None => false,
            Some(MessagePhase::Commentary) => true,
        };
        self.maybe_restore_status_indicator_after_stream_idle();
    }

    /// Periodic tick for stream commits. In smooth mode this preserves one-line pacing, while
    /// catch-up mode drains larger batches to reduce queue lag.
    pub(crate) fn on_commit_tick(&mut self) {
        self.run_commit_tick();
    }

    /// Runs a regular periodic commit tick.
    fn run_commit_tick(&mut self) {
        self.run_commit_tick_with_scope(CommitTickScope::AnyMode);
    }

    /// Runs an opportunistic commit tick only if catch-up mode is active.
    fn run_catch_up_commit_tick(&mut self) {
        self.run_commit_tick_with_scope(CommitTickScope::CatchUpOnly);
    }

    /// Runs a commit tick for the current stream queue snapshot.
    ///
    /// `scope` controls whether this call may commit in smooth mode or only when catch-up
    /// is currently active. While lines are actively streaming we hide the status row to avoid
    /// duplicate "in progress" affordances. Restoration is gated separately so we only re-show
    /// the row after commentary completion once stream queues are idle.
    fn run_commit_tick_with_scope(&mut self, scope: CommitTickScope) {
        let now = Instant::now();
        let outcome = run_commit_tick(
            &mut self.adaptive_chunking,
            self.stream_controller.as_mut(),
            self.plan_stream_controller.as_mut(),
            scope,
            now,
        );
        for cell in outcome.cells {
            self.bottom_pane.hide_status_indicator();
            self.add_boxed_history(cell);
        }

        if outcome.has_controller && outcome.all_idle {
            self.maybe_restore_status_indicator_after_stream_idle();
            self.app_event_tx.send(AppEvent::StopCommitAnimation);
        }

        if self.agent_turn_running {
            self.refresh_runtime_metrics();
        }
    }

    fn flush_interrupt_queue(&mut self) {
        let mut mgr = std::mem::take(&mut self.interrupts);
        mgr.flush_all(self);
        self.interrupts = mgr;
    }

    #[inline]
    fn defer_or_handle(
        &mut self,
        push: impl FnOnce(&mut InterruptManager),
        handle: impl FnOnce(&mut Self),
    ) {
        // Preserve deterministic FIFO across queued interrupts: once anything
        // is queued due to an active write cycle, continue queueing until the
        // queue is flushed to avoid reordering (e.g., ExecEnd before ExecBegin).
        if self.stream_controller.is_some() || !self.interrupts.is_empty() {
            push(&mut self.interrupts);
        } else {
            handle(self);
        }
    }

    fn handle_stream_finished(&mut self) {
        if self.task_complete_pending {
            self.bottom_pane.hide_status_indicator();
            self.task_complete_pending = false;
        }
        // A completed stream indicates non-exec content was just inserted.
        self.flush_interrupt_queue();
    }

    #[inline]
    fn handle_streaming_delta(&mut self, delta: String) {
        // Before streaming agent content, flush any active exec cell group.
        self.flush_unified_exec_wait_streak();
        self.flush_active_cell();

        if self.stream_controller.is_none() {
            // If the previous turn inserted non-stream history (exec output, patch status, MCP
            // calls), render a separator before starting the next streamed assistant message.
            if self.needs_final_message_separator && self.had_work_activity {
                let elapsed_seconds = self
                    .bottom_pane
                    .status_widget()
                    .map(super::super::status_indicator_widget::StatusIndicatorWidget::elapsed_seconds)
                    .map(|current| self.worked_elapsed_from(current));
                self.add_to_history(history_cell::FinalMessageSeparator::new(
                    elapsed_seconds,
                    /*runtime_metrics*/ None,
                ));
                self.needs_final_message_separator = false;
                self.had_work_activity = false;
            } else if self.needs_final_message_separator {
                // Reset the flag even if we don't show separator (no work was done)
                self.needs_final_message_separator = false;
            }
            self.stream_controller = Some(StreamController::new(
                self.last_rendered_width.get().map(|w| w.saturating_sub(2)),
                &self.config.cwd,
            ));
        }
        if let Some(controller) = self.stream_controller.as_mut()
            && controller.push(&delta)
        {
            self.app_event_tx.send(AppEvent::StartCommitAnimation);
            self.run_catch_up_commit_tick();
        }
        self.request_redraw();
    }

    fn worked_elapsed_from(&mut self, current_elapsed: u64) -> u64 {
        let baseline = match self.last_separator_elapsed_secs {
            Some(last) if current_elapsed < last => 0,
            Some(last) => last,
            None => 0,
        };
        let elapsed = current_elapsed.saturating_sub(baseline);
        self.last_separator_elapsed_secs = Some(current_elapsed);
        elapsed
    }
}
