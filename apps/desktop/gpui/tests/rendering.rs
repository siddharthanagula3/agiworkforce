use std::sync::Arc;

use agiworkforce_desktop_gpui::config::{NativeContracts, Palette};
use agiworkforce_desktop_gpui::rich_text;
use agiworkforce_desktop_gpui::terminal_view::{
    TerminalInputKind, TerminalView, TerminalViewEvent,
};
use agiworkforce_protocol::workspace_terminal::*;
use anyhow::{Context as _, Result};
use gpui::{
    div, prelude::*, px, rgb, size, App, Context, EntityInputHandler, HeadlessAppContext, Window,
};
use gpui_component::input::{EditorState, Textarea, TextareaState};
use gpui_component::text::TextViewState;

#[path = "rendering/conversation_controls.rs"]
mod conversation_controls;
#[path = "rendering/drafts.rs"]
mod drafts;
#[path = "rendering/frame.rs"]
mod frame;
#[path = "rendering/model_picker.rs"]
mod model_picker;
#[path = "rendering/project_download.rs"]
mod project_download;
#[path = "rendering/project_files.rs"]
mod project_files;
#[path = "rendering/project_form.rs"]
mod project_form;
#[path = "rendering/project_upload.rs"]
mod project_upload;
#[path = "rendering/workspace_picker.rs"]
mod workspace_picker;

struct HistoryFixture {
    viewport: agiworkforce_desktop_gpui::viewport::HistoryViewport,
    rows: Vec<String>,
    document: Option<gpui::Entity<TextViewState>>,
    contracts: Arc<NativeContracts>,
    palette: Palette,
}
struct TerminalHarness {
    view: gpui::Entity<TerminalView>,
}
impl Render for TerminalHarness {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div().size_full().child(self.view.clone())
    }
}
fn terminal_screen() -> TerminalScreen {
    let mut cells = vec![
        vec![
            TerminalCell {
                text: String::new(),
                width: 1,
                style: TerminalStyle::default()
            };
            20
        ];
        4
    ];
    for (column, text) in ["r", "e", "d"].into_iter().enumerate() {
        cells[0][column].text = text.into();
        cells[0][column].style.foreground = TerminalColor::Indexed { index: 1 };
    }
    for (column, text) in [(4, "東"), (6, "京"), (8, "🦀")] {
        cells[0][column].text = text.into();
        cells[0][column].width = 2;
        cells[0][column + 1].width = 0;
    }
    TerminalScreen {
        size: TerminalSize {
            rows: 4,
            columns: 20,
        },
        cells,
        cursor_row: 1,
        cursor_column: 0,
        hide_cursor: false,
        application_cursor: true,
        application_keypad: false,
        bracketed_paste: true,
        alternate_screen: false,
        scrollback: 0,
        scrollback_len: 0,
    }
}

struct FileEditorFixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    state: gpui::Entity<EditorState>,
    readonly: bool,
}
impl Render for FileEditorFixture {
    fn render(&mut self, window: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .child(agiworkforce_desktop_gpui::editor::source_editor(
                &self.state,
                "File editor",
                self.readonly,
                window.bounds().size.height,
            ))
    }
}

impl Render for HistoryFixture {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.viewport.keep_latest();
        let mut panel = div()
            .id("history-viewport")
            .size_full()
            .overflow_y_scroll()
            .track_scroll(&self.viewport.scroll)
            .flex()
            .flex_col()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height));
        for (index, row) in self.rows.iter().enumerate() {
            panel = panel.child(
                div()
                    .id(("history-row", index))
                    .flex_shrink_0()
                    .h(px(self.contracts.body_line_height))
                    .child(gpui::text!(row.clone())),
            );
        }
        if let Some(document) = &self.document {
            panel = panel.child(div().flex_shrink_0().child(rich_text::managed_document(
                document,
                &self.contracts,
                window,
                cx,
            )));
        }
        panel
    }
}

struct MarkdownFixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    document: gpui::Entity<TextViewState>,
}

impl Render for MarkdownFixture {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height))
            .child(rich_text::managed_document(
                &self.document,
                &self.contracts,
                window,
                cx,
            ))
    }
}

struct RepaintFixture {
    count: usize,
    palette: Palette,
    contracts: Arc<NativeContracts>,
    composer: gpui::Entity<TextareaState>,
}

impl Render for RepaintFixture {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height))
            .child(gpui::text!("Static heading"))
            .child(gpui::text!(format!("Counter: {}", self.count)))
            .child(
                Textarea::new(&self.composer)
                    .readonly(true)
                    .h(px(80.))
                    .aria_label("Message"),
            )
    }
}

fn main() -> Result<()> {
    let contracts = Arc::new(NativeContracts::load()?);
    let platform = gpui_platform::current_platform(true);
    let mut cx = HeadlessAppContext::with_platform(
        platform.text_system(),
        Arc::new(gpui_kit_assets::Assets),
        gpui_platform::current_headless_renderer,
    );
    cx.update(gpui_component::init);
    cx.update(agiworkforce_desktop_gpui::ui::bind_application_shortcuts)?;
    for (name, palette) in [("light", contracts.light), ("dark", contracts.dark)] {
        cx.update(|app| rich_text::sync_theme(&contracts, palette, name == "dark", app));
        frame::run(&mut cx, &contracts, name, palette)?;
        model_picker::footer_menu(&mut cx, &contracts, name, palette)?;
        model_picker::run(&mut cx, &contracts, name, palette)?;
        workspace_picker::run(&mut cx, &contracts, name, palette)?;
        conversation_controls::run(&mut cx, &contracts, name, palette)?;
        drafts::run(&mut cx, &contracts, name, palette)?;
        project_form::run(&mut cx, &contracts, name, palette)?;
        project_files::run(&mut cx, &contracts, name, palette)?;
        project_upload::run(&mut cx, &contracts, name, palette)?;
        project_download::run(&mut cx, &contracts, name, palette)?;
        for width in [768., 320.] {
            let events = Arc::new(std::sync::Mutex::new(Vec::<TerminalViewEvent>::new()));
            let captured = events.clone();
            let mut fixture = None;
            let id = uuid::Uuid::new_v4().to_string();
            let window = cx
                .open_window(size(px(width), px(300.)), |window, app: &mut App| {
                    let view = app.new(|cx| {
                        let terminal = cx.new(|cx| {
                            TerminalView::new(
                                id.clone(),
                                terminal_screen(),
                                contracts.clone(),
                                palette,
                                name == "dark",
                                cx,
                            )
                        });
                        cx.subscribe(&terminal, move |_: &mut TerminalHarness, _, event, _| {
                            captured.lock().unwrap().push(event.clone())
                        })
                        .detach();
                        TerminalHarness { view: terminal }
                    });
                    fixture = Some(view.clone());
                    view.read(app)
                        .view
                        .clone()
                        .update(app, |view, cx| view.focus(window, cx));
                    app.new(|cx| gpui_component::Root::new(view, window, cx))
                })?
                .into();
            let fixture = fixture.context("The terminal renderer was not mounted")?;
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            let before = cx.capture_screenshot(window)?;
            before.save(format!("/tmp/agi-gpui-terminal-{name}-{width}.png"))?;
            cx.update_window(window, |_, window, app| {
                fixture.read(app).view.clone().update(app, |view, cx| {
                    view.replace_and_mark_text_in_range(None, "東京🦀", Some(0..4), window, cx);
                    let mut actual = None;
                    anyhow::ensure!(
                        view.text_for_range(2..3, &mut actual, window, cx)
                            .as_deref()
                            == Some("🦀")
                            && actual == Some(2..4),
                        "Terminal IME ranges split a surrogate pair"
                    );
                    Ok::<_, anyhow::Error>(())
                })
            })??;
            anyhow::ensure!(
                !events
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|event| matches!(event.kind, TerminalInputKind::Text(_))),
                "Uncommitted terminal composition was sent as input"
            );
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            let composing = cx.capture_screenshot(window)?;
            anyhow::ensure!(
                before.as_raw() != composing.as_raw(),
                "The terminal composition did not render"
            );
            cx.update_window(window, |_, window, app| {
                fixture.read(app).view.clone().update(app, |view, cx| {
                    view.replace_text_in_range(None, "東京🦀", window, cx)
                })
            })?;
            let inputs = events
                .lock()
                .unwrap()
                .iter()
                .filter_map(|event| match &event.kind {
                    TerminalInputKind::Text(text) => {
                        Some((event.terminal_id.clone(), text.clone()))
                    }
                    _ => None,
                })
                .collect::<Vec<_>>();
            anyhow::ensure!(
                inputs == vec![(id.clone(), "東京🦀".into())],
                "Terminal composition committed more than once or to another session"
            );
            let keystroke = gpui::Keystroke::parse("ctrl-c")?;
            cx.update_window(window, |_, window, app| {
                window.dispatch_event(
                    gpui::PlatformInput::KeyDown(gpui::KeyDownEvent {
                        keystroke,
                        is_held: false,
                        prefer_character_input: false,
                    }),
                    app,
                )
            })?;
            anyhow::ensure!(
                events.lock().unwrap().iter().any(
                    |event| matches!(&event.kind,TerminalInputKind::Key(text)if text=="\x03")
                        && event.terminal_id == id
                ),
                "The terminal Ctrl-C key did not reach its scoped input event"
            );
            cx.update_window(window, |_, window, app| {
                fixture.read(app).view.clone().update(app, |view, cx| {
                    view.enabled = false;
                    view.replace_text_in_range(None, "not delivered", window, cx);
                })
            })?;
            anyhow::ensure!(
                events
                    .lock()
                    .unwrap()
                    .iter()
                    .filter(|event| matches!(event.kind, TerminalInputKind::Text(_)))
                    .count()
                    == 1,
                "A disabled terminal still delivered input"
            );
            println!("{name} {width}px: terminal grid, wide Unicode, composition/commit scope, Ctrl-C and disabled input pass");
        }
    }
    for (name, palette) in [("light", contracts.light), ("dark", contracts.dark)] {
        cx.update(|app| rich_text::sync_theme(&contracts, palette, name == "dark", app));
        for width in [768., 320.] {
            let original = "\u{feff}first\r\nUnicode 東京 🦀\r\n";
            let mut fixture = None;
            let window = cx
                .open_window(size(px(width), px(400.)), |window, app: &mut App| {
                    let state = app.new(|cx| EditorState::new(window, cx).default_value(original));
                    let view = app.new(|_| FileEditorFixture {
                        contracts: contracts.clone(),
                        palette,
                        state,
                        readonly: false,
                    });
                    fixture = Some(view.clone());
                    app.new(|cx| gpui_component::Root::new(view, window, cx))
                })?
                .into();
            let fixture = fixture.context("The file editor was not mounted")?;
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            cx.update(|app| {
                anyhow::ensure!(
                    fixture.read(app).state.read(app).value().as_bytes() == original.as_bytes(),
                    "The editor changed BOM, line endings or Unicode before editing"
                );
                Ok::<_, anyhow::Error>(())
            })?;
            let before = cx.capture_screenshot(window)?;
            cx.update_window(window, |_, window, app| {
                fixture.read(app).state.clone().update(app, |state, cx| {
                    state.set_value("edited\r\n東京 🦀\r\n", window, cx)
                })
            })?;
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            let edited = cx.capture_screenshot(window)?;
            anyhow::ensure!(
                before.as_raw() != edited.as_raw(),
                "The editor update did not render"
            );
            edited.save(format!("/tmp/agi-gpui-editor-{name}-{width}.png"))?;
            cx.update(|app| {
                fixture.update(app, |view, cx| {
                    view.readonly = true;
                    cx.notify();
                })
            });
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            cx.update(|app| {
                anyhow::ensure!(
                    !fixture.read(app).state.read(app).is_editable(),
                    "The loading/saving guard did not reach the editor engine"
                );
                anyhow::ensure!(
                    fixture.read(app).state.read(app).value().as_str() == "edited\r\n東京 🦀\r\n",
                    "The guard changed editor text"
                );
                Ok::<_, anyhow::Error>(())
            })?;
            println!("{name} {width}px: file editor preserves BOM/CRLF/Unicode, renders edits and enforces its read-only state");
        }
    }
    let diff_source = "@@ -1 +1 @@\n-let before = true;\n+let after = true;\n~~~~~\n![diff image](file:///etc/passwd)\n[diff link](https://example.com/diff)";
    for (name, palette) in [("light", contracts.light), ("dark", contracts.dark)] {
        cx.update(|app| rich_text::sync_theme(&contracts, palette, name == "dark", app));
        for width in [768., 320.] {
            let window = cx
                .open_window(size(px(width), px(400.)), |window, app: &mut App| {
                    let document = app.new(|cx| {
                        TextViewState::markdown(
                            &agiworkforce_desktop_gpui::changes::diff_markdown(diff_source),
                            cx,
                        )
                    });
                    let view = app.new(|_| MarkdownFixture {
                        contracts: contracts.clone(),
                        palette,
                        document,
                    });
                    app.new(|cx| gpui_component::Root::new(view, window, cx))
                })?
                .into();
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            let first = cx.capture_screenshot(window)?;
            first.save(format!("/tmp/agi-gpui-diff-{name}-{width}.png"))?;
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            let repeated = cx.capture_screenshot(window)?;
            anyhow::ensure!(
                first.as_raw() == repeated.as_raw(),
                "The {name} diff lost content on repaint"
            );
            println!("{name} {width}px: isolated diff source survives repaint");
        }
        let mut fixture = None;
        let window = cx.open_window(size(px(320.), px(160.)), |window, app: &mut App| {
            let composer = app.new(|cx| {
                TextareaState::new(window, cx)
                    .auto_grow(1, 4)
                    .default_value("A draft")
            });
            let view = app.new(|_| RepaintFixture {
                count: 0,
                palette,
                contracts: Arc::clone(&contracts),
                composer,
            });
            fixture = Some(view.clone());
            app.new(|cx| gpui_component::Root::new(view, window, cx))
        })?;
        let fixture = fixture.context("The render fixture was not mounted")?;
        let window = window.into();
        let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
        cx.update(|app| clear.clear(app));
        let before = cx.capture_screenshot(window)?;
        anyhow::ensure!(
            before.width() > 0 && before.height() > 0,
            "The renderer returned an empty image"
        );
        let line_height =
            (contracts.body_line_height * before.height() as f32 / 160.).ceil() as u32;
        let heading = |image: &image::RgbaImage| {
            image
                .rows()
                .take(line_height as usize)
                .flat_map(|row| row.flat_map(|pixel| pixel.0))
                .collect::<Vec<_>>()
        };
        let initial_heading = heading(&before);
        let expected_background = [
            ((palette.background >> 16) & 255) as u8,
            ((palette.background >> 8) & 255) as u8,
            (palette.background & 255) as u8,
        ];
        anyhow::ensure!(
            before
                .pixels()
                .any(|pixel| pixel.0[..3] != expected_background),
            "Text never rendered in {name} mode"
        );
        cx.update(|app| {
            fixture.update(app, |state, cx| {
                state.count = 1;
                cx.notify();
            })
        });
        let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
        cx.update(|app| clear.clear(app));
        let after = cx.capture_screenshot(window)?;
        anyhow::ensure!(
            before.as_raw() != after.as_raw(),
            "The state change did not reach the renderer in {name} mode"
        );
        anyhow::ensure!(
            initial_heading == heading(&after),
            "Static text changed or disappeared after the update in {name} mode"
        );
        let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
        cx.update(|app| clear.clear(app));
        let repeated = cx.capture_screenshot(window)?;
        anyhow::ensure!(
            after.as_raw() == repeated.as_raw(),
            "An unchanged redraw lost content in {name} mode"
        );
        cx.update_window(window, |_, window, app| {
            fixture.read(app).composer.clone().update(app, |state, cx| {
                state.set_value("Unicode 🦀\n第二行", window, cx)
            });
        })?;
        let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
        cx.update(|app| clear.clear(app));
        let edited = cx.capture_screenshot(window)?;
        anyhow::ensure!(
            edited.as_raw() != repeated.as_raw(),
            "The multi-line composer update never rendered in {name} mode"
        );
        anyhow::ensure!(
            heading(&edited) == initial_heading,
            "Editing the composer changed the heading in {name} mode"
        );
        println!("{name}: text survives state changes and unchanged redraws");
    }
    let source = "# A research reply\n\nA **bold** finding with `inline_code` and a [source](https://example.com/research).\n\n- First finding\n- Second finding\n\n| Item | Result |\n| --- | --- |\n| Rust | Ready |\n\n```rust\nlet answer = 42;\n```\n\n![Remote diagram](https://example.com/tracker.png)\n\n![Local diagram](file:///etc/passwd)\n\n![Reference diagram][asset]\n\n[asset]: https://example.com/another.png\n\n![Embedded diagram](data:image/png;base64,iVBORw0KGgo=)\n\nInline <img src=\"https://example.com/inline.png\"> text.\n\n<img src=\"file:///etc/passwd\">\n";
    let source = format!(
        "{source}\n\n{}",
        agiworkforce_desktop_gpui::changes::diff_markdown(diff_source)
    );
    for (name, palette) in [("light", contracts.light), ("dark", contracts.dark)] {
        cx.update(|app| rich_text::sync_theme(&contracts, palette, name == "dark", app));
        for width in [768., 320.] {
            let mut document = None;
            let window = cx.open_window(size(px(width), px(1200.)), |window, app: &mut App| {
                let state = app.new(|cx| TextViewState::markdown(&source, cx));
                document = Some(state.clone());
                let view = app.new(|_| MarkdownFixture {
                    contracts: contracts.clone(),
                    palette,
                    document: state,
                });
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?;
            let document = document.context("The Markdown fixture was not mounted")?;
            let window = window.into();
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            cx.update(|app| {
                let text = document.read(app).rendered_text();
                for expected in [
                    "A research reply",
                    "A bold finding",
                    "inline_code",
                    "let answer = 42;",
                    "Rust Ready",
                    "Image: Remote diagram (not loaded)",
                    "Image: Local diagram (not loaded)",
                    "Image: Reference diagram (not loaded)",
                    "Image: Embedded diagram (not loaded)",
                    "<img src=\"https://example.com/inline.png\">",
                    "<img src=\"file:///etc/passwd\">",
                    "+let after = true;",
                    "![diff image](file:///etc/passwd)",
                    "[diff link](https://example.com/diff)",
                ] {
                    anyhow::ensure!(
                        text.as_str().contains(expected),
                        "The {name} Markdown projection lost {expected:?}: {:?}",
                        text.as_str()
                    );
                }
                document.update(app, TextViewState::select_all);
                let copied = document.read(app).selected_text();
                anyhow::ensure!(
                    copied.trim() == source.trim(),
                    "The {name} Markdown source selection lost content: {copied:?}"
                );
                document.update(app, TextViewState::clear_selection);
                Ok::<_, anyhow::Error>(())
            })?;
            let first = cx.capture_screenshot(window)?;
            first.save(format!("/tmp/agi-gpui-markdown-{name}-{width}.png"))?;
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            let repeated = cx.capture_screenshot(window)?;
            anyhow::ensure!(
                first.as_raw() == repeated.as_raw(),
                "The {name} Markdown reply changed on an unchanged redraw"
            );
            cx.update(|app| document.update(app, |state, cx| state.set_text("## Updated reply\n\nUnicode 🦀 and **new output**.\n\n```rust\nlet changed = true;\n```", cx)));
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            let updated = cx.capture_screenshot(window)?;
            anyhow::ensure!(
                updated.as_raw() != repeated.as_raw(),
                "The {name} Markdown update never rendered"
            );
            cx.update(|app| {
                document.update(app, |state, cx| {
                    state.set_text("```rust\nlet copied = true;\n```", cx)
                })
            });
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            cx.update_window(window, |_, window, app| {
                app.write_to_clipboard(gpui::ClipboardItem::new_string(
                    "clipboard sentinel".into(),
                ));
                let position = gpui::point(window.bounds().size.width - px(18.), px(20.));
                window.dispatch_event(
                    gpui::PlatformInput::MouseDown(gpui::MouseDownEvent {
                        position,
                        button: gpui::MouseButton::Left,
                        click_count: 1,
                        ..Default::default()
                    }),
                    app,
                );
                window.dispatch_event(
                    gpui::PlatformInput::MouseUp(gpui::MouseUpEvent {
                        position,
                        button: gpui::MouseButton::Left,
                        click_count: 1,
                        modifiers: Default::default(),
                    }),
                    app,
                );
                anyhow::ensure!(
                    app.read_from_clipboard()
                        .and_then(|item| item.text())
                        .as_deref()
                        == Some("let copied = true;"),
                    "The {name} code-copy control did not copy the code"
                );
                Ok::<_, anyhow::Error>(())
            })??;
            println!("{name} {width}px: Markdown, code, tables, source selection, code copying and media policy survive repaint and replacement");
        }
    }
    for (name, palette) in [("light", contracts.light), ("dark", contracts.dark)] {
        cx.update(|app| rich_text::sync_theme(&contracts, palette, name == "dark", app));
        let mut fixture = None;
        let window = cx.open_window(size(px(320.), px(160.)), |window, app: &mut App| {
            let view = app.new(|_| HistoryFixture {
                viewport: Default::default(),
                rows: vec!["First page".into()],
                document: None,
                contracts: contracts.clone(),
                palette,
            });
            view.update(app, |state, cx| {
                state.viewport.latest();
                cx.notify();
            });
            fixture = Some(view.clone());
            app.new(|cx| gpui_component::Root::new(view, window, cx))
        })?;
        let fixture = fixture.context("The history viewport was not mounted")?;
        let window = window.into();
        let draw = |cx: &mut HeadlessAppContext| -> Result<()> {
            let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
            cx.update(|app| clear.clear(app));
            Ok(())
        };
        draw(&mut cx)?;
        cx.update(|app| {
            fixture.update(app, |state, cx| {
                state.rows = (0..50).map(|index| format!("Message {index}")).collect();
                cx.notify();
            })
        });
        draw(&mut cx)?;
        cx.update(|app| {
            let state = fixture.read(app);
            anyhow::ensure!(
                state.viewport.scroll.max_offset().y > px(0.),
                "The {name} history fixture never overflowed"
            );
            anyhow::ensure!(
                state.viewport.scroll.offset().y == -state.viewport.scroll.max_offset().y,
                "The {name} latest window did not reach the bottom after layout"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update(|app| {
            fixture.update(app, |state, cx| {
                state
                    .viewport
                    .scroll
                    .set_offset(gpui::point(px(0.), px(0.)));
                state.rows.push("New output".into());
                cx.notify();
            })
        });
        draw(&mut cx)?;
        cx.update(|app| {
            anyhow::ensure!(
                fixture.read(app).viewport.scroll.offset().y == px(0.),
                "The {name} stream pulled the reader away from older content"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update(|app| {
            fixture.update(app, |state, cx| {
                state.viewport.older();
                state.rows.insert(0, "An older page".into());
                cx.notify();
            })
        });
        draw(&mut cx)?;
        cx.update(|app| {
            anyhow::ensure!(
                fixture.read(app).viewport.scroll.offset().y == px(0.),
                "The {name} older page jumped to the end"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        let text = format!(
            "{}\n\nLast paragraph",
            "A long **Markdown** paragraph with Unicode 🦀.\n\n".repeat(200)
        );
        cx.update(|app| {
            let document = app.new(|cx| TextViewState::markdown(&text, cx));
            fixture.update(app, |state, cx| {
                state.rows.clear();
                state.document = Some(document);
                state.viewport.latest();
                cx.notify();
            });
        });
        draw(&mut cx)?;
        cx.run_until_parked();
        draw(&mut cx)?;
        cx.run_until_parked();
        draw(&mut cx)?;
        cx.update(|app| {
            let state = fixture.read(app);
            anyhow::ensure!(
                state
                    .document
                    .as_ref()
                    .unwrap()
                    .read(app)
                    .rendered_text()
                    .as_str()
                    .contains("Last paragraph"),
                "The {name} Markdown measurement ran before parsing settled"
            );
            anyhow::ensure!(
                state.viewport.scroll.max_offset().y > px(0.),
                "The {name} Markdown viewport never overflowed"
            );
            anyhow::ensure!(
                state.viewport.scroll.offset().y == -state.viewport.scroll.max_offset().y,
                "The {name} latest view lost the bottom after asynchronous Markdown layout"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        println!("{name}: latest scrolling waits for layout, preserves reading position and handles asynchronous Markdown");
    }
    Ok(())
}
