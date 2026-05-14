//! TUI overlay for MCP elicitation requests.
//!
//! When an MCP server calls `elicitation/create` it sends an
//! [`ElicitationRequest`] containing a human-readable message and a JSON
//! Schema describing the structured input it needs. This overlay renders that
//! schema as a navigable form inside the TUI and returns an
//! [`ElicitationResponse`] once the user confirms, declines, or cancels.
//!
//! Layout (80-col reference):
//!
//! ```text
//! ┌─ MCP Request: github ────────────────────────────────────────────────────────┐
//! │                                                                               │
//! │  Please provide your GitHub token                                             │
//! │                                                                               │
//! │  > token  [___________________________]                                       │
//! │    scope  [read / write / admin      ]  ← / → to cycle                       │
//! │                                                                               │
//! │  [Accept]  [Decline]  [Cancel]                                                │
//! │  Tab/↑↓ field   Enter confirm   Esc = Cancel                                  │
//! └───────────────────────────────────────────────────────────────────────────────┘
//! ```
//!
//! The overlay is a pure state machine exercised under unit tests;
//! `#[allow(dead_code)]` covers the public ratatui render path until the
//! event-loop slot lands in `TuiApp`.

#![allow(dead_code)]

use crate::mcp::elicitation::{ElicitationRequest, ElicitationResponse};
use crate::tui::widgets::interactive::{InteractiveView, KeyAction, ViewAction};

// ---------------------------------------------------------------------------
// Schema field types extracted from requestedSchema
// ---------------------------------------------------------------------------

/// A single renderable field extracted from the JSON Schema.
#[derive(Debug, Clone)]
pub enum FieldKind {
    /// Free-text string input.
    Text { value: String },
    /// Enumerated single-select (string enum).
    Enum { options: Vec<String>, selected: usize },
    /// Boolean toggle (true / false).
    Bool { value: bool },
}

/// One form field with its name and interactive state.
#[derive(Debug, Clone)]
pub struct FormField {
    pub name: String,
    pub required: bool,
    pub kind: FieldKind,
}

impl FormField {
    /// Serialize current value to JSON for the response payload.
    fn to_json(&self) -> serde_json::Value {
        match &self.kind {
            FieldKind::Text { value } => serde_json::Value::String(value.clone()),
            FieldKind::Enum { options, selected } => {
                serde_json::Value::String(options[*selected].clone())
            }
            FieldKind::Bool { value } => serde_json::Value::Bool(*value),
        }
    }

    /// One-line text representation for the text renderer.
    fn render_value(&self) -> String {
        match &self.kind {
            FieldKind::Text { value } => {
                if value.is_empty() {
                    "___________________________".to_string()
                } else {
                    value.clone()
                }
            }
            FieldKind::Enum { options, selected } => options[*selected].clone(),
            FieldKind::Bool { value } => if *value { "true" } else { "false" }.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Parse requestedSchema into FormFields
// ---------------------------------------------------------------------------

fn parse_schema(schema: &serde_json::Value) -> Vec<FormField> {
    let mut fields = Vec::new();

    let properties = match schema.get("properties").and_then(|p| p.as_object()) {
        Some(p) => p,
        None => return fields,
    };

    let required_set: std::collections::HashSet<&str> = schema
        .get("required")
        .and_then(|r| r.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();

    for (name, prop) in properties {
        let required = required_set.contains(name.as_str());

        let kind = if let Some(enum_vals) = prop.get("enum").and_then(|e| e.as_array()) {
            let options: Vec<String> = enum_vals
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
            if options.is_empty() {
                FieldKind::Text { value: String::new() }
            } else {
                FieldKind::Enum { options, selected: 0 }
            }
        } else {
            match prop.get("type").and_then(|t| t.as_str()) {
                Some("boolean") => FieldKind::Bool { value: false },
                _ => FieldKind::Text { value: String::new() },
            }
        };

        fields.push(FormField { name: name.clone(), required, kind });
    }

    fields
}

// ---------------------------------------------------------------------------
// Focus target: form fields + action buttons
// ---------------------------------------------------------------------------

/// What the Tab/↑↓ cursor is focused on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Focus {
    Field(usize),
    Button(usize),
}

const BUTTONS: [&str; 3] = [" Accept ", " Decline ", " Cancel "];
const BUTTON_ACCEPT: usize = 0;
const BUTTON_DECLINE: usize = 1;
const BUTTON_CANCEL: usize = 2;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// All mutable state owned by the host `TuiApp`.
pub struct ElicitationOverlayState {
    /// True while intercepting key events.
    pub visible: bool,
    /// Server name shown in the title bar (e.g. "github").
    pub server_name: String,
    /// Human-readable message from the server.
    pub message: String,
    /// Parsed form fields derived from `requestedSchema`.
    pub fields: Vec<FormField>,
    /// Current keyboard focus.
    focus: Focus,
    /// Set once the user confirms; `None` while the overlay is active.
    pub result: Option<ElicitationResponse>,
}

impl ElicitationOverlayState {
    /// Open a fresh overlay from an elicitation request.
    pub fn open(
        &mut self,
        server_name: impl Into<String>,
        request: ElicitationRequest,
    ) {
        self.server_name = server_name.into();
        self.message = request.message;
        self.fields = parse_schema(&request.requested_schema);
        self.focus = if self.fields.is_empty() {
            Focus::Button(BUTTON_ACCEPT)
        } else {
            Focus::Field(0)
        };
        self.result = None;
        self.visible = true;
    }

    /// Close the overlay without recording a result.
    pub fn close(&mut self) {
        self.visible = false;
    }

    /// True once the user has confirmed any action.
    pub fn is_resolved(&self) -> bool {
        self.result.is_some()
    }

    fn field_count(&self) -> usize {
        self.fields.len()
    }

    fn button_count(&self) -> usize {
        BUTTONS.len()
    }

    /// Advance Tab focus: fields first, then buttons, then wrap to first field.
    fn tab_forward(&mut self) {
        self.focus = match self.focus {
            Focus::Field(i) => {
                if i + 1 < self.field_count() {
                    Focus::Field(i + 1)
                } else {
                    Focus::Button(BUTTON_ACCEPT)
                }
            }
            Focus::Button(i) => {
                if i + 1 < self.button_count() {
                    Focus::Button(i + 1)
                } else if self.field_count() > 0 {
                    Focus::Field(0)
                } else {
                    Focus::Button(0)
                }
            }
        };
    }

    fn tab_backward(&mut self) {
        self.focus = match self.focus {
            Focus::Field(0) => Focus::Button(self.button_count() - 1),
            Focus::Field(i) => Focus::Field(i - 1),
            Focus::Button(0) => {
                if self.field_count() > 0 {
                    Focus::Field(self.field_count() - 1)
                } else {
                    Focus::Button(self.button_count() - 1)
                }
            }
            Focus::Button(i) => Focus::Button(i - 1),
        };
    }

    /// Collect current field values into a JSON object.
    fn collect_content(&self) -> serde_json::Value {
        let mut map = serde_json::Map::new();
        for f in &self.fields {
            map.insert(f.name.clone(), f.to_json());
        }
        serde_json::Value::Object(map)
    }

    fn resolve_button(&mut self, button_idx: usize) -> ViewAction {
        let response = match button_idx {
            BUTTON_ACCEPT => ElicitationResponse::accept(self.collect_content()),
            BUTTON_DECLINE => ElicitationResponse::decline(),
            _ => ElicitationResponse::cancel(),
        };
        self.result = Some(response);
        self.visible = false;
        if button_idx == BUTTON_ACCEPT {
            ViewAction::Submit(0)
        } else {
            ViewAction::Close
        }
    }

    /// Text-only render used when a ratatui frame is unavailable (tests / REPL).
    pub fn render_text(&self) -> String {
        if !self.visible {
            return String::new();
        }

        let title = format!(" MCP Request: {} ", self.server_name);
        let width = 80usize;
        let inner = width - 2;

        let mut out = String::new();

        // Top border
        let top = format!("┌─{:─<inner$}┐", title, inner = inner.saturating_sub(2));
        out.push_str(&top);
        out.push('\n');

        // Message
        out.push_str(&format!("│  {:<inner$}│\n", "", inner = inner - 2));
        for line in self.message.lines() {
            out.push_str(&format!("│  {:<inner$}│\n", line, inner = inner - 2));
        }
        out.push_str(&format!("│  {:<inner$}│\n", "", inner = inner - 2));

        // Fields
        for (i, field) in self.fields.iter().enumerate() {
            let focused = self.focus == Focus::Field(i);
            let prefix = if focused { "> " } else { "  " };
            let suffix = match &field.kind {
                FieldKind::Enum { .. } => "  ← / → to cycle",
                FieldKind::Bool { .. } => "  Space to toggle",
                FieldKind::Text { .. } => "",
            };
            let val = field.render_value();
            let req_mark = if field.required { "*" } else { " " };
            let row = format!("{}{}{} [{}]{}", prefix, req_mark, field.name, val, suffix);
            out.push_str(&format!("│  {:<inner$}│\n", row, inner = inner - 2));
        }

        if !self.fields.is_empty() {
            out.push_str(&format!("│  {:<inner$}│\n", "", inner = inner - 2));
        }

        // Button strip
        let mut buttons = String::new();
        for (i, label) in BUTTONS.iter().enumerate() {
            let focused = self.focus == Focus::Button(i);
            if focused {
                buttons.push_str(&format!("[{}]  ", label.trim()));
            } else {
                buttons.push_str(&format!(" {}   ", label.trim()));
            }
        }
        out.push_str(&format!("│  {:<inner$}│\n", buttons, inner = inner - 2));

        // Hint
        out.push_str(&format!(
            "│  {:<inner$}│\n",
            "Tab/↑↓ field   ← → enum/bool   Enter confirm   Esc = Cancel",
            inner = inner - 2
        ));

        // Bottom border
        out.push_str(&format!("└{:─<inner$}┘\n", "", inner = inner));

        out
    }
}

impl Default for ElicitationOverlayState {
    fn default() -> Self {
        Self {
            visible: false,
            server_name: String::new(),
            message: String::new(),
            fields: Vec::new(),
            focus: Focus::Button(BUTTON_ACCEPT),
            result: None,
        }
    }
}

// ---------------------------------------------------------------------------
// InteractiveView implementation
// ---------------------------------------------------------------------------

impl InteractiveView for ElicitationOverlayState {
    fn render(&self) -> String {
        self.render_text()
    }

    fn handle_key(&mut self, key: KeyAction) -> ViewAction {
        match key {
            // Navigation
            KeyAction::Tab | KeyAction::Down => {
                self.tab_forward();
                ViewAction::Continue
            }
            KeyAction::ShiftTab | KeyAction::Up => {
                self.tab_backward();
                ViewAction::Continue
            }

            // Enum / bool field manipulation
            KeyAction::Left => {
                if let Focus::Field(i) = self.focus {
                    if i < self.fields.len() {
                        match &mut self.fields[i].kind {
                            FieldKind::Enum { selected, .. } => {
                                if *selected > 0 {
                                    *selected -= 1;
                                }
                            }
                            FieldKind::Bool { value } => {
                                *value = !*value;
                            }
                            _ => {}
                        }
                    }
                }
                ViewAction::Continue
            }
            KeyAction::Right => {
                if let Focus::Field(i) = self.focus {
                    if i < self.fields.len() {
                        match &mut self.fields[i].kind {
                            FieldKind::Enum { options, selected } if *selected + 1 < options.len() => {
                                *selected += 1;
                            }
                            FieldKind::Enum { .. } => {}
                            FieldKind::Bool { value } => {
                                *value = !*value;
                            }
                            _ => {}
                        }
                    }
                }
                ViewAction::Continue
            }

            // Text input for focused text field
            KeyAction::Char(c) => {
                if let Focus::Field(i) = self.focus {
                    if i < self.fields.len() {
                        if let FieldKind::Text { value } = &mut self.fields[i].kind {
                            value.push(c);
                        }
                    }
                }
                ViewAction::Continue
            }

            KeyAction::Backspace => {
                if let Focus::Field(i) = self.focus {
                    if i < self.fields.len() {
                        if let FieldKind::Text { value } = &mut self.fields[i].kind {
                            value.pop();
                        }
                    }
                }
                ViewAction::Continue
            }

            // Confirm
            KeyAction::Enter => {
                match self.focus {
                    Focus::Button(idx) => self.resolve_button(idx),
                    Focus::Field(_) => {
                        // Enter on a field advances focus to Accept button
                        self.focus = Focus::Button(BUTTON_ACCEPT);
                        ViewAction::Continue
                    }
                }
            }

            // Escape = cancel
            KeyAction::Esc => {
                self.result = Some(ElicitationResponse::cancel());
                self.visible = false;
                ViewAction::Close
            }

            _ => ViewAction::Continue,
        }
    }

    fn is_done(&self) -> bool {
        !self.visible && self.result.is_some()
    }

    fn title(&self) -> Option<&str> {
        Some("MCP Elicitation")
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::elicitation::{ElicitationAction, ElicitationRequest};
    use crate::tui::widgets::interactive::{KeyAction, ViewAction};

    fn text_request() -> ElicitationRequest {
        ElicitationRequest {
            message: "Please provide your API key".into(),
            requested_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "api_key": {"type": "string"},
                    "region": {
                        "type": "string",
                        "enum": ["us-east", "us-west", "eu-central"]
                    }
                },
                "required": ["api_key"]
            }),
        }
    }

    fn bool_request() -> ElicitationRequest {
        ElicitationRequest {
            message: "Configure settings".into(),
            requested_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "enabled": {"type": "boolean"},
                    "verbose": {"type": "boolean"}
                }
            }),
        }
    }

    fn open_text_overlay() -> ElicitationOverlayState {
        let mut s = ElicitationOverlayState::default();
        s.open("github", text_request());
        s
    }

    #[test]
    fn default_state_is_invisible_and_unresolved() {
        let s = ElicitationOverlayState::default();
        assert!(!s.visible);
        assert!(s.result.is_none());
        assert!(!s.is_done());
        assert!(!s.is_resolved());
    }

    #[test]
    fn open_sets_visible_and_parses_fields() {
        let s = open_text_overlay();
        assert!(s.visible);
        assert_eq!(s.server_name, "github");
        assert_eq!(s.message, "Please provide your API key");
        assert_eq!(s.fields.len(), 2);
        assert!(s.result.is_none());
        assert!(!s.is_done());
    }

    #[test]
    fn required_field_marked_correctly() {
        let s = open_text_overlay();
        let api_key = s.fields.iter().find(|f| f.name == "api_key").unwrap();
        let region = s.fields.iter().find(|f| f.name == "region").unwrap();
        assert!(api_key.required);
        assert!(!region.required);
    }

    #[test]
    fn enum_field_parsed_with_options() {
        let s = open_text_overlay();
        let region = s.fields.iter().find(|f| f.name == "region").unwrap();
        match &region.kind {
            FieldKind::Enum { options, selected } => {
                assert_eq!(options.len(), 3);
                assert_eq!(*selected, 0);
                assert_eq!(options[0], "us-east");
            }
            _ => panic!("expected Enum field"),
        }
    }

    #[test]
    fn bool_fields_parsed() {
        let mut s = ElicitationOverlayState::default();
        s.open("test", bool_request());
        assert_eq!(s.fields.len(), 2);
        for f in &s.fields {
            assert!(matches!(f.kind, FieldKind::Bool { .. }));
        }
    }

    #[test]
    fn tab_advances_through_fields_then_buttons() {
        let mut s = open_text_overlay();
        // Initial focus on first field
        assert_eq!(s.focus, Focus::Field(0));
        s.handle_key(KeyAction::Tab);
        assert_eq!(s.focus, Focus::Field(1));
        s.handle_key(KeyAction::Tab);
        assert_eq!(s.focus, Focus::Button(BUTTON_ACCEPT));
        s.handle_key(KeyAction::Tab);
        assert_eq!(s.focus, Focus::Button(BUTTON_DECLINE));
    }

    #[test]
    fn shift_tab_goes_backward() {
        let mut s = open_text_overlay();
        // Move focus to Decline button
        s.focus = Focus::Button(BUTTON_DECLINE);
        s.handle_key(KeyAction::ShiftTab);
        assert_eq!(s.focus, Focus::Button(BUTTON_ACCEPT));
        s.handle_key(KeyAction::ShiftTab);
        assert_eq!(s.focus, Focus::Field(1));
    }

    #[test]
    fn char_input_appends_to_text_field() {
        let mut s = open_text_overlay();
        s.focus = Focus::Field(0); // api_key (text)
        s.handle_key(KeyAction::Char('a'));
        s.handle_key(KeyAction::Char('b'));
        s.handle_key(KeyAction::Char('c'));
        if let FieldKind::Text { value } = &s.fields[0].kind {
            assert_eq!(value, "abc");
        } else {
            panic!("expected Text field at index 0");
        }
    }

    #[test]
    fn backspace_removes_last_char() {
        let mut s = open_text_overlay();
        s.focus = Focus::Field(0);
        s.handle_key(KeyAction::Char('x'));
        s.handle_key(KeyAction::Char('y'));
        s.handle_key(KeyAction::Backspace);
        if let FieldKind::Text { value } = &s.fields[0].kind {
            assert_eq!(value, "x");
        } else {
            panic!("expected Text field");
        }
    }

    #[test]
    fn right_arrow_cycles_enum_option() {
        let mut s = open_text_overlay();
        // Find enum field index
        let enum_idx = s.fields.iter().position(|f| matches!(f.kind, FieldKind::Enum { .. })).unwrap();
        s.focus = Focus::Field(enum_idx);
        s.handle_key(KeyAction::Right);
        if let FieldKind::Enum { selected, .. } = &s.fields[enum_idx].kind {
            assert_eq!(*selected, 1);
        }
    }

    #[test]
    fn left_arrow_on_enum_stops_at_zero() {
        let mut s = open_text_overlay();
        let enum_idx = s.fields.iter().position(|f| matches!(f.kind, FieldKind::Enum { .. })).unwrap();
        s.focus = Focus::Field(enum_idx);
        s.handle_key(KeyAction::Left); // already at 0 — should not underflow
        if let FieldKind::Enum { selected, .. } = &s.fields[enum_idx].kind {
            assert_eq!(*selected, 0);
        }
    }

    #[test]
    fn enter_on_accept_button_resolves_accept() {
        let mut s = open_text_overlay();
        s.focus = Focus::Button(BUTTON_ACCEPT);
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Submit(0));
        assert!(s.result.is_some());
        assert_eq!(s.result.as_ref().unwrap().action, ElicitationAction::Accept);
        assert!(!s.visible);
        assert!(s.is_done());
    }

    #[test]
    fn enter_on_decline_button_resolves_decline() {
        let mut s = open_text_overlay();
        s.focus = Focus::Button(BUTTON_DECLINE);
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Close);
        assert_eq!(s.result.as_ref().unwrap().action, ElicitationAction::Decline);
    }

    #[test]
    fn esc_resolves_cancel() {
        let mut s = open_text_overlay();
        let action = s.handle_key(KeyAction::Esc);
        assert_eq!(action, ViewAction::Close);
        assert_eq!(s.result.as_ref().unwrap().action, ElicitationAction::Cancel);
        assert!(!s.visible);
        assert!(s.is_done());
    }

    #[test]
    fn accept_collects_field_values_into_content() {
        let mut s = open_text_overlay();
        // Type into api_key (field 0 if api_key comes first, else find it)
        let text_idx = s.fields.iter().position(|f| f.name == "api_key").unwrap();
        s.focus = Focus::Field(text_idx);
        for c in "my-secret-token".chars() {
            s.handle_key(KeyAction::Char(c));
        }
        s.focus = Focus::Button(BUTTON_ACCEPT);
        s.handle_key(KeyAction::Enter);

        let content = s.result.as_ref().unwrap().content.as_ref().unwrap();
        assert_eq!(content["api_key"], "my-secret-token");
    }

    #[test]
    fn render_text_shows_message_and_buttons() {
        let s = open_text_overlay();
        let text = s.render_text();
        assert!(text.contains("MCP Request: github"));
        assert!(text.contains("Please provide your API key"));
        assert!(text.contains("Accept"));
        assert!(text.contains("Decline"));
        assert!(text.contains("Cancel"));
    }

    #[test]
    fn render_text_empty_when_not_visible() {
        let s = ElicitationOverlayState::default();
        assert!(s.render_text().is_empty());
    }

    #[test]
    fn interactive_view_render_delegates_to_render_text() {
        let s = open_text_overlay();
        assert_eq!(s.render(), s.render_text());
    }

    #[test]
    fn title_is_mcp_elicitation() {
        let s = open_text_overlay();
        assert_eq!(s.title(), Some("MCP Elicitation"));
    }

    #[test]
    fn enter_on_field_advances_to_accept_button() {
        let mut s = open_text_overlay();
        assert_eq!(s.focus, Focus::Field(0));
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Continue);
        assert_eq!(s.focus, Focus::Button(BUTTON_ACCEPT));
    }

    #[test]
    fn close_hides_overlay_without_setting_result() {
        let mut s = open_text_overlay();
        s.close();
        assert!(!s.visible);
        assert!(s.result.is_none());
        assert!(!s.is_done());
    }

    #[test]
    fn no_fields_schema_focuses_buttons_first() {
        let mut s = ElicitationOverlayState::default();
        s.open("srv", ElicitationRequest {
            message: "Confirm?".into(),
            requested_schema: serde_json::json!({"type": "object", "properties": {}}),
        });
        assert_eq!(s.focus, Focus::Button(BUTTON_ACCEPT));
    }
}
