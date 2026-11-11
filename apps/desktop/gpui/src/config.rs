use std::num::NonZeroUsize;
use std::time::Duration;

use agiworkforce_app_server::DeveloperSessionClientLimits;
use agiworkforce_protocol::developer_session::DeveloperSessionTrustMode;
use anyhow::Result;
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
pub struct Palette {
    pub background: u32,
    pub sidebar: u32,
    pub hover: u32,
    pub foreground: u32,
    pub secondary: u32,
    pub danger: u32,
    pub code: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeContracts {
    pub chat_name: String,
    pub frame: FrameGeometry,
    pub panel_radius: f32,
    pub stroke_width: f32,
    pub cloud_trust_label: String,
    pub conversation_title_max_length: usize,
    pub project_name_max_length: usize,
    pub project_description_max_length: usize,
    pub project_instructions_max_length: usize,
    pub draft_max_length: usize,
    pub draft_save_debounce_ms: u64,
    pub model_picker: ModelPickerGeometry,
    pub terminal_colors: TerminalColors,
    pub desktop_name: String,
    pub code_name: String,
    pub work_name: String,
    pub work_mode: String,
    pub light: Palette,
    pub dark: Palette,
    pub body_font_size: f32,
    pub body_line_height: f32,
    pub heading_font_sizes: [f32; 3],
    pub max_frame_bytes: NonZeroUsize,
    pub trust_labels: TrustLabels,
    pub guard_lifting_environment: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameGeometry {
    pub sidebar_width: f32,
    pub sidebar_collapsed_width: f32,
    pub sidebar_row_height: f32,
    pub sidebar_font_size: f32,
    pub sidebar_line_height: f32,
    pub content_width: f32,
    pub header_height: f32,
    pub composer_min_height: f32,
    pub viewport_gutter: f32,
    pub control_gap: f32,
    pub compact_breakpoint: f32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPickerGeometry {
    pub viewport_margin: f32,
    pub row_height: f32,
    pub row_padding_block: f32,
    pub menu_width: f32,
    pub menu_max_height: f32,
    pub label_font_size: f32,
    pub label_line_height: f32,
    pub guidance_font_size: f32,
    pub guidance_line_height: f32,
}
#[derive(Deserialize)]
pub struct TerminalColors {
    pub light: Vec<u32>,
    pub dark: Vec<u32>,
}

#[derive(Deserialize)]
pub struct TrustLabels {
    local: String,
    byok: String,
    managed: String,
    unknown: String,
}

impl TrustLabels {
    pub fn label(&self, mode: DeveloperSessionTrustMode) -> &str {
        match mode {
            DeveloperSessionTrustMode::Local => &self.local,
            DeveloperSessionTrustMode::Byok => &self.byok,
            DeveloperSessionTrustMode::Managed => &self.managed,
            DeveloperSessionTrustMode::Unknown => &self.unknown,
        }
    }
}

impl NativeContracts {
    pub fn load() -> Result<Self> {
        let contracts: Self =
            serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/contracts.json")))?;
        anyhow::ensure!(
            contracts.terminal_colors.light.len() == usize::from(u8::MAX) + 1
                && contracts.terminal_colors.dark.len() == usize::from(u8::MAX) + 1,
            "The terminal palette is incomplete"
        );
        anyhow::ensure!(
            contracts.project_name_max_length > 0
                && contracts.project_description_max_length > 0
                && contracts.project_instructions_max_length > 0,
            "The project contract has invalid limits"
        );
        let frame = &contracts.frame;
        anyhow::ensure!(
            contracts.draft_max_length > 0 && contracts.draft_save_debounce_ms > 0,
            "The draft contract has invalid limits"
        );
        anyhow::ensure!(
            [
                frame.sidebar_width,
                frame.sidebar_collapsed_width,
                frame.sidebar_row_height,
                frame.sidebar_font_size,
                frame.sidebar_line_height,
                frame.content_width,
                frame.header_height,
                frame.composer_min_height,
                frame.viewport_gutter,
                frame.control_gap,
                frame.compact_breakpoint,
                contracts.panel_radius,
                contracts.stroke_width,
            ]
            .iter()
            .all(|value| value.is_finite() && *value > 0.)
                && frame.sidebar_width > frame.sidebar_collapsed_width
                && frame.sidebar_row_height
                    >= frame.sidebar_line_height + 2. * contracts.stroke_width
                && frame.compact_breakpoint > frame.sidebar_width,
            "The native frame contract has invalid geometry"
        );
        Ok(contracts)
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub request_timeout_ms: u64,
    pub shutdown_timeout_ms: u64,
    pub max_queued_notifications: NonZeroUsize,
    pub max_pending_requests: NonZeroUsize,
    pub session_page_size: u32,
    pub cloud_poll_interval_ms: u64,
    pub terminal_poll_interval_ms: u64,
    pub editor_recovery_debounce_ms: u64,
    pub window_width: f32,
    pub window_height: f32,
}

impl Settings {
    pub fn load() -> Result<Self> {
        let settings: Self = serde_json::from_str(include_str!("../settings.json"))?;
        anyhow::ensure!(
            settings.request_timeout_ms > 0 && settings.shutdown_timeout_ms > 0,
            "runtime deadlines must be positive"
        );
        anyhow::ensure!(
            settings.session_page_size > 0
                && settings.cloud_poll_interval_ms > 0
                && settings.terminal_poll_interval_ms > 0,
            "session page size must be positive"
        );
        anyhow::ensure!(
            settings.editor_recovery_debounce_ms > 0,
            "editor recovery debounce must be positive"
        );
        Ok(settings)
    }

    pub fn client_limits(&self, contracts: &NativeContracts) -> DeveloperSessionClientLimits {
        DeveloperSessionClientLimits {
            max_frame_bytes: contracts.max_frame_bytes,
            max_queued_notifications: self.max_queued_notifications,
            request_timeout: Duration::from_millis(self.request_timeout_ms),
        }
    }
}
