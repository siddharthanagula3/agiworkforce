use anyhow::{ensure, Result};

pub fn browser_link(value: &str) -> Result<url::Url> {
    ensure!(
        !value.chars().any(char::is_control),
        "Links containing control characters cannot be opened."
    );
    let url = url::Url::parse(value)?;
    ensure!(
        matches!(url.scheme(), "https" | "http") && url.host_str().is_some(),
        "Only absolute web links can be opened from a conversation."
    );
    ensure!(
        url.username().is_empty() && url.password().is_none(),
        "Links containing credentials cannot be opened."
    );
    Ok(url)
}

#[cfg(feature = "native-ui")]
mod native {
    use std::sync::Arc;

    use gpui::{
        prelude::*, px, rgb, App, Context, ElementId, Entity, ImageCacheError, ImageSource,
        SharedString, Window,
    };
    use gpui_component::{
        clipboard::Clipboard,
        text::{
            markdown_ast::Node, MarkdownExtensions, MarkdownNode, MarkdownParseContext,
            MarkdownPlugin, SelectionFormat, TextView, TextViewState, TextViewStyle,
        },
        Theme, ThemeMode,
    };

    use crate::config::{NativeContracts, Palette};

    struct DocumentMedia;

    impl MarkdownPlugin for DocumentMedia {
        fn name(&self) -> &str {
            "conversation-media-as-text"
        }

        fn parse(&self, node: &Node, cx: &MarkdownParseContext<'_>) -> Option<MarkdownNode> {
            let text = match node {
                Node::Image(image) => format!("Image: {} (not loaded)", image.alt),
                Node::ImageReference(image) => format!("Image: {} (not loaded)", image.alt),
                Node::Html(html) => html.value.clone(),
                _ => return None,
            };
            Some(
                MarkdownNode::new(self.name(), ())
                    .text(text)
                    .markdown(cx.node_source(node).unwrap_or_default().to_owned()),
            )
        }
    }

    struct DocumentHtml;

    impl MarkdownPlugin for DocumentHtml {
        fn is_block(&self) -> bool {
            true
        }
        fn name(&self) -> &str {
            "conversation-html-as-text"
        }
        fn parse(&self, node: &Node, _: &MarkdownParseContext<'_>) -> Option<MarkdownNode> {
            let Node::Html(html) = node else {
                return None;
            };
            Some(
                MarkdownNode::new(self.name(), ())
                    .text(html.value.clone())
                    .markdown(html.value.clone()),
            )
        }
    }

    pub fn document_extensions() -> MarkdownExtensions {
        MarkdownExtensions::default()
            .plugin(DocumentMedia)
            .plugin(DocumentHtml)
    }

    pub fn syntax_notices() -> String {
        let acknowledgements = two_face::acknowledgement::listing();
        let mut text = String::from("\nEmbedded syntax definition notices\n\n");
        for license in acknowledgements.for_syntaxes() {
            text.push_str(&format!(
                "{}\n\n{}\n\n",
                license.rel_path.display(),
                license.text
            ));
        }
        text
    }

    pub fn sync_theme(contracts: &NativeContracts, palette: Palette, dark: bool, cx: &mut App) {
        let mode = if dark {
            ThemeMode::Dark
        } else {
            ThemeMode::Light
        };
        if Theme::global(cx).mode != mode {
            Theme::change(mode, None, cx);
        }
        if Theme::global(cx).colors.foreground == rgb(palette.foreground).into()
            && Theme::global(cx).colors.background == rgb(palette.background).into()
            && Theme::global(cx).colors.muted == rgb(palette.code).into()
            && Theme::global(cx).colors.popover == rgb(palette.background).into()
            && Theme::global(cx).colors.popover_foreground == rgb(palette.foreground).into()
            && Theme::global(cx).tokens.accent.color == rgb(palette.hover).into()
            && Theme::global(cx).tokens.popover.color == rgb(palette.background).into()
            && Theme::global(cx).font_size == px(contracts.body_font_size)
        {
            return;
        }
        let theme = Theme::global_mut(cx);
        theme.colors.background = rgb(palette.background).into();
        theme.colors.popover = rgb(palette.background).into();
        theme.colors.popover_foreground = rgb(palette.foreground).into();
        theme.colors.foreground = rgb(palette.foreground).into();
        theme.colors.muted_foreground = rgb(palette.secondary).into();
        theme.colors.input = rgb(palette.background).into();
        theme.colors.border = rgb(palette.secondary).into();
        theme.colors.ring = rgb(palette.foreground).into();
        theme.colors.muted = rgb(palette.code).into();
        theme.colors.accent = rgb(palette.hover).into();
        theme.colors.accent_foreground = rgb(palette.foreground).into();
        theme.colors.link = rgb(palette.foreground).into();
        theme.colors.table_head = rgb(palette.sidebar).into();
        theme.colors.table_head_foreground = rgb(palette.foreground).into();
        theme.font_size = px(contracts.body_font_size);
        let tokens = theme.semantic_tokens();
        theme.apply_semantic_tokens(&tokens);
        Theme::sync_base(cx);
    }

    pub struct DocumentView {
        state: Entity<TextViewState>,
        contracts: Arc<NativeContracts>,
        _subscription: gpui::Subscription,
    }

    impl DocumentView {
        fn new(
            state: Entity<TextViewState>,
            contracts: Arc<NativeContracts>,
            cx: &mut Context<Self>,
        ) -> Self {
            let subscription = cx.observe(&state, |_, _, cx| cx.notify());
            Self {
                state,
                contracts,
                _subscription: subscription,
            }
        }
    }

    impl Render for DocumentView {
        fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            let text = if window.is_a11y_active() {
                self.state.read(cx).rendered_text().as_str().to_owned()
            } else {
                String::new()
            };
            gpui::div()
                .id("document")
                .role(gpui::Role::Document)
                .aria_label(text)
                .w_full()
                .min_w_0()
                .child(document_view(TextView::new(&self.state), &self.contracts))
        }
    }

    pub fn managed_document(
        state: &Entity<TextViewState>,
        contracts: &Arc<NativeContracts>,
        window: &mut Window,
        cx: &mut App,
    ) -> Entity<DocumentView> {
        let state = state.clone();
        let contracts = contracts.clone();
        window.use_keyed_state(
            SharedString::from(format!("native-document:{}", state.entity_id())),
            cx,
            move |_, cx| DocumentView::new(state, contracts, cx),
        )
    }

    pub fn markdown(
        id: impl Into<ElementId>,
        text: impl Into<gpui::SharedString>,
        contracts: &Arc<NativeContracts>,
        window: &mut Window,
        cx: &mut App,
    ) -> Entity<DocumentView> {
        let id = id.into();
        let text = text.into();
        let initial = text.clone();
        let contracts = contracts.clone();
        let document = window.use_keyed_state(
            SharedString::from(format!("native-markdown:{id}")),
            cx,
            move |_, cx| {
                let state = cx.new(|cx| TextViewState::markdown(initial.as_str(), cx));
                DocumentView::new(state, contracts, cx)
            },
        );
        document.update(cx, |view, cx| {
            view.state
                .update(cx, |state, cx| state.set_text(text.as_str(), cx))
        });
        document
    }

    fn document_view(view: TextView, contracts: &NativeContracts) -> TextView {
        let headings = contracts.heading_font_sizes;
        let mut table = gpui::StyleRefinement::default();
        table.overflow.x = Some(gpui::Overflow::Scroll);
        view.markdown_extensions(document_extensions())
            .selectable(true)
            .selection_format(SelectionFormat::Source)
            .scrollable(false)
            .stream_fade(false)
            .style(
                TextViewStyle::default()
                    .heading_font_size(move |level, _| {
                        px(headings[usize::from(level.saturating_sub(1)).min(headings.len() - 1)])
                    })
                    .code_block(gpui::StyleRefinement::default().pt_10())
                    .table(table),
            )
            // All document images, including future parser extensions, stay outside host I/O.
            .image_source(|_| {
                ImageSource::Custom(Arc::new(|_, _| {
                    Some(Err(ImageCacheError::Asset(
                        "Conversation images require an admitted attachment source".into(),
                    )))
                }))
            })
            .on_link_click(|target, event, window, cx| {
                if event.is_right_click() {
                    return;
                }
                match super::browser_link(target) {
                    Ok(url) => cx.open_url(url.as_str()),
                    Err(error) => {
                        let message = error.to_string();
                        let prompt = window.prompt(
                            gpui::PromptLevel::Info,
                            "This link cannot be opened",
                            Some(&message),
                            &["Close"],
                            cx,
                        );
                        cx.spawn(async move |_| {
                            let _ = prompt.await;
                        })
                        .detach();
                    }
                }
            })
            .code_block_actions(|block, _, _| {
                gpui::div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .children(block.lang())
                    .child(
                        Clipboard::new("copy-code")
                            .value(block.code())
                            .accessibility_label("Copy code")
                            .tooltip("Copy code"),
                    )
            })
            .w_full()
            .min_w_0()
    }
}

#[cfg(feature = "native-ui")]
pub use native::{managed_document, markdown, sync_theme, syntax_notices, DocumentView};
