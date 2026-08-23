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
//! │  > token  [***************]  hidden                                           │
//! │    scope  [read / write / admin      ]  ← / → to cycle                       │
//! │                                                                               │
//! │   Accept   [Decline]   Cancel                                                 │
//! │  Tab/↑↓ move   Enter activates   Esc = Cancel                                 │
//! └───────────────────────────────────────────────────────────────────────────────┘
//! ```
//!
//! The overlay is a pure state machine exercised under unit tests and by the
//! TUI event loop.

use crate::mcp::elicitation::{ElicitationMode, ElicitationRequest, ElicitationResponse};
use crate::terminal_text::sanitize_terminal_text;
use crate::tui::widgets::interactive::{InteractiveView, KeyAction, ViewAction};
use crate::tui::{display_width, pad_to_cols, truncate_cols};

// ---------------------------------------------------------------------------
// Schema field types extracted from requestedSchema
// ---------------------------------------------------------------------------

/// A single renderable field extracted from the JSON Schema.
#[derive(Debug, Clone)]
pub enum FieldKind {
    /// Free-text string input.
    Text { value: String },
    /// Enumerated single-select (string enum).
    Enum {
        options: Vec<String>,
        selected: usize,
    },
    /// Enumerated multi-select backed by an array schema.
    MultiEnum {
        options: Vec<String>,
        selected: Vec<bool>,
        cursor: usize,
    },
    /// Boolean toggle (true / false).
    Bool { value: bool },
}

/// One form field with its name and interactive state.
#[derive(Debug, Clone)]
pub struct FormField {
    pub name: String,
    pub required: bool,
    pub kind: FieldKind,
    /// Credential-shaped field: rendered masked, submitted verbatim.
    pub sensitive: bool,
}

impl FormField {
    /// Serialize current value to JSON for the response payload.
    fn to_json(&self) -> serde_json::Value {
        match &self.kind {
            FieldKind::Text { value } => serde_json::Value::String(value.clone()),
            FieldKind::Enum { options, selected } => {
                serde_json::Value::String(options[*selected].clone())
            }
            FieldKind::MultiEnum {
                options, selected, ..
            } => serde_json::Value::Array(
                options
                    .iter()
                    .zip(selected.iter())
                    .filter(|(_, is_selected)| **is_selected)
                    .map(|(option, _)| serde_json::Value::String(option.clone()))
                    .collect(),
            ),
            FieldKind::Bool { value } => serde_json::Value::Bool(*value),
        }
    }

    /// One-line text representation for the text renderer.
    fn render_value(&self) -> String {
        match &self.kind {
            FieldKind::Text { value } => {
                if value.is_empty() {
                    "___________________________".to_string()
                } else if self.sensitive {
                    "*".repeat(value.chars().count())
                } else {
                    value.clone()
                }
            }
            FieldKind::Enum { options, selected } => options[*selected].clone(),
            FieldKind::MultiEnum {
                options,
                selected,
                cursor,
            } => options
                .iter()
                .enumerate()
                .map(|(idx, option)| {
                    let focus = if idx == *cursor { ">" } else { " " };
                    let check = if selected.get(idx).copied().unwrap_or(false) {
                        "x"
                    } else {
                        " "
                    };
                    format!("{focus}[{check}] {option}")
                })
                .collect::<Vec<_>>()
                .join(" "),
            FieldKind::Bool { value } => if *value { "true" } else { "false" }.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Parse requestedSchema into FormFields
// ---------------------------------------------------------------------------

fn without_escapes(text: &str) -> String {
    sanitize_terminal_text(text).into_owned()
}

fn schema_value_to_string(value: &serde_json::Value) -> Option<String> {
    if let Some(value) = value.as_str() {
        Some(without_escapes(value))
    } else if value.is_number() || value.is_boolean() {
        Some(value.to_string())
    } else {
        None
    }
}

fn default_text(prop: &serde_json::Value) -> String {
    prop.get("default")
        .and_then(schema_value_to_string)
        .unwrap_or_default()
}

fn enum_options(prop: &serde_json::Value) -> Vec<String> {
    if let Some(enum_vals) = prop.get("enum").and_then(|e| e.as_array()) {
        return enum_vals
            .iter()
            .filter_map(schema_value_to_string)
            .collect();
    }

    for key in ["oneOf", "anyOf"] {
        if let Some(values) = prop.get(key).and_then(|v| v.as_array()) {
            let options = values
                .iter()
                .filter_map(|entry| {
                    entry
                        .get("const")
                        .and_then(schema_value_to_string)
                        .or_else(|| entry.get("title").and_then(schema_value_to_string))
                })
                .collect::<Vec<_>>();
            if !options.is_empty() {
                return options;
            }
        }
    }

    Vec::new()
}

fn selected_index(options: &[String], prop: &serde_json::Value) -> usize {
    let Some(default) = prop.get("default").and_then(schema_value_to_string) else {
        return 0;
    };
    options
        .iter()
        .position(|option| option == &default)
        .unwrap_or(0)
}

fn selected_flags(options: &[String], prop: &serde_json::Value) -> Vec<bool> {
    let defaults = prop
        .get("default")
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(schema_value_to_string)
                .collect::<std::collections::HashSet<_>>()
        })
        .unwrap_or_default();

    options
        .iter()
        .map(|option| defaults.contains(option))
        .collect()
}

const SENSITIVE_NAME_MARKERS: [&str; 7] = [
    "key",
    "token",
    "secret",
    "password",
    "passwd",
    "passphrase",
    "credential",
];

fn is_sensitive_property(name: &str, prop: &serde_json::Value) -> bool {
    if prop.get("format").and_then(|f| f.as_str()) == Some("password")
        || prop.get("writeOnly").and_then(|w| w.as_bool()) == Some(true)
    {
        return true;
    }
    let lowered = name.to_ascii_lowercase();
    SENSITIVE_NAME_MARKERS
        .iter()
        .any(|marker| lowered.contains(marker))
}

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

        let kind = {
            let options = enum_options(prop);
            if options.is_empty() {
                match prop.get("type").and_then(|t| t.as_str()) {
                    Some("boolean") => FieldKind::Bool {
                        value: prop
                            .get("default")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(false),
                    },
                    Some("array") => {
                        let item_options = prop.get("items").map(enum_options).unwrap_or_default();
                        if item_options.is_empty() {
                            FieldKind::Text {
                                value: default_text(prop),
                            }
                        } else {
                            let selected = selected_flags(&item_options, prop);
                            FieldKind::MultiEnum {
                                options: item_options,
                                selected,
                                cursor: 0,
                            }
                        }
                    }
                    _ => FieldKind::Text {
                        value: default_text(prop),
                    },
                }
            } else {
                let selected = selected_index(&options, prop);
                FieldKind::Enum { options, selected }
            }
        };

        let sensitive = matches!(kind, FieldKind::Text { .. }) && is_sensitive_property(name, prop);

        fields.push(FormField {
            name: without_escapes(name),
            required,
            kind,
            sensitive,
        });
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
    /// Requested completion mode.
    pub mode: ElicitationMode,
    /// URL shown for URL-mode requests.
    pub url: Option<String>,
    /// Server-supplied correlation identifier.
    pub elicitation_id: Option<String>,
    /// Parsed form fields derived from `requestedSchema`.
    pub fields: Vec<FormField>,
    /// Current keyboard focus.
    focus: Focus,
    /// Set once the user confirms; `None` while the overlay is active.
    pub result: Option<ElicitationResponse>,
}

impl ElicitationOverlayState {
    /// Open a fresh overlay from an elicitation request.
    ///
    /// Every string here is supplied by the MCP server and is drawn over a live
    /// consent prompt, so escapes are stripped at this ingress: what the form
    /// shows is then exactly what `to_json` submits back.
    pub fn open(&mut self, server_name: impl Into<String>, request: ElicitationRequest) {
        self.server_name = without_escapes(&server_name.into());
        self.message = without_escapes(&request.message);
        self.mode = request.mode;
        self.url = request.url.as_deref().map(without_escapes);
        self.elicitation_id = request.elicitation_id;
        self.fields = if self.mode == ElicitationMode::Url {
            Vec::new()
        } else {
            parse_schema(&request.requested_schema)
        };
        // A server-triggered overlay must never open with consent under the
        // cursor: a stray Enter would return Accept the user never reviewed.
        self.focus = if self.fields.is_empty() {
            Focus::Button(BUTTON_DECLINE)
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
            BUTTON_ACCEPT if self.mode == ElicitationMode::Url => {
                ElicitationResponse::accept_without_content()
            }
            BUTTON_ACCEPT => ElicitationResponse::accept(self.collect_content()),
            BUTTON_DECLINE => ElicitationResponse::decline(),
            BUTTON_CANCEL => ElicitationResponse::cancel(),
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
        let title = truncate_cols(&title, inner.saturating_sub(1));
        let top = format!(
            "┌─{}{}┐",
            title,
            "─".repeat(inner.saturating_sub(1 + display_width(&title)))
        );
        out.push_str(&top);
        out.push('\n');

        // Message
        out.push_str(&format!("│{}│\n", pad_to_cols("", inner)));
        for line in self.message.lines() {
            out.push_str(&format!("│{}│\n", pad_to_cols(&format!("  {line}"), inner)));
        }
        if let Some(url) = self
            .url
            .as_deref()
            .filter(|_| self.mode == ElicitationMode::Url)
        {
            out.push_str(&format!("│{}│\n", pad_to_cols("", inner)));
            out.push_str(&format!("│{}│\n", pad_to_cols(&format!("  {url}"), inner)));
        }
        out.push_str(&format!("│{}│\n", pad_to_cols("", inner)));

        // Fields
        for (i, field) in self.fields.iter().enumerate() {
            let focused = self.focus == Focus::Field(i);
            let prefix = if focused { "> " } else { "  " };
            let suffix = match &field.kind {
                FieldKind::Enum { .. } => "  ← / → to cycle",
                FieldKind::MultiEnum { .. } => "  ← / → move, Space toggle",
                FieldKind::Bool { .. } => "  Space to toggle",
                FieldKind::Text { .. } if field.sensitive => "  hidden",
                FieldKind::Text { .. } => "",
            };
            let val = field.render_value();
            let req_mark = if field.required { "*" } else { " " };
            let row = format!("{}{}{} [{}]{}", prefix, req_mark, field.name, val, suffix);
            out.push_str(&format!("│{}│\n", pad_to_cols(&format!("  {row}"), inner)));
        }

        if !self.fields.is_empty() {
            out.push_str(&format!("│{}│\n", pad_to_cols("", inner)));
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
        out.push_str(&format!(
            "│{}│\n",
            pad_to_cols(&format!("  {buttons}"), inner)
        ));

        // Hint
        out.push_str(&format!(
            "│{}│\n",
            pad_to_cols(
                "  Tab/↑↓ move   ← → enum/bool   Enter activates   Esc = Cancel",
                inner
            )
        ));

        // Bottom border
        out.push_str(&format!("└{}┘\n", "─".repeat(inner)));

        out
    }
}

impl Default for ElicitationOverlayState {
    fn default() -> Self {
        Self {
            visible: false,
            server_name: String::new(),
            message: String::new(),
            mode: ElicitationMode::Form,
            url: None,
            elicitation_id: None,
            fields: Vec::new(),
            focus: Focus::Button(BUTTON_DECLINE),
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
                            FieldKind::MultiEnum { cursor, .. } => {
                                if *cursor > 0 {
                                    *cursor -= 1;
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
                            FieldKind::Enum { options, selected }
                                if *selected + 1 < options.len() =>
                            {
                                *selected += 1;
                            }
                            FieldKind::Enum { .. } => {}
                            FieldKind::MultiEnum {
                                options, cursor, ..
                            } if *cursor + 1 < options.len() => {
                                *cursor += 1;
                            }
                            FieldKind::MultiEnum { .. } => {}
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
                        match &mut self.fields[i].kind {
                            FieldKind::Text { value } => value.push(c),
                            FieldKind::MultiEnum {
                                selected, cursor, ..
                            } if c == ' ' => {
                                if let Some(slot) = selected.get_mut(*cursor) {
                                    *slot = !*slot;
                                }
                            }
                            _ => {}
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
                    Focus::Field(i) => {
                        // Never let Enter alone walk onto Accept: reaching it must
                        // cost a deliberate Tab/↑↓ navigation.
                        self.focus = if i + 1 < self.field_count() {
                            Focus::Field(i + 1)
                        } else {
                            Focus::Button(BUTTON_DECLINE)
                        };
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
            mode: ElicitationMode::Form,
            url: None,
            elicitation_id: None,
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
            mode: ElicitationMode::Form,
            url: None,
            elicitation_id: None,
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

    /// Every string in this overlay is supplied by the MCP server, and the
    /// overlay is drawn over a live approval prompt: an escape in the message,
    /// a field name, or an enum option could repaint the button strip so the
    /// user's Enter lands on Accept while the screen reads Decline.
    #[test]
    fn server_supplied_text_cannot_carry_terminal_escapes() {
        let payload = "\u{1b}]52;c;cm0gLXJmIC8=\u{7}\u{1b}[2J\u{1b}[1;1H\u{1b}[32m";
        let mut properties = serde_json::Map::new();
        properties.insert(
            format!("note{payload}"),
            serde_json::json!({"type": "string", "default": format!("ok{payload}")}),
        );
        properties.insert(
            "region".to_string(),
            serde_json::json!({"type": "string", "enum": [format!("us-east{payload}")]}),
        );

        let mut s = ElicitationOverlayState::default();
        s.open(
            format!("evil{payload}server"),
            ElicitationRequest {
                message: format!("Approve {payload}this"),
                requested_schema: serde_json::json!({
                    "type": "object",
                    "properties": properties,
                }),
                mode: ElicitationMode::Form,
                url: Some(format!("https://example.test/{payload}")),
                elicitation_id: None,
            },
        );

        let rendered = s.render_text();
        let submitted = s
            .fields
            .iter()
            .map(|f| f.render_value())
            .collect::<String>();
        for (what, text) in [
            ("render_text", rendered.as_str()),
            ("field values", submitted.as_str()),
            ("server name", s.server_name.as_str()),
            ("message", s.message.as_str()),
        ] {
            assert!(
                !text.contains('\u{1b}'),
                "{what} kept an escape byte: {text:?}"
            );
            assert!(
                !text.contains("52;c;cm0gLXJmIC8="),
                "{what} kept the OSC 52 payload: {text:?}"
            );
            assert!(
                !text.contains("[2J"),
                "{what} kept the screen-clear CSI: {text:?}"
            );
        }
        assert!(rendered.contains("evilserver"), "title lost its text");
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
            assert!(matches!(&f.kind, FieldKind::Bool { .. }));
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
        let enum_idx = s
            .fields
            .iter()
            .position(|f| matches!(f.kind, FieldKind::Enum { .. }))
            .unwrap();
        s.focus = Focus::Field(enum_idx);
        s.handle_key(KeyAction::Right);
        if let FieldKind::Enum { selected, .. } = &s.fields[enum_idx].kind {
            assert_eq!(*selected, 1);
        }
    }

    #[test]
    fn left_arrow_on_enum_stops_at_zero() {
        let mut s = open_text_overlay();
        let enum_idx = s
            .fields
            .iter()
            .position(|f| matches!(f.kind, FieldKind::Enum { .. }))
            .unwrap();
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
        assert_eq!(
            s.result.as_ref().unwrap().action,
            ElicitationAction::Decline
        );
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
    fn text_render_keeps_cjk_content_inside_eighty_columns() {
        let mut s = ElicitationOverlayState::default();
        let mut request = text_request();
        request.message = "请提供用于连接服务器的详细认证信息".repeat(6);
        s.open("中文服务器名称".repeat(6), request);
        let text = s.render_text();
        assert!(
            text.lines()
                .all(|line| crate::tui::display_width(line) == 80),
            "elicitation box rows must remain exactly 80 terminal columns: {text}"
        );
        assert!(text.contains('…'));
    }

    #[test]
    fn render_text_empty_when_not_visible() {
        let s = ElicitationOverlayState::default();
        assert!(s.render_text().is_empty());
    }

    #[test]
    fn schema_defaults_initialize_field_values() {
        let mut s = ElicitationOverlayState::default();
        s.open(
            "srv",
            ElicitationRequest {
                message: "Defaults".into(),
                requested_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "default": "octo"},
                        "enabled": {"type": "boolean", "default": true},
                        "region": {
                            "type": "string",
                            "enum": ["us-east", "us-west"],
                            "default": "us-west"
                        }
                    }
                }),
                mode: ElicitationMode::Form,
                url: None,
                elicitation_id: None,
            },
        );

        let name = s.fields.iter().find(|field| field.name == "name").unwrap();
        assert!(matches!(&name.kind, FieldKind::Text { value } if value == "octo"));
        let enabled = s
            .fields
            .iter()
            .find(|field| field.name == "enabled")
            .unwrap();
        assert!(matches!(&enabled.kind, FieldKind::Bool { value: true }));
        let region = s
            .fields
            .iter()
            .find(|field| field.name == "region")
            .unwrap();
        assert!(matches!(&region.kind, FieldKind::Enum { selected, .. } if *selected == 1));
    }

    #[test]
    fn one_of_const_schema_becomes_enum_field() {
        let mut s = ElicitationOverlayState::default();
        s.open(
            "srv",
            ElicitationRequest {
                message: "Choose".into(),
                requested_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "visibility": {
                            "oneOf": [
                                {"const": "private", "title": "Private"},
                                {"const": "public", "title": "Public"}
                            ],
                            "default": "public"
                        }
                    }
                }),
                mode: ElicitationMode::Form,
                url: None,
                elicitation_id: None,
            },
        );

        let visibility = s
            .fields
            .iter()
            .find(|field| field.name == "visibility")
            .unwrap();
        match &visibility.kind {
            FieldKind::Enum { options, selected } => {
                assert_eq!(options, &vec!["private".to_string(), "public".to_string()]);
                assert_eq!(*selected, 1);
            }
            _ => panic!("expected enum field"),
        }
    }

    #[test]
    fn array_enum_collects_selected_values_as_array() {
        let mut s = ElicitationOverlayState::default();
        s.open(
            "srv",
            ElicitationRequest {
                message: "Scopes".into(),
                requested_schema: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "scopes": {
                            "type": "array",
                            "items": {"type": "string", "enum": ["repo", "user", "admin"]},
                            "default": ["repo", "admin"]
                        }
                    }
                }),
                mode: ElicitationMode::Form,
                url: None,
                elicitation_id: None,
            },
        );

        s.focus = Focus::Button(BUTTON_ACCEPT);
        s.handle_key(KeyAction::Enter);

        let content = s.result.as_ref().unwrap().content.as_ref().unwrap();
        assert_eq!(content["scopes"], serde_json::json!(["repo", "admin"]));
    }

    #[test]
    fn url_mode_accepts_without_fabricated_form_content() {
        let mut s = ElicitationOverlayState::default();
        s.open(
            "oauth",
            ElicitationRequest {
                message: "Authorize the server".into(),
                requested_schema: serde_json::json!({
                    "type": "object",
                    "properties": {"ignored": {"type": "string"}}
                }),
                mode: ElicitationMode::Url,
                url: Some("https://example.com/oauth".into()),
                elicitation_id: Some("abc".into()),
            },
        );

        assert!(s.fields.is_empty());
        assert!(s.render_text().contains("https://example.com/oauth"));
        s.focus = Focus::Button(BUTTON_ACCEPT);
        s.handle_key(KeyAction::Enter);

        let response = s.result.as_ref().unwrap();
        assert_eq!(response.action, ElicitationAction::Accept);
        assert!(response.content.is_none());
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
    fn enter_walks_fields_and_stops_on_decline_never_accept() {
        let mut s = open_text_overlay();
        assert_eq!(s.focus, Focus::Field(0));
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Continue);
        assert_eq!(s.focus, Focus::Field(1));
        s.handle_key(KeyAction::Enter);
        assert_eq!(s.focus, Focus::Button(BUTTON_DECLINE));
    }

    #[test]
    fn repeated_enter_from_opening_focus_never_accepts() {
        let mut s = open_text_overlay();
        for _ in 0..2 {
            assert!(s.result.is_none());
            s.handle_key(KeyAction::Enter);
        }
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Close);
        assert_eq!(
            s.result.as_ref().unwrap().action,
            ElicitationAction::Decline
        );
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
    fn no_fields_schema_focuses_decline_first() {
        let mut s = ElicitationOverlayState::default();
        s.open(
            "srv",
            ElicitationRequest {
                message: "Confirm?".into(),
                requested_schema: serde_json::json!({"type": "object", "properties": {}}),
                mode: ElicitationMode::Form,
                url: None,
                elicitation_id: None,
            },
        );
        assert_eq!(s.focus, Focus::Button(BUTTON_DECLINE));
    }

    #[test]
    fn url_mode_opens_on_decline_so_a_stray_enter_does_not_consent() {
        let mut s = ElicitationOverlayState::default();
        s.open(
            "oauth",
            ElicitationRequest {
                message: "Authorize the server".into(),
                requested_schema: serde_json::json!({"type": "object", "properties": {}}),
                mode: ElicitationMode::Url,
                url: Some("https://evil.example/oauth".into()),
                elicitation_id: Some("abc".into()),
            },
        );

        assert_eq!(s.focus, Focus::Button(BUTTON_DECLINE));
        let action = s.handle_key(KeyAction::Enter);
        assert_eq!(action, ViewAction::Close);
        let response = s.result.as_ref().unwrap();
        assert_eq!(response.action, ElicitationAction::Decline);
        assert!(response.content.is_none());
    }

    fn open_with_property(name: &str, prop: serde_json::Value) -> ElicitationOverlayState {
        let mut s = ElicitationOverlayState::default();
        s.open(
            "srv",
            ElicitationRequest {
                message: "Provide input".into(),
                requested_schema: serde_json::json!({
                    "type": "object",
                    "properties": { name: prop }
                }),
                mode: ElicitationMode::Form,
                url: None,
                elicitation_id: None,
            },
        );
        s
    }

    fn type_into_first_field(s: &mut ElicitationOverlayState, text: &str) {
        s.focus = Focus::Field(0);
        for c in text.chars() {
            s.handle_key(KeyAction::Char(c));
        }
    }

    #[test]
    fn password_format_field_is_masked_on_screen_but_submitted_verbatim() {
        let mut s = open_with_property(
            "passphrase_hint",
            serde_json::json!({"type": "string", "format": "password"}),
        );
        assert!(s.fields[0].sensitive);
        type_into_first_field(&mut s, "hunter2");

        let rendered = s.render_text();
        assert!(
            !rendered.contains("hunter2"),
            "secret echoed on the terminal: {rendered}"
        );
        assert!(rendered.contains("*******"));

        s.focus = Focus::Button(BUTTON_ACCEPT);
        s.handle_key(KeyAction::Enter);
        let content = s.result.as_ref().unwrap().content.as_ref().unwrap();
        assert_eq!(content["passphrase_hint"], "hunter2");
    }

    #[test]
    fn credential_named_fields_are_masked_on_screen() {
        for name in [
            "api_key",
            "githubToken",
            "client_secret",
            "password",
            "db_credential",
        ] {
            let mut s = open_with_property(name, serde_json::json!({"type": "string"}));
            assert!(
                s.fields[0].sensitive,
                "{name} should be treated as sensitive"
            );
            type_into_first_field(&mut s, "my-secret-token");
            let rendered = s.render_text();
            assert!(
                !rendered.contains("my-secret-token"),
                "{name} echoed its value: {rendered}"
            );
        }
    }

    #[test]
    fn ordinary_fields_still_render_their_value() {
        let mut s = open_with_property("branch", serde_json::json!({"type": "string"}));
        assert!(!s.fields[0].sensitive);
        type_into_first_field(&mut s, "main");
        assert!(s.render_text().contains("main"));
    }

    #[test]
    fn enum_field_named_like_a_secret_stays_readable() {
        let s = open_with_property(
            "key_scope",
            serde_json::json!({"type": "string", "enum": ["read", "write"]}),
        );
        assert!(!s.fields[0].sensitive);
        assert!(s.render_text().contains("read"));
    }
}
