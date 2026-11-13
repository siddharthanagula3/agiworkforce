use std::sync::{Arc, Mutex};
use std::time::Duration;

use agiworkforce_desktop_gpui::{
    cloud_model_select,
    config::{NativeContracts, Palette},
};
use agiworkforce_protocol::account_cloud::CloudModelSummary;
use anyhow::{ensure, Context as _, Result};
use gpui::{
    div, prelude::*, px, rgb, size, App, Context, Entity, Focusable, HeadlessAppContext, Window,
};
use gpui_component::select::SelectEvent;

struct Fixture {
    control: Entity<cloud_model_select::ModelSelectState>,
    contracts: Arc<NativeContracts>,
    palette: Palette,
    disabled: bool,
    refreshes: usize,
    footer_mode: bool,
}

impl Render for Fixture {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let refresh = agiworkforce_desktop_gpui::native_controls::button(
            "fixture-refresh-models",
            "Refresh models",
            |view: &mut Fixture, _, cx| {
                view.refreshes += 1;
                cx.notify();
            },
            &self.contracts,
            self.palette,
            cx,
        )
        .into_any_element();
        let toolbar = cloud_model_select::row(
            &self.control,
            &self.contracts,
            window.bounds().size.width.into(),
            self.disabled,
            false,
            Some(refresh),
        )
        .into_any_element();
        let root = div()
            .size_full()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size));
        if self.footer_mode {
            let header = agiworkforce_desktop_gpui::native_frame::header(
                "Conversation".into(),
                None,
                vec![],
                &self.contracts,
            );
            let footer = agiworkforce_desktop_gpui::native_frame::footer(toolbar, &self.contracts);
            root.child(agiworkforce_desktop_gpui::native_frame::main(
                header.into_any_element(),
                div().size_full().into_any_element(),
                Some(footer.into_any_element()),
            ))
        } else {
            root.p_4().child(toolbar)
        }
    }
}

fn models() -> Vec<CloudModelSummary> {
    let mut rows = vec![
        CloudModelSummary {
            id: "fixture-current".into(),
            display_name: "Current model".into(),
            developer_label: "Research lab".into(),
            admitted: true,
            temporarily_unavailable: false,
            minimum_plan_label: None,
        },
        CloudModelSummary {
            id: "fixture-blocked".into(),
            display_name: "Plan restricted model".into(),
            developer_label: "Research lab".into(),
            admitted: false,
            temporarily_unavailable: false,
            minimum_plan_label: Some("Other plan".into()),
        },
        CloudModelSummary {
            id: "fixture-unavailable".into(),
            display_name: "Unavailable model".into(),
            developer_label: "Research lab".into(),
            admitted: true,
            temporarily_unavailable: true,
            minimum_plan_label: None,
        },
        CloudModelSummary {
            id: "fixture-target".into(),
            display_name: "Target 東京 🦀 model with a very long display name".into(),
            developer_label: "A different developer with a long label".into(),
            admitted: true,
            temporarily_unavailable: false,
            minimum_plan_label: None,
        },
    ];
    for index in 0..100 {
        rows.push(CloudModelSummary {
            id: format!("fixture-archive-{index}"),
            display_name: format!("Archive option {index}"),
            developer_label: "Archive lab".into(),
            admitted: true,
            temporarily_unavailable: false,
            minimum_plan_label: None,
        });
    }
    rows
}

pub fn footer_menu(
    cx: &mut HeadlessAppContext,
    contracts: &Arc<NativeContracts>,
    name: &str,
    palette: Palette,
) -> Result<()> {
    for width in [768., 320.] {
        let mut fixture = None;
        let window = cx
            .open_window(size(px(width), px(500.)), |window, app: &mut App| {
                let view = app.new(|cx| {
                    let control = cx.new(|cx| {
                        cloud_model_select::state(
                            &models(),
                            Some("fixture-current"),
                            contracts.clone(),
                            window,
                            cx,
                        )
                    });
                    Fixture {
                        control,
                        contracts: contracts.clone(),
                        palette,
                        disabled: false,
                        refreshes: 0,
                        footer_mode: true,
                    }
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("footer model fixture missing")?;
        draw(cx, window)?;
        cx.update_window(window, |_, window, app| {
            let focus = fixture.read(app).control.read(app).focus_handle(app);
            focus.focus(window, app);
        })?;
        draw(cx, window)?;
        let closed = cx.capture_screenshot(window)?;
        key(cx, window, "enter")?;
        cx.advance_clock(Duration::from_millis(200));
        draw(cx, window)?;
        let opened = cx.capture_screenshot(window)?;
        opened.save(format!("/tmp/agi-gpui-frame-model-menu-{name}-{width}.png"))?;
        let scale = opened.width() as f32 / width;
        let top = (contracts.frame.header_height * scale) as u32;
        let bottom = (300. * scale) as u32;
        let changed = (top..bottom)
            .flat_map(|y| (0..opened.width()).map(move |x| (x, y)))
            .filter(|&(x, y)| opened.get_pixel(x, y) != closed.get_pixel(x, y))
            .count();
        ensure!(
            changed as f32 > width * contracts.model_picker.row_height / 4.,
            "The footer model menu did not paint above its fixed footer; changed {changed} pixels"
        );
        key(cx, window, "escape")?;
        cx.update_window(window, |_, window, app| {
            ensure!(
                fixture
                    .read(app)
                    .control
                    .read(app)
                    .focus_handle(app)
                    .is_focused(window),
                "Footer model dismissal did not restore trigger focus"
            );
            Ok::<_, anyhow::Error>(())
        })??;
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{name} {width}px: footer model popup escapes the footer without clipping and restores focus");
    }
    Ok(())
}

pub(super) fn draw(cx: &mut HeadlessAppContext, window: gpui::AnyWindowHandle) -> Result<()> {
    cx.run_until_parked();
    let clear = cx.update_window(window, |_, window, app| window.draw(app))?;
    cx.update(|app| clear.clear(app));
    Ok(())
}

pub(super) fn key(
    cx: &mut HeadlessAppContext,
    window: gpui::AnyWindowHandle,
    key: &'static str,
) -> Result<()> {
    let keystroke = gpui::Keystroke::parse(key)?;
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
    draw(cx, window)
}

pub(super) fn input(
    cx: &mut HeadlessAppContext,
    window: gpui::AnyWindowHandle,
    text: &str,
) -> Result<()> {
    for character in text.chars() {
        cx.update_window(window, |_, window, app| {
            window.dispatch_keystroke(
                gpui::Keystroke {
                    key: character.to_string(),
                    key_char: Some(character.to_string()),
                    modifiers: Default::default(),
                },
                app,
            )
        })?;
    }
    cx.advance_clock(Duration::from_secs(1));
    draw(cx, window)
}

pub(super) fn click(
    cx: &mut HeadlessAppContext,
    window: gpui::AnyWindowHandle,
    x: f32,
    y: f32,
) -> Result<()> {
    cx.update_window(window, |_, window, app| {
        let position = gpui::point(px(x), px(y));
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
                ..Default::default()
            }),
            app,
        );
    })?;
    draw(cx, window)
}

fn closed_menu(
    image: &image::RgbaImage,
    width: f32,
    palette: Palette,
    contracts: &NativeContracts,
) -> Result<()> {
    let scale = image.width() as f32 / width;
    let below_toolbar = ((contracts.model_picker.row_height
        + 4. * contracts.model_picker.viewport_margin)
        * scale) as u32;
    let ground = [
        (palette.background >> 16) as u8,
        (palette.background >> 8) as u8,
        palette.background as u8,
    ];
    for y in below_toolbar..image.height() {
        for x in 0..image.width() {
            ensure!(
                image.get_pixel(x, y).0[..3] == ground,
                "A closed model menu still paints below its toolbar"
            );
        }
    }
    Ok(())
}

pub fn run(
    cx: &mut HeadlessAppContext,
    contracts: &Arc<NativeContracts>,
    name: &str,
    palette: Palette,
) -> Result<()> {
    for width in [768., 390., 320.] {
        let events = Arc::new(Mutex::new(Vec::<String>::new()));
        let captured = events.clone();
        let mut fixture = None;
        let window = cx
            .open_window(size(px(width), px(500.)), |window, app: &mut App| {
                let view = app.new(|cx| {
                    let control = cx.new(|cx| {
                        cloud_model_select::state(
                            &models(),
                            Some("fixture-current"),
                            contracts.clone(),
                            window,
                            cx,
                        )
                    });
                    cx.subscribe(
                        &control,
                        move |_: &mut Fixture, _, event: &SelectEvent<_>, _| {
                            if let SelectEvent::Confirm(Some(id)) = event {
                                captured.lock().unwrap().push(id.clone());
                            }
                        },
                    )
                    .detach();
                    Fixture {
                        control,
                        contracts: contracts.clone(),
                        palette,
                        disabled: false,
                        refreshes: 0,
                        footer_mode: false,
                    }
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("model picker fixture missing")?;
        draw(cx, window)?;
        cx.update_window(window, |_, window, app| {
            fixture
                .read(app)
                .control
                .read(app)
                .focus_handle(app)
                .focus(window, app)
        })?;
        draw(cx, window)?;
        let closed = cx.capture_screenshot(window)?;
        cx.update_window(window, |_, window, app| {
            ensure!(
                fixture
                    .read(app)
                    .control
                    .read(app)
                    .focus_handle(app)
                    .is_focused(window),
                "The model control did not receive native focus"
            );
            ensure!(
                fixture
                    .read(app)
                    .control
                    .read(app)
                    .selected_value()
                    .map(String::as_str)
                    == Some("fixture-current"),
                "The current model is not selected"
            );
            Ok::<_, anyhow::Error>(())
        })??;
        key(cx, window, "enter")?;
        cx.advance_clock(Duration::from_millis(200));
        draw(cx, window)?;
        let opened = cx.capture_screenshot(window)?;
        opened.save(format!("/tmp/agi-gpui-model-picker-{name}-{width}.png"))?;
        ensure!(
            closed.as_raw() != opened.as_raw(),
            "The model menu did not open"
        );
        let scale = opened.width() as f32 / width;
        let menu_width = contracts
            .model_picker
            .menu_width
            .min(width - 2. * contracts.model_picker.viewport_margin);
        let column = (menu_width * 0.75 * scale) as u32;
        let highlight = [
            (palette.hover >> 16) as u8,
            (palette.hover >> 8) as u8,
            palette.hover as u8,
        ];
        let (mut run, mut longest, mut end) = (0_u32, 0_u32, 0_u32);
        for y in 0..opened.height() {
            run = if opened.get_pixel(column, y).0[..3] == highlight {
                run + 1
            } else {
                0
            };
            if run > longest {
                longest = run;
                end = y + 1;
            }
        }
        ensure!(
            longest as f32 / scale == contracts.model_picker.row_height,
            "The model row is not the required height: {}",
            longest as f32 / scale
        );
        let first_row = (end - longest) as f32 / scale;
        draw(cx, window)?;
        let repeated = cx.capture_screenshot(window)?;
        ensure!(
            opened.as_raw() == repeated.as_raw(),
            "The open menu changed on an unchanged redraw"
        );
        let foreground = [
            (palette.foreground >> 16) as u8,
            (palette.foreground >> 8) as u8,
            palette.foreground as u8,
        ];
        let edge = (contracts.model_picker.viewport_margin * scale / 2.) as u32;
        for y in 0..opened.height() {
            for x in (0..edge).chain(opened.width() - edge..opened.width()) {
                ensure!(
                    opened.get_pixel(x, y).0[..3] != foreground,
                    "Model text or controls reach the viewport edge"
                );
            }
        }
        click(
            cx,
            window,
            menu_width * 0.75,
            first_row + contracts.model_picker.row_height * 1.5,
        )?;
        ensure!(
            events.lock().unwrap().is_empty(),
            "Pointer activation selected a restricted model"
        );
        key(cx, window, "escape")?;
        ensure!(
            events.lock().unwrap().is_empty(),
            "Dismissal committed a model"
        );
        cx.update_window(window, |_, window, app| {
            ensure!(
                fixture
                    .read(app)
                    .control
                    .read(app)
                    .focus_handle(app)
                    .is_focused(window),
                "Escape did not restore trigger focus"
            );
            Ok::<_, anyhow::Error>(())
        })??;
        key(cx, window, "enter")?;
        key(cx, window, "down")?;
        key(cx, window, "enter")?;
        ensure!(
            events.lock().unwrap().is_empty(),
            "A plan-restricted model was committed"
        );
        key(cx, window, "down")?;
        key(cx, window, "enter")?;
        ensure!(
            events.lock().unwrap().is_empty(),
            "A temporarily unavailable model was committed"
        );
        key(cx, window, "down")?;
        key(cx, window, "enter")?;
        let observed = events.lock().unwrap().clone();
        ensure!(
            observed == vec!["fixture-target".to_string()],
            "Keyboard navigation selected a disabled model or failed to commit: {observed:?}"
        );
        key(cx, window, "enter")?;
        input(cx, window, "ARCHIVE OPTION 37")?;
        cx.update(|app| {
            ensure!(
                events.lock().unwrap().len() == 1
                    && fixture
                        .read(app)
                        .control
                        .read(app)
                        .selected_value()
                        .map(String::as_str)
                        == Some("fixture-target"),
                "Filtering changed the committed model before confirmation"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        let filtered = cx.capture_screenshot(window)?;
        filtered.save(format!("/tmp/agi-gpui-model-search-{name}-{width}.png"))?;
        key(cx, window, "enter")?;
        let observed = events.lock().unwrap().clone();
        ensure!(
            observed
                == vec![
                    "fixture-target".to_string(),
                    "fixture-archive-37".to_string()
                ],
            "Search did not select the filtered model: {observed:?}"
        );
        key(cx, window, "enter")?;
        input(cx, window, "nothing matches this query")?;
        key(cx, window, "enter")?;
        ensure!(
            events.lock().unwrap().len() == 2,
            "An empty result set committed a model"
        );
        click(
            cx,
            window,
            width - contracts.model_picker.viewport_margin,
            480.,
        )?;
        ensure!(
            events.lock().unwrap().len() == 2,
            "Outside dismissal committed a model"
        );
        closed_menu(&cx.capture_screenshot(window)?, width, palette, contracts)?;
        cx.update_window(window, |_, _, app| {
            ensure!(
                fixture
                    .read(app)
                    .control
                    .read(app)
                    .selected_value()
                    .map(String::as_str)
                    == Some("fixture-archive-37"),
                "Dismissal replaced the selected model"
            );
            Ok::<_, anyhow::Error>(())
        })??;
        click(cx, window, width - 32., 32.)?;
        cx.update(|app| {
            ensure!(
                fixture.read(app).refreshes == 1,
                "The production refresh button did not receive its pointer action"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            ensure!(
                fixture.read(app).refreshes == 2,
                "The refresh button did not activate from its keyboard focus"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.disabled = true;
                cx.notify();
            });
            fixture
                .read(app)
                .control
                .read(app)
                .focus_handle(app)
                .focus(window, app);
        })?;
        draw(cx, window)?;
        key(cx, window, "enter")?;
        ensure!(
            events.lock().unwrap().len() == 2,
            "Disabled picker committed a model"
        );
        closed_menu(&cx.capture_screenshot(window)?, width, palette, contracts)?;
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{name} {width}px: model menu, measured rows, clipping, stable repaint, filtering, disabled choices, dismissal, focus and refresh actions pass");
    }
    Ok(())
}
