//! The in-flight turn as the transcript shows it: the text of each model round
//! and the tool calls between rounds, in the order they happened.

use super::app_event::TuiAppEvent;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TurnEntry {
    Text(String),
    Tool,
}

#[derive(Debug, Default)]
pub(crate) struct TurnTranscript {
    entries: Vec<TurnEntry>,
    round_open: bool,
}

impl TurnTranscript {
    pub(crate) fn push_text(&mut self, delta: &str) {
        if delta.is_empty() {
            return;
        }
        match self.entries.last_mut() {
            Some(TurnEntry::Text(text)) if self.round_open => text.push_str(delta),
            _ => self.entries.push(TurnEntry::Text(delta.to_string())),
        }
        self.round_open = true;
    }

    pub(crate) fn observe(&mut self, event: &TuiAppEvent) {
        match event {
            TuiAppEvent::ToolStarted { .. } => {
                self.entries.push(TurnEntry::Tool);
                self.round_open = false;
            }
            TuiAppEvent::ToolQueued { .. } => self.round_open = false,
            _ => {}
        }
    }

    pub(crate) fn entries(&self) -> &[TurnEntry] {
        &self.entries
    }

    pub(crate) fn reply_text(&self) -> String {
        let mut reply = String::new();
        for entry in &self.entries {
            if let TurnEntry::Text(text) = entry {
                if !reply.is_empty() && !reply.ends_with(char::is_whitespace) {
                    reply.push_str("\n\n");
                }
                reply.push_str(text);
            }
        }
        reply
    }
}

pub(crate) fn has_visible_text(entries: &[TurnEntry]) -> bool {
    entries
        .iter()
        .any(|entry| matches!(entry, TurnEntry::Text(text) if !text.trim().is_empty()))
}

pub(crate) fn set_apart_unfinished_line(entries: &mut [TurnEntry]) {
    let Some(TurnEntry::Text(text)) = entries.last_mut() else {
        return;
    };
    if text.ends_with('\n') {
        return;
    }
    let Some(line_break) = text.rfind('\n') else {
        return;
    };
    if text[..line_break].ends_with('\n') || text[line_break + 1..].trim().is_empty() {
        return;
    }
    text.insert(line_break, '\n');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unfinished_last_line_of_a_stopped_turn_stands_apart() {
        let mut entries = vec![TurnEntry::Text(
            "33. Gray Wolf\n34. Arctic Wolf\n3".to_string(),
        )];
        set_apart_unfinished_line(&mut entries);
        assert_eq!(
            entries,
            vec![TurnEntry::Text(
                "33. Gray Wolf\n34. Arctic Wolf\n\n3".to_string()
            )]
        );

        for unchanged in [
            "a finished line\n",
            "one line in progress",
            "a paragraph\n\nalready apart",
            "trailing blank\n  ",
        ] {
            let mut entries = vec![TurnEntry::Text(unchanged.to_string())];
            set_apart_unfinished_line(&mut entries);
            assert_eq!(entries, vec![TurnEntry::Text(unchanged.to_string())]);
        }

        let mut ends_with_a_tool = vec![TurnEntry::Text("a\nb".to_string()), TurnEntry::Tool];
        set_apart_unfinished_line(&mut ends_with_a_tool);
        assert_eq!(ends_with_a_tool[0], TurnEntry::Text("a\nb".to_string()));
    }
    use crate::tui::app_event::ToolStatus;

    fn queued(call_id: &str) -> TuiAppEvent {
        TuiAppEvent::ToolQueued {
            call_id: call_id.into(),
            name: "write_file".into(),
            position: 0,
            queue_depth: 1,
        }
    }

    fn started(call_id: &str) -> TuiAppEvent {
        TuiAppEvent::ToolStarted {
            call_id: call_id.into(),
            name: "write_file".into(),
            summary: "hello.txt".into(),
            input: serde_json::json!({ "path": "hello.txt" }),
        }
    }

    fn completed(call_id: &str) -> TuiAppEvent {
        TuiAppEvent::ToolCompleted {
            call_id: call_id.into(),
            name: "write_file".into(),
            status: ToolStatus::Succeeded,
            output: "ok".into(),
            duration_ms: 3,
        }
    }

    fn texts(transcript: &TurnTranscript) -> Vec<&str> {
        transcript
            .entries()
            .iter()
            .filter_map(|entry| match entry {
                TurnEntry::Text(text) => Some(text.as_str()),
                TurnEntry::Tool => None,
            })
            .collect()
    }

    /// Regression: after a tool call every streamed token of the next model
    /// round was drawn as its own paragraph, and the tool card was drawn below
    /// the reply. The deltas of one round must grow one entry, and the tool
    /// card must sit between the rounds.
    #[test]
    fn text_after_a_tool_call_is_one_entry_after_the_tool() {
        let mut transcript = TurnTranscript::default();
        transcript.push_text("I'll create");
        transcript.push_text(" the file.");
        transcript.observe(&TuiAppEvent::ModelRequested);
        transcript.observe(&queued("ollama_0"));
        transcript.observe(&started("ollama_0"));
        transcript.observe(&completed("ollama_0"));
        for delta in [
            "The", " file", " `", "hello", ".txt", "`", " has", " been", " created", ".",
        ] {
            transcript.push_text(delta);
        }

        assert_eq!(
            transcript.entries(),
            &[
                TurnEntry::Text("I'll create the file.".into()),
                TurnEntry::Tool,
                TurnEntry::Text("The file `hello.txt` has been created.".into()),
            ]
        );
        assert_eq!(
            transcript.reply_text(),
            "I'll create the file.\n\nThe file `hello.txt` has been created."
        );
    }

    #[test]
    fn a_turn_that_opens_with_a_tool_call_puts_the_tool_first() {
        let mut transcript = TurnTranscript::default();
        transcript.observe(&queued("ollama_0"));
        transcript.observe(&started("ollama_0"));
        transcript.observe(&completed("ollama_0"));
        for delta in ["Done", ",", " it", " says", " hi", "."] {
            transcript.push_text(delta);
        }

        assert_eq!(
            transcript.entries(),
            &[TurnEntry::Tool, TurnEntry::Text("Done, it says hi.".into())]
        );
        assert_eq!(transcript.reply_text(), "Done, it says hi.");
    }

    #[test]
    fn a_turn_without_tools_streams_into_one_entry() {
        let mut transcript = TurnTranscript::default();
        for delta in ["Hello", "!", " How", " can", " I", " help", "?"] {
            transcript.push_text(delta);
        }

        assert_eq!(texts(&transcript), ["Hello! How can I help?"]);
        assert_eq!(transcript.entries().len(), 1);
    }

    #[test]
    fn parallel_tool_calls_keep_their_order_before_the_next_round() {
        let mut transcript = TurnTranscript::default();
        transcript.push_text("Reading both.");
        transcript.observe(&queued("a"));
        transcript.observe(&queued("b"));
        transcript.observe(&started("a"));
        transcript.observe(&started("b"));
        transcript.observe(&completed("a"));
        transcript.observe(&completed("b"));
        transcript.push_text("Both");
        transcript.push_text(" match.");

        assert_eq!(
            transcript.entries(),
            &[
                TurnEntry::Text("Reading both.".into()),
                TurnEntry::Tool,
                TurnEntry::Tool,
                TurnEntry::Text("Both match.".into()),
            ]
        );
    }

    #[test]
    fn each_later_round_opens_exactly_one_new_entry() {
        let mut transcript = TurnTranscript::default();
        transcript.push_text("First.");
        transcript.observe(&queued("ollama_0"));
        transcript.observe(&started("ollama_0"));
        transcript.observe(&completed("ollama_0"));
        transcript.push_text("Second");
        transcript.push_text(" round.");
        transcript.observe(&queued("ollama_0"));
        transcript.observe(&started("ollama_0"));
        transcript.observe(&completed("ollama_0"));
        transcript.push_text("Third");
        transcript.push_text(" round.");

        assert_eq!(
            texts(&transcript),
            ["First.", "Second round.", "Third round."]
        );
        assert_eq!(transcript.entries().len(), 5);
        assert_eq!(
            transcript.reply_text(),
            "First.\n\nSecond round.\n\nThird round."
        );
    }

    #[test]
    fn a_round_whose_tool_never_started_still_starts_a_new_entry() {
        let mut transcript = TurnTranscript::default();
        transcript.push_text("I'll read the file.");
        transcript.observe(&queued("denied"));
        transcript.push_text("First");
        transcript.push_text(" line:");

        assert_eq!(texts(&transcript), ["I'll read the file.", "First line:"]);
        assert_eq!(
            transcript.reply_text(),
            "I'll read the file.\n\nFirst line:"
        );
    }

    #[test]
    fn rounds_join_without_a_blank_line_when_already_separated() {
        let mut transcript = TurnTranscript::default();
        transcript.push_text("Reading the file.\n");
        transcript.observe(&started("a"));
        transcript.push_text("Done.");

        assert_eq!(transcript.reply_text(), "Reading the file.\nDone.");
    }

    #[test]
    fn empty_deltas_open_no_entry() {
        let mut transcript = TurnTranscript::default();
        transcript.observe(&started("a"));
        transcript.push_text("");

        assert_eq!(transcript.entries(), &[TurnEntry::Tool]);
        assert!(!has_visible_text(transcript.entries()));
    }
}
