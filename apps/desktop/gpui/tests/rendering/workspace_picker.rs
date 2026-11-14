use std::sync::{Arc, Mutex};
use std::time::Duration;

use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    workspace_select,
};
use agiworkforce_protocol::account_cloud::{CloudConversationWorkspace, CloudWorkspaceSummary};
use anyhow::{ensure, Context as _, Result};
use gpui::{
    div, prelude::*, px, rgb, size, App, Context, Entity, Focusable, HeadlessAppContext, Window,
};
use gpui_component::select::SelectEvent;

use super::model_picker::{click, draw, input, key};

struct Fixture {
    control: Entity<workspace_select::WorkspaceSelectState>,
    contracts: Arc<NativeContracts>,
    palette: Palette,
    disabled: bool,
}

impl Render for Fixture {
    fn render(&mut self, window: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .p_4()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .child(workspace_select::control(
                &self.control,
                &self.contracts,
                window.bounds().size.width.into(),
                self.disabled,
            ))
    }
}

fn choices() -> Vec<CloudWorkspaceSummary> {
    let mut choices = vec![CloudWorkspaceSummary {
        id: "fixture-personal".into(),
        name: "Personal".into(),
        slug: "personal".into(),
        selector: CloudConversationWorkspace::Personal,
        role: None,
    }];
    for slug in ["team-a", "team-b"] {
        choices.push(CloudWorkspaceSummary {
            id: slug.into(),
            name: "Same team 東京 🦀 with a long display name".into(),
            slug: slug.into(),
            selector: CloudConversationWorkspace::Organization {
                id: uuid::Uuid::new_v4().to_string(),
            },
            role: Some("member".into()),
        });
    }
    choices
}

fn selected(cx: &mut HeadlessAppContext, fixture: &Entity<Fixture>) -> Option<String> {
    cx.update(|app| {
        fixture
            .read(app)
            .control
            .read(app)
            .selected_value()
            .cloned()
    })
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
                        workspace_select::state(
                            &choices(),
                            Some("fixture-personal"),
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
                    }
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("workspace picker fixture missing")?;
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
        key(cx, window, "enter")?;
        cx.advance_clock(Duration::from_millis(200));
        draw(cx, window)?;
        let opened = cx.capture_screenshot(window)?;
        opened.save(format!("/tmp/agi-gpui-workspace-picker-{name}-{width}.png"))?;
        ensure!(
            opened.as_raw() != closed.as_raw(),
            "The workspace menu did not open"
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
            "The workspace row height differs from the shared geometry"
        );
        let first_row = (end - longest) as f32 / scale;
        draw(cx, window)?;
        ensure!(
            opened.as_raw() == cx.capture_screenshot(window)?.as_raw(),
            "The workspace menu changed on an unchanged repaint"
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
                    "Workspace text reaches the viewport edge"
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
            selected(cx, &fixture).as_deref() == Some("team-a"),
            "Pointer selection lost the workspace identity"
        );
        key(cx, window, "enter")?;
        input(cx, window, "TEAM-B")?;
        ensure!(
            selected(cx, &fixture).as_deref() == Some("team-a"),
            "Search changed the committed workspace"
        );
        let filtered = cx.capture_screenshot(window)?;
        filtered.save(format!("/tmp/agi-gpui-workspace-search-{name}-{width}.png"))?;
        key(cx, window, "enter")?;
        ensure!(
            selected(cx, &fixture).as_deref() == Some("team-b"),
            "Slug search did not distinguish same-named workspaces"
        );
        ensure!(
            *events.lock().unwrap() == vec!["team-a".to_string(), "team-b".to_string()],
            "Workspace confirmation events differ from the selected identities"
        );
        key(cx, window, "enter")?;
        input(cx, window, "no matching workspace")?;
        key(cx, window, "enter")?;
        ensure!(
            events.lock().unwrap().len() == 2,
            "An empty result committed a workspace"
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
                "Escape did not restore workspace focus"
            );
            fixture.update(app, |view, cx| {
                view.disabled = true;
                cx.notify();
            });
            Ok::<_, anyhow::Error>(())
        })??;
        draw(cx, window)?;
        let disabled = cx.capture_screenshot(window)?;
        key(cx, window, "enter")?;
        click(cx, window, menu_width * 0.5, 32.)?;
        ensure!(
            disabled.as_raw() == cx.capture_screenshot(window)?.as_raw(),
            "Disabled workspace control opened"
        );
        ensure!(
            events.lock().unwrap().len() == 2,
            "Disabled workspace control committed a selection"
        );
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{name} {width}px: workspace identities, slug search, rows, clipping, repaint, keyboard, pointer, dismissal and disabled control pass");
    }
    Ok(())
}
