use super::color::perceptual_distance;
use ratatui::style::Color;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::AtomicU8;
use std::sync::atomic::Ordering;

// ─────────────────────────────────────────────────────────────────────────────
// v3 brand palette, mirrors packages/ui/design-tokens/src/tokens.ts
// ─────────────────────────────────────────────────────────────────────────────

/// AGI v3 teal accent (#21808d)
pub const V3_TEAL: (u8, u8, u8) = (0x21, 0x80, 0x8d);
/// AGI v3 terracotta accent (#da7756)
pub const V3_TERRACOTTA: (u8, u8, u8) = (0xda, 0x77, 0x56);
/// AGI v3 warm-cream light surface (#fcfaf6)
pub const V3_WARM_CREAM: (u8, u8, u8) = (0xfc, 0xfa, 0xf6);
/// AGI v3 warm-black dark surface (#0f0f0e)
pub const V3_WARM_BLACK: (u8, u8, u8) = (0x0f, 0x0f, 0x0e);
/// AGI v3 ink text (#1a1a1a)
pub const V3_INK: (u8, u8, u8) = (0x1a, 0x1a, 0x1a);
/// AGI v3 bone surface (#f5f5f0)
pub const V3_BONE: (u8, u8, u8) = (0xf5, 0xf5, 0xf0);
/// AGI v3 success green (#16a34a)
pub const V3_SUCCESS: (u8, u8, u8) = (0x16, 0xa3, 0x4a);
/// AGI v3 warning amber (#d97706)
pub const V3_WARNING: (u8, u8, u8) = (0xd9, 0x77, 0x06);
/// AGI v3 danger red (#dc2626)
pub const V3_DANGER: (u8, u8, u8) = (0xdc, 0x26, 0x26);

/// Return the v3 teal accent as the best ratatui `Color` the terminal can render.
pub fn v3_teal() -> Color {
    best_color(V3_TEAL)
}

/// Return the v3 terracotta accent as the best ratatui `Color` the terminal can render.
pub fn v3_terracotta() -> Color {
    best_color(V3_TERRACOTTA)
}

/// Return the v3 success green as the best ratatui `Color` the terminal can render.
pub fn v3_success() -> Color {
    best_color(V3_SUCCESS)
}

/// Return the v3 warning amber as the best ratatui `Color` the terminal can render.
pub fn v3_warning() -> Color {
    best_color(V3_WARNING)
}

/// Return the v3 danger red as the best ratatui `Color` the terminal can render.
pub fn v3_danger() -> Color {
    best_color(V3_DANGER)
}

/// Return a muted mid-grey for secondary/hint text (≈ CSS `text-muted`).
pub fn v3_muted() -> Color {
    best_color((128, 128, 128))
}

/// Return a dark charcoal background for the status bar row.
pub fn v3_status_bar_bg() -> Color {
    best_color((48, 48, 48))
}

/// Return white-on-dark contrast colour for mode badge with dark background.
pub fn v3_on_dark() -> Color {
    best_color((255, 255, 255))
}

/// Return black-on-light contrast colour for mode badge with light background.
pub fn v3_on_light() -> Color {
    best_color((15, 15, 14))
}

// ─────────────────────────────────────────────────────────────────────────────
// Active-theme semantic palette
//
// Every `ui_*` token resolves through the *active* theme palette rather than a
// fixed brand color, so `/theme` actually recolors the whole TUI (138 `ui_*`
// call sites follow automatically). `set_active_theme` is called when the user
// confirms a theme in the picker or runs `/theme <name>`.
// ─────────────────────────────────────────────────────────────────────────────

/// RGB values for each semantic token under one theme. Resolved to the best
/// `Color` the terminal supports at call time via `best_color`.
#[derive(Clone, Copy)]
struct Palette {
    accent: (u8, u8, u8),
    muted: (u8, u8, u8),
    success: (u8, u8, u8),
    warning: (u8, u8, u8),
    danger: (u8, u8, u8),
    cloud: (u8, u8, u8),
    brand: (u8, u8, u8),
    status_bar_bg: (u8, u8, u8),
    on_status_bar: (u8, u8, u8),
    on_fill: (u8, u8, u8),
    surface_elevated: (u8, u8, u8),
}

const PALETTE_DARK: Palette = Palette {
    accent: (0x26, 0x94, 0xa2),
    muted: (135, 135, 135),
    success: V3_SUCCESS,
    warning: V3_WARNING,
    danger: (0xe4, 0x57, 0x57),
    cloud: V3_TERRACOTTA,
    brand: (0x26, 0x94, 0xa2),
    status_bar_bg: (48, 48, 48),
    on_status_bar: (255, 255, 255),
    on_fill: (15, 15, 14),
    surface_elevated: (28, 28, 28),
};

/// Light terminals: darker accents/text so foreground reads on a bright bg.
const PALETTE_LIGHT: Palette = Palette {
    accent: (0x1a, 0x66, 0x70),
    muted: (90, 90, 90),
    success: (0x15, 0x80, 0x3d),
    warning: (0xb4, 0x53, 0x09),
    danger: (0xb9, 0x1c, 0x1c),
    cloud: (0xbe, 0x49, 0x2b),
    brand: (0x1a, 0x66, 0x70),
    status_bar_bg: (222, 222, 216),
    on_status_bar: (15, 15, 14),
    on_fill: (255, 255, 255),
    surface_elevated: (244, 244, 240),
};

/// Pure 16-color ANSI approximations for low-color terminals.
const PALETTE_ANSI: Palette = Palette {
    accent: (0, 170, 170),
    muted: (170, 170, 170),
    success: (0, 170, 0),
    warning: (255, 255, 85),
    danger: (255, 85, 85),
    cloud: (255, 85, 255),
    brand: (0, 170, 170),
    status_bar_bg: (48, 48, 48),
    on_status_bar: (255, 255, 255),
    on_fill: (0, 0, 0),
    surface_elevated: (28, 28, 28),
};

const PALETTE_HIGH_CONTRAST_DARK: Palette = Palette {
    accent: (47, 184, 202),
    muted: (168, 168, 168),
    success: (26, 193, 88),
    warning: (248, 142, 18),
    danger: (237, 142, 142),
    cloud: (226, 149, 123),
    brand: (47, 184, 202),
    status_bar_bg: (48, 48, 48),
    on_status_bar: (255, 255, 255),
    on_fill: (0, 0, 0),
    surface_elevated: (20, 20, 20),
};

const PALETTE_HIGH_CONTRAST_LIGHT: Palette = Palette {
    accent: (23, 91, 100),
    muted: (83, 83, 83),
    success: (16, 96, 46),
    warning: (135, 62, 7),
    danger: (165, 25, 25),
    cloud: (143, 55, 32),
    brand: (23, 91, 100),
    status_bar_bg: (214, 214, 214),
    on_status_bar: (0, 0, 0),
    on_fill: (255, 255, 255),
    surface_elevated: (240, 240, 240),
};

/// Deuteranopia-friendly: blue/orange/vermillion instead of green/red so the
/// success↔danger distinction survives red-green color blindness (Wong palette).
const PALETTE_COLORBLIND: Palette = Palette {
    accent: (0, 141, 220),
    muted: (135, 135, 135),
    success: (0, 158, 115),
    warning: (230, 159, 0),
    danger: (221, 98, 0),
    cloud: (86, 180, 233),
    brand: (0, 141, 220),
    status_bar_bg: (48, 48, 48),
    on_status_bar: (255, 255, 255),
    on_fill: (15, 15, 14),
    surface_elevated: (28, 28, 28),
};

/// Active theme index. Matches `ThemeChoice` declaration order
/// (Dark=0, Light=1, Ansi=2, HighContrastDark=3, HighContrastLight=4, Colorblind=5).
static ACTIVE_THEME: AtomicU8 = AtomicU8::new(0);

/// Apply a theme by index; subsequent `ui_*` calls resolve through it. Bumps the
/// palette version so cached renderers can invalidate. Out-of-range → Dark.
pub fn set_active_theme(idx: u8) {
    ACTIVE_THEME.store(idx, Ordering::Relaxed);
    bump_palette_version();
}

/// The active theme index (see `set_active_theme`).
pub fn active_theme_idx() -> u8 {
    ACTIVE_THEME.load(Ordering::Relaxed)
}

/// Resolve a theme index to its palette. Out-of-range → Dark.
fn palette_for(idx: u8) -> Palette {
    match idx {
        1 => PALETTE_LIGHT,
        2 => PALETTE_ANSI,
        3 => PALETTE_HIGH_CONTRAST_DARK,
        4 => PALETTE_HIGH_CONTRAST_LIGHT,
        5 => PALETTE_COLORBLIND,
        _ => PALETTE_DARK,
    }
}

fn active_palette() -> Palette {
    palette_for(ACTIVE_THEME.load(Ordering::Relaxed))
}

/// Primary interactive accent for selection, prompts, and active controls.
pub fn ui_accent() -> Color {
    best_color(active_palette().accent)
}

/// Secondary text, borders, dividers, and inactive hints.
pub fn ui_muted() -> Color {
    best_color(active_palette().muted)
}

/// Positive state color for completed work and safe/local indicators.
pub fn ui_success() -> Color {
    best_color(active_palette().success)
}

/// Caution state color for warnings, fallbacks, and bypass-style modes.
pub fn ui_warning() -> Color {
    best_color(active_palette().warning)
}

/// Critical state color for errors, failed work, or unsafe modes.
pub fn ui_danger() -> Color {
    best_color(active_palette().danger)
}

/// Hosted/cloud accent, kept separate from local/BYOK state colors.
pub fn ui_cloud() -> Color {
    best_color(active_palette().cloud)
}

/// AGI brand foreground for product marks in terminal UI.
pub fn ui_brand() -> Color {
    best_color(active_palette().brand)
}

/// Status bar background.
pub fn ui_status_bar_bg() -> Color {
    best_color(active_palette().status_bar_bg)
}

/// Foreground for the status bar and the default mode badge drawn on it.
pub fn ui_on_dark() -> Color {
    best_color(active_palette().on_status_bar)
}

/// Foreground for text drawn on an accent or status fill.
pub fn ui_on_light() -> Color {
    best_color(active_palette().on_fill)
}

/// Fill behind popups, pickers and dialogs, one step above the terminal ground.
pub fn ui_surface_elevated() -> Color {
    best_color(active_palette().surface_elevated)
}

pub fn ui_agent(color: &str) -> Option<Color> {
    let light_ground = matches!(ACTIVE_THEME.load(Ordering::Relaxed), 1 | 4);
    let rgb = match (color, light_ground) {
        ("red", false) => (255, 110, 110),
        ("red", true) => (185, 28, 45),
        ("blue", false) => (120, 170, 255),
        ("blue", true) => (30, 90, 200),
        ("green", false) => (100, 215, 130),
        ("green", true) => (20, 120, 60),
        ("yellow", false) => (240, 205, 90),
        ("yellow", true) => (130, 95, 0),
        ("purple", false) => (190, 145, 255),
        ("purple", true) => (115, 55, 190),
        ("orange", false) => (255, 165, 95),
        ("orange", true) => (170, 80, 0),
        ("pink", false) => (255, 135, 195),
        ("pink", true) => (175, 35, 115),
        ("cyan", false) => (95, 210, 230),
        ("cyan", true) => (0, 115, 135),
        _ => return None,
    };
    Some(best_color(rgb))
}

/// Badge background for the default chat mode.
pub fn ui_mode_default() -> Color {
    ui_status_bar_bg()
}

/// Badge background for plan/read-only mode.
pub fn ui_mode_plan() -> Color {
    ui_accent()
}

/// Badge background for auto-accepted edit mode.
pub fn ui_mode_accept_edits() -> Color {
    ui_success()
}

/// Badge background for bypass mode.
pub fn ui_mode_bypass() -> Color {
    ui_warning()
}

/// Badge background for full-auto mode.
pub fn ui_mode_full_auto() -> Color {
    ui_danger()
}

#[derive(Clone, Copy)]
pub struct SyntaxPalette {
    pub keyword: (u8, u8, u8),
    pub string: (u8, u8, u8),
    pub constant: (u8, u8, u8),
    pub comment: (u8, u8, u8),
    pub function: (u8, u8, u8),
    pub invalid: (u8, u8, u8),
}

pub fn syntax_palette() -> SyntaxPalette {
    let palette = active_palette();
    SyntaxPalette {
        keyword: palette.accent,
        string: palette.success,
        constant: palette.warning,
        comment: palette.muted,
        function: palette.cloud,
        invalid: palette.danger,
    }
}

static DEFAULT_PALETTE_VERSION: AtomicU64 = AtomicU64::new(0);

fn bump_palette_version() {
    DEFAULT_PALETTE_VERSION.fetch_add(1, Ordering::Relaxed);
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StdoutColorLevel {
    TrueColor,
    Ansi256,
    Ansi16,
    Unknown,
}

pub fn stdout_color_level() -> StdoutColorLevel {
    match supports_color::on_cached(supports_color::Stream::Stdout) {
        Some(level) if level.has_16m => StdoutColorLevel::TrueColor,
        Some(level) if level.has_256 => StdoutColorLevel::Ansi256,
        Some(_) => StdoutColorLevel::Ansi16,
        None => StdoutColorLevel::Unknown,
    }
}

#[allow(clippy::disallowed_methods)]
pub fn rgb_color((r, g, b): (u8, u8, u8)) -> Color {
    Color::Rgb(r, g, b)
}

#[allow(clippy::disallowed_methods)]
pub fn indexed_color(index: u8) -> Color {
    Color::Indexed(index)
}

/// Returns the closest color to the target color that the terminal can display.
pub fn best_color(target: (u8, u8, u8)) -> Color {
    let color_level = stdout_color_level();
    if color_level == StdoutColorLevel::TrueColor {
        rgb_color(target)
    } else if color_level == StdoutColorLevel::Ansi256 {
        if let Some((i, _)) = xterm_fixed_colors().min_by(|(_, a), (_, b)| {
            perceptual_distance(*a, target)
                .partial_cmp(&perceptual_distance(*b, target))
                .unwrap_or(std::cmp::Ordering::Equal)
        }) {
            indexed_color(i as u8)
        } else {
            Color::default()
        }
    } else {
        Color::default()
    }
}

pub fn requery_default_colors() {
    imp::requery_default_colors();
    bump_palette_version();
}

#[derive(Clone, Copy)]
pub struct DefaultColors {
    fg: (u8, u8, u8),
    bg: (u8, u8, u8),
}

pub fn default_colors() -> Option<DefaultColors> {
    imp::default_colors()
}

pub fn default_fg() -> Option<(u8, u8, u8)> {
    default_colors().map(|c| c.fg)
}

pub fn default_bg() -> Option<(u8, u8, u8)> {
    default_colors().map(|c| c.bg)
}

/// Representative RGB for an ANSI 16-color index (xterm palette). Used to turn a
/// `COLORFGBG` fg/bg index into concrete colors.
fn ansi16_to_rgb(idx: u8) -> (u8, u8, u8) {
    match idx {
        0 => (0, 0, 0),
        1 => (170, 0, 0),
        2 => (0, 170, 0),
        3 => (170, 85, 0),
        4 => (0, 0, 170),
        5 => (170, 0, 170),
        6 => (0, 170, 170),
        7 => (170, 170, 170),
        8 => (85, 85, 85),
        9 => (255, 85, 85),
        10 => (85, 255, 85),
        11 => (255, 255, 85),
        12 => (85, 85, 255),
        13 => (255, 85, 255),
        14 => (85, 255, 255),
        _ => (255, 255, 255), // 15 and out-of-range → white
    }
}

/// Parse a `COLORFGBG` value into default fg/bg colors. The variable (set by
/// rxvt/konsole/some tmux configs) is `"fg;bg"` or `"fg;default;bg"`; the last
/// field is the background index. Returns `None` when absent or malformed.
/// most modern terminals (iTerm2, Terminal.app) don't set it, so this is only
/// the fallback for a terminal that does not answer the OSC 10/11 query.
fn colorfgbg_to_default(raw: &str) -> Option<DefaultColors> {
    let parts: Vec<&str> = raw.split(';').collect();
    if parts.len() < 2 {
        return None;
    }
    let fg_idx: u8 = parts.first()?.trim().parse().ok()?;
    let bg_idx: u8 = parts.last()?.trim().parse().ok()?;
    Some(DefaultColors {
        fg: ansi16_to_rgb(fg_idx),
        bg: ansi16_to_rgb(bg_idx),
    })
}

/// True when the detected (or `COLORFGBG`-reported) terminal background is light.
/// Falls back to `false` (assume dark) when detection is unavailable.
pub fn terminal_is_light() -> bool {
    default_bg()
        .map(|(r, g, b)| (r as u16 + g as u16 + b as u16) / 3 > 127)
        .unwrap_or(false)
}

/// Returns a monotonic counter that increments whenever `requery_default_colors()` runs
/// successfully so cached renderers can know when their styling assumptions (e.g.
/// background colors baked into cached transcript rows) are stale and need invalidation.
pub fn palette_version() -> u64 {
    DEFAULT_PALETTE_VERSION.load(Ordering::Relaxed)
}

#[cfg(all(unix, not(test)))]
mod imp {
    use super::DefaultColors;
    use std::io::{ErrorKind, IsTerminal, Read, Write};
    use std::os::unix::fs::OpenOptionsExt;
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    const QUERY: &[u8] = b"\x1b]10;?\x1b\\\x1b]11;?\x1b\\\x1b[c";
    const QUERY_TIMEOUT: Duration = Duration::from_millis(200);
    const READ_INTERVAL: Duration = Duration::from_millis(5);

    static QUERIED: Mutex<Option<DefaultColors>> = Mutex::new(None);

    pub(super) fn default_colors() -> Option<DefaultColors> {
        let queried = *QUERIED
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        queried.or_else(|| {
            std::env::var("COLORFGBG")
                .ok()
                .and_then(|raw| super::colorfgbg_to_default(&raw))
        })
    }

    pub(super) fn requery_default_colors() {
        if let Some(colors) = query_terminal_colors() {
            *QUERIED
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(colors);
        }
    }

    fn query_terminal_colors() -> Option<DefaultColors> {
        if !std::io::stdin().is_terminal() || !std::io::stdout().is_terminal() {
            return None;
        }
        if !crossterm::terminal::is_raw_mode_enabled().unwrap_or(false) {
            return None;
        }
        let mut tty = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .custom_flags(nix::libc::O_NONBLOCK)
            .open("/dev/tty")
            .ok()?;
        tty.write_all(QUERY).ok()?;
        tty.flush().ok()?;

        let deadline = Instant::now() + QUERY_TIMEOUT;
        let mut reply = Vec::new();
        let mut chunk = [0u8; 256];
        while Instant::now() < deadline && !device_attributes_answered(&reply) {
            match tty.read(&mut chunk) {
                Ok(0) => break,
                Ok(read) => reply.extend_from_slice(&chunk[..read]),
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    std::thread::sleep(READ_INTERVAL)
                }
                Err(error) if error.kind() == ErrorKind::Interrupted => {}
                Err(_) => break,
            }
        }

        let bg = osc_color(&reply, b"\x1b]11;")?;
        let fg = osc_color(&reply, b"\x1b]10;").unwrap_or(
            if (bg.0 as u16 + bg.1 as u16 + bg.2 as u16) / 3 > 127 {
                (0, 0, 0)
            } else {
                (255, 255, 255)
            },
        );
        Some(DefaultColors { fg, bg })
    }

    fn device_attributes_answered(reply: &[u8]) -> bool {
        reply
            .windows(3)
            .position(|window| window == b"\x1b[?")
            .is_some_and(|start| reply[start + 3..].contains(&b'c'))
    }

    fn osc_color(reply: &[u8], introducer: &[u8]) -> Option<(u8, u8, u8)> {
        let start = reply
            .windows(introducer.len())
            .position(|window| window == introducer)?
            + introducer.len();
        let body = &reply[start..];
        let end = body.iter().position(|&byte| byte == 0x07 || byte == 0x1b)?;
        let text = std::str::from_utf8(&body[..end]).ok()?;
        let channels = text
            .strip_prefix("rgb:")
            .or_else(|| text.strip_prefix("rgba:"))?;
        let mut parts = channels.split('/').map(scale_channel);
        Some((parts.next()??, parts.next()??, parts.next()??))
    }

    fn scale_channel(hex: &str) -> Option<u8> {
        if hex.is_empty() || hex.len() > 4 {
            return None;
        }
        let value = u32::from_str_radix(hex, 16).ok()?;
        let max = (1u32 << (4 * hex.len() as u32)) - 1;
        Some(((value * 255 + max / 2) / max) as u8)
    }
}

#[cfg(not(all(unix, not(test))))]
mod imp {
    use super::DefaultColors;

    pub(super) fn default_colors() -> Option<DefaultColors> {
        None
    }

    pub(super) fn requery_default_colors() {}
}

/// The subset of Xterm colors that are usually consistent across terminals.
fn xterm_fixed_colors() -> impl Iterator<Item = (usize, (u8, u8, u8))> {
    XTERM_COLORS.into_iter().enumerate().skip(16)
}

// Xterm colors; derived from https://ss64.com/bash/syntax-colors.html
pub const XTERM_COLORS: [(u8, u8, u8); 256] = [
    // The first 16 colors vary based on terminal theme, so these are likely not the actual colors
    // that are displayed when using these indices.
    (0, 0, 0),       //   0 Black (SYSTEM)
    (128, 0, 0),     //   1 Maroon (SYSTEM)
    (0, 128, 0),     //   2 Green (SYSTEM)
    (128, 128, 0),   //   3 Olive (SYSTEM)
    (0, 0, 128),     //   4 Navy (SYSTEM)
    (128, 0, 128),   //   5 Purple (SYSTEM)
    (0, 128, 128),   //   6 Teal (SYSTEM)
    (192, 192, 192), //   7 Silver (SYSTEM)
    (128, 128, 128), //   8 Grey (SYSTEM)
    (255, 0, 0),     //   9 Red (SYSTEM)
    (0, 255, 0),     //  10 Lime (SYSTEM)
    (255, 255, 0),   //  11 Yellow (SYSTEM)
    (0, 0, 255),     //  12 Blue (SYSTEM)
    (255, 0, 255),   //  13 Fuchsia (SYSTEM)
    (0, 255, 255),   //  14 Aqua (SYSTEM)
    (255, 255, 255), //  15 White (SYSTEM)
    // The rest of the colors are consistent in most terminals.
    (0, 0, 0),       //  16 Grey0
    (0, 0, 95),      //  17 NavyBlue
    (0, 0, 135),     //  18 DarkBlue
    (0, 0, 175),     //  19 Blue3
    (0, 0, 215),     //  20 Blue3
    (0, 0, 255),     //  21 Blue1
    (0, 95, 0),      //  22 DarkGreen
    (0, 95, 95),     //  23 DeepSkyBlue4
    (0, 95, 135),    //  24 DeepSkyBlue4
    (0, 95, 175),    //  25 DeepSkyBlue4
    (0, 95, 215),    //  26 DodgerBlue3
    (0, 95, 255),    //  27 DodgerBlue2
    (0, 135, 0),     //  28 Green4
    (0, 135, 95),    //  29 SpringGreen4
    (0, 135, 135),   //  30 Turquoise4
    (0, 135, 175),   //  31 DeepSkyBlue3
    (0, 135, 215),   //  32 DeepSkyBlue3
    (0, 135, 255),   //  33 DodgerBlue1
    (0, 175, 0),     //  34 Green3
    (0, 175, 95),    //  35 SpringGreen3
    (0, 175, 135),   //  36 DarkCyan
    (0, 175, 175),   //  37 LightSeaGreen
    (0, 175, 215),   //  38 DeepSkyBlue2
    (0, 175, 255),   //  39 DeepSkyBlue1
    (0, 215, 0),     //  40 Green3
    (0, 215, 95),    //  41 SpringGreen3
    (0, 215, 135),   //  42 SpringGreen2
    (0, 215, 175),   //  43 Cyan3
    (0, 215, 215),   //  44 DarkTurquoise
    (0, 215, 255),   //  45 Turquoise2
    (0, 255, 0),     //  46 Green1
    (0, 255, 95),    //  47 SpringGreen2
    (0, 255, 135),   //  48 SpringGreen1
    (0, 255, 175),   //  49 MediumSpringGreen
    (0, 255, 215),   //  50 Cyan2
    (0, 255, 255),   //  51 Cyan1
    (95, 0, 0),      //  52 DarkRed
    (95, 0, 95),     //  53 DeepPink4
    (95, 0, 135),    //  54 Purple4
    (95, 0, 175),    //  55 Purple4
    (95, 0, 215),    //  56 Purple3
    (95, 0, 255),    //  57 BlueViolet
    (95, 95, 0),     //  58 Orange4
    (95, 95, 95),    //  59 Grey37
    (95, 95, 135),   //  60 MediumPurple4
    (95, 95, 175),   //  61 SlateBlue3
    (95, 95, 215),   //  62 SlateBlue3
    (95, 95, 255),   //  63 RoyalBlue1
    (95, 135, 0),    //  64 Chartreuse4
    (95, 135, 95),   //  65 DarkSeaGreen4
    (95, 135, 135),  //  66 PaleTurquoise4
    (95, 135, 175),  //  67 SteelBlue
    (95, 135, 215),  //  68 SteelBlue3
    (95, 135, 255),  //  69 CornflowerBlue
    (95, 175, 0),    //  70 Chartreuse3
    (95, 175, 95),   //  71 DarkSeaGreen4
    (95, 175, 135),  //  72 CadetBlue
    (95, 175, 175),  //  73 CadetBlue
    (95, 175, 215),  //  74 SkyBlue3
    (95, 175, 255),  //  75 SteelBlue1
    (95, 215, 0),    //  76 Chartreuse3
    (95, 215, 95),   //  77 PaleGreen3
    (95, 215, 135),  //  78 SeaGreen3
    (95, 215, 175),  //  79 Aquamarine3
    (95, 215, 215),  //  80 MediumTurquoise
    (95, 215, 255),  //  81 SteelBlue1
    (95, 255, 0),    //  82 Chartreuse2
    (95, 255, 95),   //  83 SeaGreen2
    (95, 255, 135),  //  84 SeaGreen1
    (95, 255, 175),  //  85 SeaGreen1
    (95, 255, 215),  //  86 Aquamarine1
    (95, 255, 255),  //  87 DarkSlateGray2
    (135, 0, 0),     //  88 DarkRed
    (135, 0, 95),    //  89 DeepPink4
    (135, 0, 135),   //  90 DarkMagenta
    (135, 0, 175),   //  91 DarkMagenta
    (135, 0, 215),   //  92 DarkViolet
    (135, 0, 255),   //  93 Purple
    (135, 95, 0),    //  94 Orange4
    (135, 95, 95),   //  95 LightPink4
    (135, 95, 135),  //  96 Plum4
    (135, 95, 175),  //  97 MediumPurple3
    (135, 95, 215),  //  98 MediumPurple3
    (135, 95, 255),  //  99 SlateBlue1
    (135, 135, 0),   // 100 Yellow4
    (135, 135, 95),  // 101 Wheat4
    (135, 135, 135), // 102 Grey53
    (135, 135, 175), // 103 LightSlateGrey
    (135, 135, 215), // 104 MediumPurple
    (135, 135, 255), // 105 LightSlateBlue
    (135, 175, 0),   // 106 Yellow4
    (135, 175, 95),  // 107 DarkOliveGreen3
    (135, 175, 135), // 108 DarkSeaGreen
    (135, 175, 175), // 109 LightSkyBlue3
    (135, 175, 215), // 110 LightSkyBlue3
    (135, 175, 255), // 111 SkyBlue2
    (135, 215, 0),   // 112 Chartreuse2
    (135, 215, 95),  // 113 DarkOliveGreen3
    (135, 215, 135), // 114 PaleGreen3
    (135, 215, 175), // 115 DarkSeaGreen3
    (135, 215, 215), // 116 DarkSlateGray3
    (135, 215, 255), // 117 SkyBlue1
    (135, 255, 0),   // 118 Chartreuse1
    (135, 255, 95),  // 119 LightGreen
    (135, 255, 135), // 120 LightGreen
    (135, 255, 175), // 121 PaleGreen1
    (135, 255, 215), // 122 Aquamarine1
    (135, 255, 255), // 123 DarkSlateGray1
    (175, 0, 0),     // 124 Red3
    (175, 0, 95),    // 125 DeepPink4
    (175, 0, 135),   // 126 MediumVioletRed
    (175, 0, 175),   // 127 Magenta3
    (175, 0, 215),   // 128 DarkViolet
    (175, 0, 255),   // 129 Purple
    (175, 95, 0),    // 130 DarkOrange3
    (175, 95, 95),   // 131 IndianRed
    (175, 95, 135),  // 132 HotPink3
    (175, 95, 175),  // 133 MediumOrchid3
    (175, 95, 215),  // 134 MediumOrchid
    (175, 95, 255),  // 135 MediumPurple2
    (175, 135, 0),   // 136 DarkGoldenrod
    (175, 135, 95),  // 137 LightSalmon3
    (175, 135, 135), // 138 RosyBrown
    (175, 135, 175), // 139 Grey63
    (175, 135, 215), // 140 MediumPurple2
    (175, 135, 255), // 141 MediumPurple1
    (175, 175, 0),   // 142 Gold3
    (175, 175, 95),  // 143 DarkKhaki
    (175, 175, 135), // 144 NavajoWhite3
    (175, 175, 175), // 145 Grey69
    (175, 175, 215), // 146 LightSteelBlue3
    (175, 175, 255), // 147 LightSteelBlue
    (175, 215, 0),   // 148 Yellow3
    (175, 215, 95),  // 149 DarkOliveGreen3
    (175, 215, 135), // 150 DarkSeaGreen3
    (175, 215, 175), // 151 DarkSeaGreen2
    (175, 215, 215), // 152 LightCyan3
    (175, 215, 255), // 153 LightSkyBlue1
    (175, 255, 0),   // 154 GreenYellow
    (175, 255, 95),  // 155 DarkOliveGreen2
    (175, 255, 135), // 156 PaleGreen1
    (175, 255, 175), // 157 DarkSeaGreen2
    (175, 255, 215), // 158 DarkSeaGreen1
    (175, 255, 255), // 159 PaleTurquoise1
    (215, 0, 0),     // 160 Red3
    (215, 0, 95),    // 161 DeepPink3
    (215, 0, 135),   // 162 DeepPink3
    (215, 0, 175),   // 163 Magenta3
    (215, 0, 215),   // 164 Magenta3
    (215, 0, 255),   // 165 Magenta2
    (215, 95, 0),    // 166 DarkOrange3
    (215, 95, 95),   // 167 IndianRed
    (215, 95, 135),  // 168 HotPink3
    (215, 95, 175),  // 169 HotPink2
    (215, 95, 215),  // 170 Orchid
    (215, 95, 255),  // 171 MediumOrchid1
    (215, 135, 0),   // 172 Orange3
    (215, 135, 95),  // 173 LightSalmon3
    (215, 135, 135), // 174 LightPink3
    (215, 135, 175), // 175 Pink3
    (215, 135, 215), // 176 Plum3
    (215, 135, 255), // 177 Violet
    (215, 175, 0),   // 178 Gold3
    (215, 175, 95),  // 179 LightGoldenrod3
    (215, 175, 135), // 180 Tan
    (215, 175, 175), // 181 MistyRose3
    (215, 175, 215), // 182 Thistle3
    (215, 175, 255), // 183 Plum2
    (215, 215, 0),   // 184 Yellow3
    (215, 215, 95),  // 185 Khaki3
    (215, 215, 135), // 186 LightGoldenrod2
    (215, 215, 175), // 187 LightYellow3
    (215, 215, 215), // 188 Grey84
    (215, 215, 255), // 189 LightSteelBlue1
    (215, 255, 0),   // 190 Yellow2
    (215, 255, 95),  // 191 DarkOliveGreen1
    (215, 255, 135), // 192 DarkOliveGreen1
    (215, 255, 175), // 193 DarkSeaGreen1
    (215, 255, 215), // 194 Honeydew2
    (215, 255, 255), // 195 LightCyan1
    (255, 0, 0),     // 196 Red1
    (255, 0, 95),    // 197 DeepPink2
    (255, 0, 135),   // 198 DeepPink1
    (255, 0, 175),   // 199 DeepPink1
    (255, 0, 215),   // 200 Magenta2
    (255, 0, 255),   // 201 Magenta1
    (255, 95, 0),    // 202 OrangeRed1
    (255, 95, 95),   // 203 IndianRed1
    (255, 95, 135),  // 204 IndianRed1
    (255, 95, 175),  // 205 HotPink
    (255, 95, 215),  // 206 HotPink
    (255, 95, 255),  // 207 MediumOrchid1
    (255, 135, 0),   // 208 DarkOrange
    (255, 135, 95),  // 209 Salmon1
    (255, 135, 135), // 210 LightCoral
    (255, 135, 175), // 211 PaleVioletRed1
    (255, 135, 215), // 212 Orchid2
    (255, 135, 255), // 213 Orchid1
    (255, 175, 0),   // 214 Orange1
    (255, 175, 95),  // 215 SandyBrown
    (255, 175, 135), // 216 LightSalmon1
    (255, 175, 175), // 217 LightPink1
    (255, 175, 215), // 218 Pink1
    (255, 175, 255), // 219 Plum1
    (255, 215, 0),   // 220 Gold1
    (255, 215, 95),  // 221 LightGoldenrod2
    (255, 215, 135), // 222 LightGoldenrod2
    (255, 215, 175), // 223 NavajoWhite1
    (255, 215, 215), // 224 MistyRose1
    (255, 215, 255), // 225 Thistle1
    (255, 255, 0),   // 226 Yellow1
    (255, 255, 95),  // 227 LightGoldenrod1
    (255, 255, 135), // 228 Khaki1
    (255, 255, 175), // 229 Wheat1
    (255, 255, 215), // 230 Cornsilk1
    (255, 255, 255), // 231 Grey100
    (8, 8, 8),       // 232 Grey3
    (18, 18, 18),    // 233 Grey7
    (28, 28, 28),    // 234 Grey11
    (38, 38, 38),    // 235 Grey15
    (48, 48, 48),    // 236 Grey19
    (58, 58, 58),    // 237 Grey23
    (68, 68, 68),    // 238 Grey27
    (78, 78, 78),    // 239 Grey30
    (88, 88, 88),    // 240 Grey35
    (98, 98, 98),    // 241 Grey39
    (108, 108, 108), // 242 Grey42
    (118, 118, 118), // 243 Grey46
    (128, 128, 128), // 244 Grey50
    (138, 138, 138), // 245 Grey54
    (148, 148, 148), // 246 Grey58
    (158, 158, 158), // 247 Grey62
    (168, 168, 168), // 248 Grey66
    (178, 178, 178), // 249 Grey70
    (188, 188, 188), // 250 Grey74
    (198, 198, 198), // 251 Grey78
    (208, 208, 208), // 252 Grey82
    (218, 218, 218), // 253 Grey85
    (228, 228, 228), // 254 Grey89
    (238, 238, 238), // 255 Grey93
];

#[cfg(test)]
mod colorfgbg_tests {
    use super::*;

    #[test]
    fn parses_dark_and_light_backgrounds() {
        // "fg;bg", white fg on black bg → dark background.
        let dark = colorfgbg_to_default("15;0").expect("parse dark");
        assert_eq!(dark.bg, (0, 0, 0));
        // black fg on white bg → light background.
        let light = colorfgbg_to_default("0;15").expect("parse light");
        assert_eq!(light.bg, (255, 255, 255));
        assert!(light.bg.0 as u16 + light.bg.1 as u16 + light.bg.2 as u16 > dark.bg.0 as u16);
        // 3-field form "fg;default;bg", last field is bg.
        let three = colorfgbg_to_default("0;default;15").expect("parse 3-field");
        assert_eq!(three.bg, (255, 255, 255));
    }

    #[test]
    fn rejects_malformed_colorfgbg() {
        assert!(colorfgbg_to_default("nonsense").is_none());
        assert!(colorfgbg_to_default("").is_none());
        assert!(colorfgbg_to_default("12").is_none());
    }
}

#[cfg(test)]
mod theme_tests {
    use super::*;

    /// Resolution is asserted through `palette_for`, not through the process
    /// global: every `TuiApp` a sibling test builds applies its own theme, so a
    /// set-then-read here raced them and failed on whichever ran in between.
    #[test]
    fn each_theme_index_resolves_to_its_own_semantic_palette() {
        let dark = palette_for(0);
        let cb = palette_for(5);

        // The whole point of the re-route: a different theme yields different
        // semantic colors. Colorblind swaps green/red for bluish-green/vermillion.
        assert_ne!(dark.success, cb.success);
        assert_ne!(dark.danger, cb.danger);
        assert_ne!(dark.accent, cb.accent);

        // Out-of-range index falls back to Dark rather than panicking.
        assert_eq!(palette_for(99).accent, PALETTE_DARK.accent);
    }

    #[test]
    fn every_theme_index_resolves_to_a_distinct_dark_or_light_base() {
        // Dark/Ansi/HighContrastDark/Colorblind are dark-based; Light/HighContrastLight
        // are light-based, their status-bar backgrounds must differ accordingly.
        let lightness = |(r, g, b): (u8, u8, u8)| r as u16 + g as u16 + b as u16;
        assert!(
            lightness(palette_for(1).status_bar_bg) > lightness(palette_for(0).status_bar_bg),
            "light theme status bar should be brighter than dark"
        );
    }
}
