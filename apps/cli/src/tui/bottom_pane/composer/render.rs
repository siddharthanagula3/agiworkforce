use crate::bottom_pane::chat_composer::ActivePopup;
use crate::bottom_pane::chat_composer::ChatComposer;
use crate::bottom_pane::footer::CollaborationModeIndicator;
use crate::bottom_pane::footer::FooterMode;
use crate::bottom_pane::footer::SummaryLeft;
use crate::bottom_pane::footer::can_show_left_with_context;
use crate::bottom_pane::footer::context_window_line;
use crate::bottom_pane::footer::footer_height;
use crate::bottom_pane::footer::footer_hint_items_width;
use crate::bottom_pane::footer::footer_line_width;
use crate::bottom_pane::footer::inset_footer_hint_area;
use crate::bottom_pane::footer::max_left_width_for_right;
use crate::bottom_pane::footer::mode_indicator_line;
use crate::bottom_pane::footer::passive_footer_status_line;
use crate::bottom_pane::footer::render_context_right;
use crate::bottom_pane::footer::render_footer_from_props;
use crate::bottom_pane::footer::render_footer_hint_items;
use crate::bottom_pane::footer::render_footer_line;
use crate::bottom_pane::footer::single_line_footer_layout;
use crate::bottom_pane::footer::uses_passive_footer_status_layout;
use crate::line_truncation::truncate_line_with_ellipsis_if_overflow;
use crate::render::Insets;
use crate::render::RectExt;
use crate::style::user_message_style;
use crate::ui_consts::FOOTER_INDENT_COLS;
use crate::ui_consts::LIVE_PREFIX_COLS;
use agiworkforce_protocol::models::local_image_label_text;
use ratatui::buffer::Buffer;
use ratatui::layout::Constraint;
use ratatui::layout::Layout;
use ratatui::layout::Margin;
use ratatui::layout::Rect;
use ratatui::style::Stylize;
use ratatui::text::Line;
use ratatui::text::Span;
use ratatui::widgets::Block;
use ratatui::widgets::Paragraph;
use ratatui::widgets::StatefulWidgetRef;
use ratatui::widgets::WidgetRef;

impl ChatComposer {
    pub(crate) fn layout_areas(&self, area: Rect) -> [Rect; 4] {
        let footer_props = self.footer_props();
        let footer_hint_height = self
            .custom_footer_height()
            .unwrap_or_else(|| footer_height(&footer_props));
        let footer_spacing = Self::footer_spacing(footer_hint_height);
        let footer_total_height = footer_hint_height + footer_spacing;
        let popup_constraint = match &self.active_popup {
            ActivePopup::Command(popup) => {
                Constraint::Max(popup.calculate_required_height(area.width))
            }
            ActivePopup::File(popup) => Constraint::Max(popup.calculate_required_height()),
            ActivePopup::Skill(popup) => {
                Constraint::Max(popup.calculate_required_height(area.width))
            }
            ActivePopup::None => Constraint::Max(footer_total_height),
        };
        let [composer_rect, popup_rect] =
            Layout::vertical([Constraint::Min(3), popup_constraint]).areas(area);
        let mut textarea_rect = composer_rect.inset(Insets::tlbr(
            /*top*/ 1,
            LIVE_PREFIX_COLS,
            /*bottom*/ 1,
            /*right*/ 1,
        ));
        let remote_images_height = self
            .remote_images_lines(textarea_rect.width)
            .len()
            .try_into()
            .unwrap_or(u16::MAX)
            .min(textarea_rect.height.saturating_sub(1));
        let remote_images_separator = u16::from(remote_images_height > 0);
        let consumed = remote_images_height.saturating_add(remote_images_separator);
        let remote_images_rect = Rect {
            x: textarea_rect.x,
            y: textarea_rect.y,
            width: textarea_rect.width,
            height: remote_images_height,
        };
        textarea_rect.y = textarea_rect.y.saturating_add(consumed);
        textarea_rect.height = textarea_rect.height.saturating_sub(consumed);
        [composer_rect, remote_images_rect, textarea_rect, popup_rect]
    }

    pub(crate) fn remote_images_lines(&self, _width: u16) -> Vec<Line<'static>> {
        self.remote_image_urls
            .iter()
            .enumerate()
            .map(|(idx, _)| {
                let label = local_image_label_text(idx + 1);
                if self.selected_remote_image_index == Some(idx) {
                    label.cyan().reversed().into()
                } else {
                    label.cyan().into()
                }
            })
            .collect()
    }

    pub(crate) fn render_with_mask(&self, area: Rect, buf: &mut Buffer, mask_char: Option<char>) {
        let [composer_rect, remote_images_rect, textarea_rect, popup_rect] =
            self.layout_areas(area);
        match &self.active_popup {
            ActivePopup::Command(popup) => {
                popup.render_ref(popup_rect, buf);
            }
            ActivePopup::File(popup) => {
                popup.render_ref(popup_rect, buf);
            }
            ActivePopup::Skill(popup) => {
                popup.render_ref(popup_rect, buf);
            }
            ActivePopup::None => {
                let footer_props = self.footer_props();
                let show_cycle_hint =
                    !footer_props.is_task_running && self.collaboration_mode_indicator.is_some();
                let show_shortcuts_hint = match footer_props.mode {
                    FooterMode::ComposerEmpty => !self.is_in_paste_burst(),
                    FooterMode::ComposerHasDraft => false,
                    FooterMode::QuitShortcutReminder
                    | FooterMode::ShortcutOverlay
                    | FooterMode::EscHint => false,
                };
                let show_queue_hint = match footer_props.mode {
                    FooterMode::ComposerHasDraft => footer_props.is_task_running,
                    FooterMode::QuitShortcutReminder
                    | FooterMode::ComposerEmpty
                    | FooterMode::ShortcutOverlay
                    | FooterMode::EscHint => false,
                };
                let custom_height = self.custom_footer_height();
                let footer_hint_height =
                    custom_height.unwrap_or_else(|| footer_height(&footer_props));
                let footer_spacing = Self::footer_spacing(footer_hint_height);
                let hint_rect = if footer_spacing > 0 && footer_hint_height > 0 {
                    let [_, hint_rect] = Layout::vertical([
                        Constraint::Length(footer_spacing),
                        Constraint::Length(footer_hint_height),
                    ])
                    .areas(popup_rect);
                    hint_rect
                } else {
                    popup_rect
                };
                let available_width =
                    hint_rect.width.saturating_sub(FOOTER_INDENT_COLS as u16) as usize;
                let status_line_active = uses_passive_footer_status_layout(&footer_props);
                let combined_status_line = if status_line_active {
                    passive_footer_status_line(&footer_props).map(ratatui::prelude::Stylize::dim)
                } else {
                    None
                };
                let mut truncated_status_line = if status_line_active {
                    combined_status_line.as_ref().map(|line| {
                        truncate_line_with_ellipsis_if_overflow(line.clone(), available_width)
                    })
                } else {
                    None
                };
                let left_mode_indicator = if status_line_active {
                    None
                } else {
                    self.collaboration_mode_indicator
                };
                let mut left_width = if self.footer_flash_visible() {
                    self.footer_flash
                        .as_ref()
                        .map(|flash| flash.line.width() as u16)
                        .unwrap_or(0)
                } else if let Some(items) = self.footer_hint_override.as_ref() {
                    footer_hint_items_width(items)
                } else if status_line_active {
                    truncated_status_line
                        .as_ref()
                        .map(|line| line.width() as u16)
                        .unwrap_or(0)
                } else {
                    footer_line_width(
                        &footer_props,
                        left_mode_indicator,
                        show_cycle_hint,
                        show_shortcuts_hint,
                        show_queue_hint,
                    )
                };
                let right_line = if status_line_active {
                    let full =
                        mode_indicator_line(self.collaboration_mode_indicator, show_cycle_hint);
                    let compact = mode_indicator_line(
                        self.collaboration_mode_indicator,
                        /*show_cycle_hint*/ false,
                    );
                    let full_width = full.as_ref().map(|l| l.width() as u16).unwrap_or(0);
                    if can_show_left_with_context(hint_rect, left_width, full_width) {
                        full
                    } else {
                        compact
                    }
                } else {
                    Some(context_window_line(
                        footer_props.context_window_percent,
                        footer_props.context_window_used_tokens,
                    ))
                };
                let right_width = right_line.as_ref().map(|l| l.width() as u16).unwrap_or(0);
                if status_line_active
                    && let Some(max_left) = max_left_width_for_right(hint_rect, right_width)
                    && left_width > max_left
                    && let Some(line) = combined_status_line.as_ref().map(|line| {
                        truncate_line_with_ellipsis_if_overflow(line.clone(), max_left as usize)
                    })
                {
                    left_width = line.width() as u16;
                    truncated_status_line = Some(line);
                }
                let can_show_left_and_context =
                    can_show_left_with_context(hint_rect, left_width, right_width);
                let has_override =
                    self.footer_flash_visible() || self.footer_hint_override.is_some();
                let single_line_layout = if has_override || status_line_active {
                    None
                } else {
                    match footer_props.mode {
                        FooterMode::ComposerEmpty | FooterMode::ComposerHasDraft => {
                            Some(single_line_footer_layout(
                                hint_rect,
                                right_width,
                                left_mode_indicator,
                                show_cycle_hint,
                                show_shortcuts_hint,
                                show_queue_hint,
                            ))
                        }
                        FooterMode::EscHint
                        | FooterMode::QuitShortcutReminder
                        | FooterMode::ShortcutOverlay => None,
                    }
                };
                let show_right = if matches!(
                    footer_props.mode,
                    FooterMode::EscHint
                        | FooterMode::QuitShortcutReminder
                        | FooterMode::ShortcutOverlay
                ) {
                    false
                } else {
                    single_line_layout
                        .as_ref()
                        .map(|(_, show_context)| *show_context)
                        .unwrap_or(can_show_left_and_context)
                };

                if let Some((summary_left, _)) = single_line_layout {
                    match summary_left {
                        SummaryLeft::Default => {
                            if status_line_active {
                                if let Some(line) = truncated_status_line.clone() {
                                    render_footer_line(hint_rect, buf, line);
                                } else {
                                    render_footer_from_props(
                                        hint_rect,
                                        buf,
                                        &footer_props,
                                        left_mode_indicator,
                                        show_cycle_hint,
                                        show_shortcuts_hint,
                                        show_queue_hint,
                                    );
                                }
                            } else {
                                render_footer_from_props(
                                    hint_rect,
                                    buf,
                                    &footer_props,
                                    left_mode_indicator,
                                    show_cycle_hint,
                                    show_shortcuts_hint,
                                    show_queue_hint,
                                );
                            }
                        }
                        SummaryLeft::Custom(line) => {
                            render_footer_line(hint_rect, buf, line);
                        }
                        SummaryLeft::None => {}
                    }
                } else if self.footer_flash_visible() {
                    if let Some(flash) = self.footer_flash.as_ref() {
                        flash.line.render(inset_footer_hint_area(hint_rect), buf);
                    }
                } else if let Some(items) = self.footer_hint_override.as_ref() {
                    render_footer_hint_items(hint_rect, buf, items);
                } else if status_line_active {
                    if let Some(line) = truncated_status_line {
                        render_footer_line(hint_rect, buf, line);
                    }
                } else {
                    render_footer_from_props(
                        hint_rect,
                        buf,
                        &footer_props,
                        self.collaboration_mode_indicator,
                        show_cycle_hint,
                        show_shortcuts_hint,
                        show_queue_hint,
                    );
                }

                if show_right && let Some(line) = &right_line {
                    render_context_right(hint_rect, buf, line);
                }
            }
        }
        let style = user_message_style();
        Block::default().style(style).render_ref(composer_rect, buf);
        if !remote_images_rect.is_empty() {
            Paragraph::new(self.remote_images_lines(remote_images_rect.width))
                .style(style)
                .render_ref(remote_images_rect, buf);
        }
        if !textarea_rect.is_empty() {
            let prompt = if self.input_enabled {
                "›".bold()
            } else {
                "›".dim()
            };
            buf.set_span(
                textarea_rect.x - LIVE_PREFIX_COLS,
                textarea_rect.y,
                &prompt,
                textarea_rect.width,
            );
        }

        let mut state = self.textarea_state.borrow_mut();
        if let Some(mask_char) = mask_char {
            self.textarea
                .render_ref_masked(textarea_rect, buf, &mut state, mask_char);
        } else {
            StatefulWidgetRef::render_ref(&(&self.textarea), textarea_rect, buf, &mut state);
        }
        if self.textarea.text().is_empty() {
            let text = if self.input_enabled {
                self.placeholder_text.as_str().to_string()
            } else {
                self.input_disabled_placeholder
                    .as_deref()
                    .unwrap_or("Input disabled.")
                    .to_string()
            };
            if !textarea_rect.is_empty() {
                let placeholder = Span::from(text).dim();
                Line::from(vec![placeholder])
                    .render_ref(textarea_rect.inner(Margin::new(0, 0)), buf);
            }
        }
    }
}
