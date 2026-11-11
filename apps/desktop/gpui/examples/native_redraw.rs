use std::path::PathBuf;
use std::sync::Arc;

use agiworkforce_desktop_gpui::config::NativeContracts;
use agiworkforce_desktop_gpui::{native_controls, rich_text};
use anyhow::Result;
use gpui::{
    actions, div, prelude::*, px, rgb, size, App, Bounds, Context, FocusHandle, KeyBinding, Window,
    WindowBounds, WindowOptions,
};

actions!(redraw_probe, [Increment, Capture, Quit]);

struct Probe {
    contracts: Arc<NativeContracts>,
    focus: FocusHandle,
    count: usize,
    captures: usize,
    dark: bool,
    status: String,
    output: PathBuf,
}

impl Probe {
    fn increment(&mut self, cx: &mut Context<Self>) {
        self.count += 1;
        cx.notify();
    }

    fn capture(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let destination = self.output.join(format!(
            "renderer-{}-{}-{}.png",
            if self.dark { "dark" } else { "light" },
            self.count,
            self.captures,
        ));
        self.captures += 1;
        let result = window.render_to_image().and_then(|image| {
            image.save(&destination)?;
            Ok(())
        });
        self.status = match result {
            Ok(()) => format!("Saved {}", destination.display()),
            Err(error) => format!("Capture failed: {error:#}"),
        };
        eprintln!("{}", self.status);
        cx.notify();
    }
}

impl Render for Probe {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let palette = if self.dark {
            self.contracts.dark
        } else {
            self.contracts.light
        };
        rich_text::sync_theme(&self.contracts, palette, self.dark, cx);
        let increment = native_controls::button(
            "probe-increment",
            "Increment",
            |view: &mut Probe, _, cx| view.increment(cx),
            &self.contracts,
            palette,
            cx,
        );
        let capture = native_controls::button(
            "probe-capture",
            "Save renderer image",
            |view: &mut Probe, window, cx| view.capture(window, cx),
            &self.contracts,
            palette,
            cx,
        );
        let appearance = native_controls::button(
            "probe-appearance",
            "Toggle probe appearance",
            |view: &mut Probe, _, cx| {
                view.dark = !view.dark;
                cx.notify();
            },
            &self.contracts,
            palette,
            cx,
        );
        div()
            .id("native-redraw-probe")
            .track_focus(&self.focus)
            .size_full()
            .flex()
            .flex_col()
            .gap_4()
            .p_6()
            .bg(rgb(palette.background))
            .text_color(rgb(palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height))
            .on_action(cx.listener(|view, _: &Increment, _, cx| view.increment(cx)))
            .on_action(cx.listener(|view, _: &Capture, window, cx| view.capture(window, cx)))
            .on_action(cx.listener(|_, _: &Quit, _, cx| cx.quit()))
            .child(gpui::text!("Static accessible heading"))
            .child("Static plain heading")
            .child(gpui::text!(format!("Counter: {}", self.count)))
            .child(increment)
            .child(capture)
            .child(appearance)
            .child(gpui::text!(self.status.clone()))
    }
}

fn main() -> Result<()> {
    let output =
        std::env::temp_dir().join(format!("agi-gpui-native-redraw-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&output)?;
    let contracts = Arc::new(NativeContracts::load()?);
    gpui_platform::application()
        .with_assets(gpui_kit_assets::Assets)
        .run(move |cx: &mut App| {
            gpui_component::init(cx);
            cx.on_window_closed(|cx, _| {
                if cx.windows().is_empty() {
                    cx.quit();
                }
            })
            .detach();
            let bindings = [
                ("secondary-i", Box::new(Increment) as Box<dyn gpui::Action>),
                ("secondary-p", Box::new(Capture) as Box<dyn gpui::Action>),
                ("secondary-q", Box::new(Quit) as Box<dyn gpui::Action>),
            ]
            .into_iter()
            .map(|(key, action)| KeyBinding::load(key, action, None, false, None, cx))
            .collect::<std::result::Result<Vec<_>, _>>()
            .expect("valid native probe shortcuts");
            cx.bind_keys(bindings);
            cx.open_window(
                WindowOptions {
                    titlebar: Some(gpui::TitlebarOptions {
                        title: Some("GPUI redraw probe".into()),
                        ..Default::default()
                    }),
                    window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                        None,
                        size(px(700.), px(500.)),
                        cx,
                    ))),
                    ..Default::default()
                },
                |window, cx| {
                    let view = cx.new(|cx| {
                        let focus = cx.focus_handle();
                        focus.focus(window, cx);
                        Probe {
                            contracts,
                            focus,
                            count: 0,
                            captures: 0,
                            dark: true,
                            status: "No renderer image saved.".into(),
                            output,
                        }
                    });
                    cx.new(|cx| gpui_component::Root::new(view, window, cx))
                },
            )
            .expect("native probe window");
            cx.activate(true);
        });
    Ok(())
}
