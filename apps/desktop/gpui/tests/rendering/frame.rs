use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    native_controls, native_frame,
};
use anyhow::{ensure, Context as _, Result};
use gpui::{
    div, prelude::*, px, rgb, size, App, Bounds, Context, Entity, FocusHandle, HeadlessAppContext,
    Pixels, ScrollHandle, Window,
};
use gpui_component::input::{InputEvent, TextareaState};

use super::model_picker::{draw, key};

type Measurements = Arc<Mutex<HashMap<&'static str, Bounds<Pixels>>>>;

struct Measured {
    name: &'static str,
    element: gpui::AnyElement,
    values: Measurements,
}

fn measured(name: &'static str, element: impl IntoElement, values: &Measurements) -> Measured {
    Measured {
        name,
        element: element.into_any_element(),
        values: values.clone(),
    }
}

impl IntoElement for Measured {
    type Element = Self;
    fn into_element(self) -> Self {
        self
    }
}

impl gpui::Element for Measured {
    type RequestLayoutState = ();
    type PrepaintState = ();
    fn id(&self) -> Option<gpui::ElementId> {
        None
    }
    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        None
    }
    fn request_layout(
        &mut self,
        _: Option<&gpui::GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (gpui::LayoutId, ()) {
        (self.element.request_layout(window, cx), ())
    }
    fn prepaint(
        &mut self,
        _: Option<&gpui::GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        self.values.lock().unwrap().insert(self.name, bounds);
        self.element.prepaint(window, cx);
    }
    fn paint(
        &mut self,
        _: Option<&gpui::GlobalElementId>,
        _: Option<&gpui::InspectorElementId>,
        _: Bounds<Pixels>,
        _: &mut (),
        _: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        self.element.paint(window, cx);
    }
}

struct Fixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    composer: Entity<TextareaState>,
    scroll: ScrollHandle,
    measurements: Measurements,
    navigation_open: bool,
    menu: FocusHandle,
    close: FocusHandle,
    stopped: bool,
    stops: usize,
}

impl Render for Fixture {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.measurements.lock().unwrap().clear();
        let width: f32 = window.bounds().size.width.into();
        let small = native_frame::compact(width, &self.contracts);
        let palette = self.palette;
        let geometry = &self.contracts.frame;
        let menu = small.then(|| {
            native_controls::compact_button(
                "test-menu",
                "Menu",
                |view: &mut Fixture, window, cx| {
                    view.navigation_open = true;
                    view.close.focus(window, cx);
                    cx.notify();
                },
                &self.contracts,
                palette,
                cx,
            )
            .track_focus(&self.menu)
            .into_any_element()
        });
        let header = measured(
            "header",
            native_frame::header(
                "A conversation title that must truncate in a narrow window".into(),
                menu,
                vec![],
                &self.contracts,
            ),
            &self.measurements,
        );
        let mut sidebar = div()
            .h_full()
            .flex()
            .flex_col()
            .bg(rgb(palette.sidebar))
            .when(small, gpui::Styled::w_full)
            .when(!small, |pane| pane.w(px(geometry.sidebar_width)));
        if small {
            sidebar = sidebar.child(
                native_controls::button(
                    "test-close-navigation",
                    "Close navigation",
                    |view: &mut Fixture, window, cx| {
                        view.navigation_open = false;
                        view.menu.focus(window, cx);
                        cx.notify();
                    },
                    &self.contracts,
                    palette,
                    cx,
                )
                .track_focus(&self.close),
            );
        }
        sidebar = sidebar.child(gpui::text!("Test navigation"));
        let mut transcript = div()
            .id("test-scroll")
            .w_full()
            .h_full()
            .overflow_y_scroll()
            .track_scroll(&self.scroll)
            .flex()
            .flex_col();
        for index in 0_usize..100 {
            transcript = transcript.child(
                div()
                    .id(("test-row", index))
                    .h(px(self.contracts.body_line_height))
                    .flex_shrink_0()
                    .child(gpui::text!(format!("Message {index}: 東京 🦀"))),
            );
        }
        let content = measured(
            "content",
            div()
                .w_full()
                .h_full()
                .min_h_0()
                .relative()
                .child(transcript),
            &self.measurements,
        );
        let action = native_controls::compact_button(
            "test-stop",
            if self.stopped { "Send" } else { "Stop" },
            |view: &mut Fixture, _, cx| {
                view.stops += 1;
                view.stopped = true;
                cx.notify();
            },
            &self.contracts,
            palette,
            cx,
        )
        .into_any_element();
        let composer = measured(
            "composer",
            native_frame::composer(
                &self.composer,
                "Test composer",
                !self.stopped,
                false,
                Some(measured("action", action, &self.measurements).into_any_element()),
                &self.contracts,
                palette,
            ),
            &self.measurements,
        );
        let footer = measured(
            "footer",
            native_frame::footer(composer.into_any_element(), &self.contracts),
            &self.measurements,
        );
        let main = native_frame::main(
            header.into_any_element(),
            content.into_any_element(),
            Some(footer.into_any_element()),
        );
        div()
            .size_full()
            .bg(rgb(palette.background))
            .text_color(rgb(palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height))
            .on_key_down(cx.listener(|view, event: &gpui::KeyDownEvent, window, cx| {
                if event.keystroke.key == "escape" && view.navigation_open {
                    view.navigation_open = false;
                    view.menu.focus(window, cx);
                    cx.notify();
                }
            }))
            .child(native_frame::layout(
                width,
                self.navigation_open,
                sidebar.into_any_element(),
                main.into_any_element(),
                &self.contracts,
            ))
    }
}

fn geometry(
    measurements: &Measurements,
    width: f32,
    height: f32,
    contracts: &NativeContracts,
) -> Result<HashMap<&'static str, Bounds<Pixels>>> {
    let values = measurements.lock().unwrap().clone();
    let header = values.get("header").context("header bounds missing")?;
    let content = values.get("content").context("content bounds missing")?;
    let footer = values.get("footer").context("footer bounds missing")?;
    let composer = values.get("composer").context("composer bounds missing")?;
    let sidebar = if native_frame::compact(width, contracts) {
        0.
    } else {
        contracts.frame.sidebar_width
    };
    ensure!(
        f32::from(header.left()) == sidebar && f32::from(header.top()) == 0.,
        "Header moved outside the main column: {header:?}"
    );
    ensure!(
        f32::from(header.size.height) == contracts.frame.header_height,
        "Header height differs from its owner"
    );
    ensure!(
        f32::from(footer.bottom()) == height,
        "The composer footer is not fixed to the window bottom: {footer:?}"
    );
    ensure!(
        content.top() == header.bottom() && content.bottom() == footer.top(),
        "Transcript overlaps header or composer: {content:?}, {footer:?}"
    );
    let expected_width = contracts
        .frame
        .content_width
        .min(width - sidebar - 2. * contracts.frame.viewport_gutter);
    ensure!(
        f32::from(composer.size.width) == expected_width,
        "Composer width is not constrained by the shared frame: {composer:?}"
    );
    ensure!(
        f32::from(composer.size.height) >= contracts.frame.composer_min_height,
        "Composer is shorter than its minimum"
    );
    ensure!(
        composer.left() >= footer.left() && composer.right() <= footer.right(),
        "Composer overflows horizontally"
    );
    Ok(values)
}

pub fn run(
    cx: &mut HeadlessAppContext,
    contracts: &Arc<NativeContracts>,
    name: &str,
    palette: Palette,
) -> Result<()> {
    for (width, height) in [
        (1440., 900.),
        (1024., 760.),
        (768., 760.),
        (390., 760.),
        (320., 640.),
    ] {
        let measurements = Arc::new(Mutex::new(HashMap::new()));
        let mut fixture = None;
        let window = cx
            .open_window(size(px(width), px(height)), |window, app: &mut App| {
                let view = app.new(|cx| {
                    let composer = cx.new(|cx| {
                        TextareaState::new(window, cx)
                            .auto_grow(1, 8)
                            .submit_on_enter(true)
                    });
                    cx.subscribe(&composer, |_: &mut Fixture, _, _: &InputEvent, cx| {
                        cx.notify()
                    })
                    .detach();
                    Fixture {
                        contracts: contracts.clone(),
                        palette,
                        composer,
                        scroll: ScrollHandle::new(),
                        measurements: measurements.clone(),
                        navigation_open: false,
                        menu: cx.focus_handle(),
                        close: cx.focus_handle(),
                        stopped: false,
                        stops: 0,
                    }
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("frame fixture missing")?;
        draw(cx, window)?;
        let initial = geometry(&measurements, width, height, contracts)?;
        ensure!(
            f32::from(initial["composer"].size.height) == contracts.frame.composer_min_height,
            "Resting composer is not the canonical height: {:?}; action: {:?}",
            initial["composer"],
            initial["action"]
        );
        let unscrolled = cx.capture_screenshot(window)?;
        cx.update(|app| {
            fixture.update(app, |view, cx| {
                view.scroll.set_offset(gpui::point(px(0.), px(-500.)));
                cx.notify();
            });
        });
        draw(cx, window)?;
        ensure!(
            unscrolled.as_raw() != cx.capture_screenshot(window)?.as_raw(),
            "The scrolling probe did not change transcript pixels"
        );
        let scrolled = geometry(&measurements, width, height, contracts)?;
        ensure!(
            scrolled["footer"] == initial["footer"],
            "Scrolling moved the composer footer"
        );
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.stopped = true;
                view.composer.update(cx, |state, cx| {
                    state.set_value("First line\nSecond line\nThird line 東京 🦀", window, cx)
                });
                cx.notify();
            });
        })?;
        cx.advance_clock(Duration::from_millis(200));
        draw(cx, window)?;
        let grown = geometry(&measurements, width, height, contracts)?;
        ensure!(
            grown["composer"].size.height > initial["composer"].size.height,
            "Multiline input did not grow"
        );
        ensure!(
            grown["content"].size.height < initial["content"].size.height,
            "Composer growth did not resize the transcript viewport"
        );
        cx.capture_screenshot(window)?
            .save(format!("/tmp/agi-gpui-frame-{name}-{width}.png"))?;
        if native_frame::compact(width, contracts) {
            cx.update_window(window, |_, window, app| {
                let focus = fixture.read(app).menu.clone();
                focus.focus(window, app)
            })?;
            key(cx, window, "enter")?;
            ensure!(
                cx.update(|app| fixture.read(app).navigation_open),
                "Keyboard did not open compact navigation"
            );
            ensure!(
                !measurements.lock().unwrap().contains_key("composer"),
                "The hidden main pane remained mounted behind compact navigation"
            );
            key(cx, window, "escape")?;
            ensure!(
                !cx.update(|app| fixture.read(app).navigation_open),
                "Escape did not close compact navigation"
            );
            cx.update_window(window, |_, window, app| {
                ensure!(
                    fixture.read(app).menu.is_focused(window),
                    "Navigation did not restore menu focus"
                );
                Ok::<_, anyhow::Error>(())
            })??;
            geometry(&measurements, width, height, contracts)?;
        }
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{name} {width}px: frame slots, fixed footer, transcript scrolling, multiline growth, width bounds and compact navigation pass");
    }
    Ok(())
}
