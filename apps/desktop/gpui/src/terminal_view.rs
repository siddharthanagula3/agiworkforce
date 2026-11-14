use crate::{
    config::{NativeContracts, Palette},
    terminal::encode_key,
};
use agiworkforce_protocol::workspace_terminal::*;
use gpui::{
    div, point, prelude::*, px, rgb, size, Bounds, Context, ElementInputHandler,
    EntityInputHandler, EventEmitter, FocusHandle, Focusable, Pixels, Render, UTF16Selection,
    Window,
};
use std::{ops::Range, sync::Arc};

#[derive(Clone)]
pub enum TerminalInputKind {
    Key(String),
    Text(String),
    Paste,
    Copy,
    Resize(TerminalSize),
    Rejected(String),
}
#[derive(Clone)]
pub struct TerminalViewEvent {
    pub terminal_id: String,
    pub kind: TerminalInputKind,
}

pub struct TerminalView {
    pub revision: u64,
    pub terminal_id: String,
    pub screen: TerminalScreen,
    pub enabled: bool,
    pub running: bool,
    contracts: Arc<NativeContracts>,
    palette: Palette,
    dark: bool,
    focus: FocusHandle,
    marked: String,
    selected: Range<usize>,
    caret: Option<Bounds<Pixels>>,
    requested_size: Option<TerminalSize>,
}
impl EventEmitter<TerminalViewEvent> for TerminalView {}
impl Focusable for TerminalView {
    fn focus_handle(&self, _: &gpui::App) -> FocusHandle {
        self.focus.clone()
    }
}
impl TerminalView {
    pub fn new(
        id: String,
        screen: TerminalScreen,
        contracts: Arc<NativeContracts>,
        palette: Palette,
        dark: bool,
        cx: &mut Context<Self>,
    ) -> Self {
        Self {
            revision: 0,
            terminal_id: id,
            screen,
            contracts,
            palette,
            dark,
            enabled: true,
            running: true,
            focus: cx.focus_handle(),
            marked: String::new(),
            selected: 0..0,
            caret: None,
            requested_size: None,
        }
    }
    pub fn set_theme(&mut self, palette: Palette, dark: bool) -> bool {
        let changed = self.dark != dark
            || self.palette.code != palette.code
            || self.palette.foreground != palette.foreground;
        self.palette = palette;
        self.dark = dark;
        changed
    }
    pub fn focus(&self, window: &mut Window, cx: &mut Context<Self>) {
        self.focus.focus(window, cx);
    }
    pub fn desired_size(&self) -> TerminalSize {
        self.requested_size.unwrap_or(self.screen.size)
    }
    pub fn retry_size(&mut self) {
        self.requested_size = None;
    }
    fn emit(&self, kind: TerminalInputKind, cx: &mut Context<Self>) {
        cx.emit(TerminalViewEvent {
            terminal_id: self.terminal_id.clone(),
            kind,
        });
    }
    fn color(&self, color: TerminalColor, default: u32) -> u32 {
        match color {
            TerminalColor::Default => default,
            TerminalColor::Indexed { index } => {
                if self.dark {
                    self.contracts.terminal_colors.dark[usize::from(index)]
                } else {
                    self.contracts.terminal_colors.light[usize::from(index)]
                }
            }
            TerminalColor::Rgb { red, green, blue } => {
                (u32::from(red) << 16) | (u32::from(green) << 8) | u32::from(blue)
            }
        }
    }
    fn changed(&self, window: &mut Window, cx: &mut Context<Self>) {
        window.notify_text_input_changed(&self.focus);
        cx.notify();
    }
    fn commit(&mut self, text: &str, window: &mut Window, cx: &mut Context<Self>) {
        if self.enabled && !text.is_empty() {
            if text.len() <= MAX_TERMINAL_INPUT_BYTES {
                self.emit(TerminalInputKind::Text(text.into()), cx);
            } else {
                self.emit(
                    TerminalInputKind::Rejected(
                        "The committed text exceeds the terminal input limit".into(),
                    ),
                    cx,
                );
            }
        }
        self.marked.clear();
        self.selected = 0..0;
        self.changed(window, cx);
    }
}
fn utf16_offset(text: &str, offset: usize, ceil: bool) -> usize {
    let mut units = 0;
    for (index, ch) in text.char_indices() {
        let next = units + ch.len_utf16();
        if offset < next {
            return if ceil && offset > units {
                index + ch.len_utf8()
            } else {
                index
            };
        }
        units = next;
    }
    text.len()
}
impl EntityInputHandler for TerminalView {
    fn text_for_range(
        &mut self,
        range: Range<usize>,
        actual: &mut Option<Range<usize>>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<String> {
        let start = utf16_offset(&self.marked, range.start, false);
        let end = utf16_offset(&self.marked, range.end, true).max(start);
        *actual = Some(
            self.marked[..start].encode_utf16().count()..self.marked[..end].encode_utf16().count(),
        );
        Some(self.marked[start..end].into())
    }
    fn text_length_utf16(&mut self, _: &mut Window, _: &mut Context<Self>) -> Option<usize> {
        Some(self.marked.encode_utf16().count())
    }
    fn selected_text_range(
        &mut self,
        ignore_disabled: bool,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        (self.enabled || ignore_disabled).then(|| UTF16Selection {
            range: self.selected.clone(),
            reversed: false,
        })
    }
    fn set_selected_text_range(
        &mut self,
        range: Range<usize>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let length = self.marked.encode_utf16().count();
        self.selected = range.start.min(length)..range.end.min(length).max(range.start.min(length));
        window.notify_text_selection_changed(&self.focus);
        cx.notify();
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        (!self.marked.is_empty()).then(|| 0..self.marked.encode_utf16().count())
    }
    fn unmark_text(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let text = std::mem::take(&mut self.marked);
        self.commit(&text, window, cx);
    }
    fn replace_text_in_range(
        &mut self,
        _: Option<Range<usize>>,
        text: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.commit(text, window, cx);
    }
    fn replace_and_mark_text_in_range(
        &mut self,
        _: Option<Range<usize>>,
        text: &str,
        selected: Option<Range<usize>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.enabled {
            return;
        }
        if text.len() > MAX_TERMINAL_INPUT_BYTES {
            self.emit(
                TerminalInputKind::Rejected(
                    "The composition exceeds the terminal input limit".into(),
                ),
                cx,
            );
            return;
        }
        self.marked = text.into();
        let length = text.encode_utf16().count();
        self.selected = selected
            .map(|range| {
                range.start.min(length)..range.end.min(length).max(range.start.min(length))
            })
            .unwrap_or(length..length);
        self.changed(window, cx);
    }
    fn bounds_for_range(
        &mut self,
        _: Range<usize>,
        bounds: Bounds<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        self.caret.or(Some(bounds))
    }
    fn character_index_for_point(
        &mut self,
        _: gpui::Point<Pixels>,
        _: &mut Window,
        _: &mut Context<Self>,
    ) -> Option<usize> {
        Some(self.selected.end)
    }
}

impl Render for TerminalView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mono = gpui_component::Theme::global(cx).mono_font_family.clone();
        let font = gpui::font(mono.clone());
        let run = gpui::TextRun {
            len: 1,
            font,
            color: rgb(self.palette.foreground).into(),
            background_color: None,
            underline: None,
            strikethrough: None,
        };
        let cell_width = window
            .text_system()
            .shape_line("M".into(), px(self.contracts.body_font_size), &[run], None)
            .width;
        let line_height = px(self.contracts.body_line_height);
        let palette = self.palette;
        let mut grid = div()
            .w_full()
            .h_full()
            .relative()
            .overflow_hidden()
            .bg(rgb(palette.code))
            .text_color(rgb(palette.foreground))
            .font_family(mono)
            .text_size(px(self.contracts.body_font_size))
            .line_height(line_height)
            .flex()
            .flex_col();
        for (row_index, row) in self.screen.cells.iter().enumerate() {
            let mut line = div()
                .id(("terminal-row", row_index))
                .role(gpui::Role::Paragraph)
                .aria_label(crate::terminal::row_text(row))
                .h(line_height)
                .flex_shrink_0()
                .flex();
            for (column, cell) in row.iter().enumerate() {
                if cell.width == 0 {
                    continue;
                }
                let mut fg = self.color(cell.style.foreground, palette.foreground);
                let mut bg = self.color(cell.style.background, palette.code);
                if cell.style.dim {
                    fg = (((fg & 0xff00ff) + (bg & 0xff00ff)) >> 1 & 0xff00ff)
                        | (((fg & 0x00ff00) + (bg & 0x00ff00)) >> 1 & 0x00ff00);
                }
                let cursor = !self.screen.hide_cursor
                    && self.screen.scrollback == 0
                    && row_index == usize::from(self.screen.cursor_row)
                    && column <= usize::from(self.screen.cursor_column)
                    && usize::from(self.screen.cursor_column) < column + usize::from(cell.width);
                if cell.style.inverse ^ cursor {
                    std::mem::swap(&mut fg, &mut bg);
                }
                let glyph = div()
                    .flex_shrink_0()
                    .w(cell_width * f32::from(cell.width))
                    .h(line_height)
                    .bg(rgb(bg))
                    .text_color(rgb(fg))
                    .when(cell.style.bold, |style| {
                        style.font_weight(gpui::FontWeight::BOLD)
                    })
                    .when(cell.style.italic, gpui::Styled::italic)
                    .when(cell.style.underline, gpui::Styled::underline)
                    .child(gpui::Text::new_inaccessible(
                        (if cell.text.is_empty() {
                            " ".to_owned()
                        } else {
                            cell.text.clone()
                        })
                        .into(),
                    ));
                line = line.child(glyph);
            }
            grid = grid.child(line);
        }
        if !self.marked.is_empty() {
            grid = grid.child(
                div()
                    .absolute()
                    .left(cell_width * f32::from(self.screen.cursor_column))
                    .top(line_height * f32::from(self.screen.cursor_row))
                    .bg(rgb(palette.code))
                    .underline()
                    .child(gpui::text!(self.marked.clone())),
            );
        }
        let input = cx.entity();
        let focus = self.focus.clone();
        let cursor = (self.screen.cursor_row, self.screen.cursor_column);
        grid = grid.child(
            gpui::canvas(
                |bounds, _, _| bounds,
                move |bounds, _, window, app| {
                    input.update(app, |view, cx| {
                        view.caret = Some(Bounds::new(
                            point(
                                bounds.left() + cell_width * f32::from(cursor.1),
                                bounds.top() + line_height * f32::from(cursor.0),
                            ),
                            size(cell_width, line_height),
                        ));
                        if bounds.size.width < cell_width || bounds.size.height < line_height {
                            return;
                        }
                        let rows =
                            ((f32::from(bounds.size.height) / f32::from(line_height)).floor()
                                as u16)
                                .clamp(1, MAX_TERMINAL_ROWS);
                        let columns = ((f32::from(bounds.size.width) / f32::from(cell_width))
                            .floor() as u16)
                            .clamp(MIN_TERMINAL_COLUMNS, MAX_TERMINAL_COLUMNS);
                        let desired = TerminalSize { rows, columns };
                        if view.enabled
                            && view.running
                            && view.requested_size != Some(desired)
                            && view.screen.size != desired
                        {
                            view.requested_size = Some(desired);
                            view.emit(TerminalInputKind::Resize(desired), cx);
                        }
                    });
                    window.handle_input(
                        &focus,
                        ElementInputHandler::new(bounds, input.clone()),
                        app,
                    );
                },
            )
            .absolute()
            .size_full(),
        );
        grid.id(gpui::SharedString::from(format!(
            "terminal:{}",
            self.terminal_id
        )))
        .track_focus(&self.focus)
        .tab_index(0)
        .role(gpui::Role::Document)
        .aria_label("Interactive terminal")
        .key_context("WorkspaceTerminal")
        .on_mouse_down(
            gpui::MouseButton::Left,
            cx.listener(|view, _, window, cx| view.focus.focus(window, cx)),
        )
        .on_key_down(cx.listener(|view, event: &gpui::KeyDownEvent, window, cx| {
            if !view.enabled {
                return;
            }
            let key = &event.keystroke;
            let mods = key.modifiers;
            if key.key == "v" && (mods.platform || (mods.control && mods.shift)) {
                cx.stop_propagation();
                view.emit(TerminalInputKind::Paste, cx);
                return;
            }
            if key.key == "c" && (mods.platform || (mods.control && mods.shift)) {
                cx.stop_propagation();
                view.emit(TerminalInputKind::Copy, cx);
                return;
            }
            if mods.platform {
                return;
            }
            if !view.marked.is_empty() {
                if key.key == "escape" {
                    view.marked.clear();
                    view.selected = 0..0;
                    view.changed(window, cx);
                    cx.stop_propagation();
                }
                return;
            }
            if let Some(text) = encode_key(
                &key.key,
                mods.control,
                mods.shift,
                mods.alt,
                view.screen.application_cursor,
            ) {
                cx.stop_propagation();
                view.emit(TerminalInputKind::Key(text), cx);
            }
        }))
    }
}
