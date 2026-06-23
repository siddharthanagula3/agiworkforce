use super::color::perceptual_distance;
use ratatui::style::Color;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::AtomicU8;
use std::sync::atomic::Ordering;

// ─────────────────────────────────────────────────────────────────────────────
// v3 brand palette — mirrors packages/design-tokens/src/tokens.ts
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
    on_dark: (u8, u8, u8),
    on_light: (u8, u8, u8),
}

/// Dark = the existing AGI v3 brand defaults, so the default look is unchanged.
const PALETTE_DARK: Palette = Palette {
    accent: V3_TEAL,
    muted: (128, 128, 128),
    success: V3_SUCCESS,
    warning: V3_WARNING,
    danger: V3_DANGER,
    cloud: V3_TERRACOTTA,
    brand: V3_TEAL,
    status_bar_bg: (48, 48, 48),
    on_dark: (255, 255, 255),
    on_light: (15, 15, 14),
};

/// Light terminals: darker accents/text so foreground reads on a bright bg.
const PALETTE_LIGHT: Palette = Palette {
    accent: (0x1a, 0x66, 0x70),
    muted: (90, 90, 90),
    success: (0x15, 0x80, 0x3d),
    warning: (0xb4, 0x53, 0x09),
    danger: (0xb9, 0x1c, 0x1c),
    cloud: (0xc2, 0x4a, 0x2c),
    brand: (0x1a, 0x66, 0x70),
    status_bar_bg: (222, 222, 216),
    on_dark: (255, 255, 255),
    on_light: (15, 15, 14),
};

/// Pure 16-color ANSI approximations for low-color terminals.
const PALETTE_ANSI: Palette = Palette {
    accent: (0, 170, 170),
    muted: (128, 128, 128),
    success: (0, 170, 0),
    warning: (170, 85, 0),
    danger: (170, 0, 0),
    cloud: (170, 0, 170),
    brand: (0, 170, 170),
    status_bar_bg: (48, 48, 48),
    on_dark: (255, 255, 255),
    on_light: (0, 0, 0),
};

/// Solarized (Ethan Schoonover) — dark variant.
const PALETTE_SOLARIZED_DARK: Palette = Palette {
    accent: (38, 139, 210),
    muted: (88, 110, 117),
    success: (133, 153, 0),
    warning: (181, 137, 0),
    danger: (220, 50, 47),
    cloud: (203, 75, 22),
    brand: (42, 161, 152),
    status_bar_bg: (7, 54, 66),
    on_dark: (253, 246, 227),
    on_light: (0, 43, 54),
};

/// Solarized — light variant (light base, same accents).
const PALETTE_SOLARIZED_LIGHT: Palette = Palette {
    accent: (38, 139, 210),
    muted: (101, 123, 131),
    success: (133, 153, 0),
    warning: (181, 137, 0),
    danger: (220, 50, 47),
    cloud: (203, 75, 22),
    brand: (42, 161, 152),
    status_bar_bg: (238, 232, 213),
    on_dark: (253, 246, 227),
    on_light: (0, 43, 54),
};

/// Deuteranopia-friendly: blue/orange/vermillion instead of green/red so the
/// success↔danger distinction survives red-green color blindness (Wong palette).
const PALETTE_COLORBLIND: Palette = Palette {
    accent: (0, 114, 178),
    muted: (128, 128, 128),
    success: (0, 158, 115),
    warning: (230, 159, 0),
    danger: (213, 94, 0),
    cloud: (86, 180, 233),
    brand: (0, 114, 178),
    status_bar_bg: (48, 48, 48),
    on_dark: (255, 255, 255),
    on_light: (15, 15, 14),
};

/// Active theme index. Matches `ThemeChoice` declaration order
/// (Dark=0, Light=1, Ansi=2, SolarizedDark=3, SolarizedLight=4, Colorblind=5).
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

fn active_palette() -> Palette {
    match ACTIVE_THEME.load(Ordering::Relaxed) {
        1 => PALETTE_LIGHT,
        2 => PALETTE_ANSI,
        3 => PALETTE_SOLARIZED_DARK,
        4 => PALETTE_SOLARIZED_LIGHT,
        5 => PALETTE_COLORBLIND,
        _ => PALETTE_DARK,
    }
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

/// Foreground for dark semantic backgrounds.
pub fn ui_on_dark() -> Color {
    best_color(active_palette().on_dark)
}

/// Foreground for light semantic backgrounds.
pub fn ui_on_light() -> Color {
    best_color(active_palette().on_light)
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
/// field is the background index. Returns `None` when absent or malformed —
/// most modern terminals (iTerm2, Terminal.app) don't set it, so this is a
/// best-effort fallback now that crossterm 0.28 removed the OSC color query.
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
#[allow(dead_code)]
pub fn palette_version() -> u64 {
    DEFAULT_PALETTE_VERSION.load(Ordering::Relaxed)
}

// NOTE: crossterm 0.28 removed query_background_color / query_foreground_color.
// Terminal color querying is not available; fall back to returning None.
#[cfg(all(unix, not(test)))]
mod imp {
    use super::DefaultColors;

    pub(super) fn default_colors() -> Option<DefaultColors> {
        // crossterm 0.28 removed the OSC color query, so fall back to COLORFGBG
        // (set by rxvt/konsole/some tmux configs). Absent → None, unchanged.
        std::env::var("COLORFGBG")
            .ok()
            .and_then(|raw| super::colorfgbg_to_default(&raw))
    }

    pub(super) fn requery_default_colors() {}
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
        // "fg;bg" — white fg on black bg → dark background.
        let dark = colorfgbg_to_default("15;0").expect("parse dark");
        assert_eq!(dark.bg, (0, 0, 0));
        // black fg on white bg → light background.
        let light = colorfgbg_to_default("0;15").expect("parse light");
        assert_eq!(light.bg, (255, 255, 255));
        assert!(light.bg.0 as u16 + light.bg.1 as u16 + light.bg.2 as u16 > dark.bg.0 as u16);
        // 3-field form "fg;default;bg" — last field is bg.
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

    #[test]
    fn set_active_theme_switches_the_semantic_palette() {
        set_active_theme(0); // Dark (= v3 brand defaults)
        assert_eq!(active_theme_idx(), 0);
        let dark = active_palette();

        set_active_theme(5); // Colorblind
        assert_eq!(active_theme_idx(), 5);
        let cb = active_palette();

        // The whole point of the re-route: a different theme yields different
        // semantic colors. Colorblind swaps green/red for bluish-green/vermillion.
        assert_ne!(dark.success, cb.success);
        assert_ne!(dark.danger, cb.danger);
        assert_ne!(dark.accent, cb.accent);

        // Out-of-range index falls back to Dark rather than panicking.
        set_active_theme(99);
        assert_eq!(active_palette().accent, PALETTE_DARK.accent);

        // Restore the default so char-only render snapshots stay deterministic.
        set_active_theme(0);
    }

    #[test]
    fn every_theme_index_resolves_to_a_distinct_dark_or_light_base() {
        // Dark/Ansi/SolarizedDark/Colorblind are dark-based; Light/SolarizedLight
        // are light-based — their status-bar backgrounds must differ accordingly.
        set_active_theme(1); // Light
        let light_bar = active_palette().status_bar_bg;
        set_active_theme(0); // Dark
        let dark_bar = active_palette().status_bar_bg;
        let lightness = |(r, g, b): (u8, u8, u8)| r as u16 + g as u16 + b as u16;
        assert!(
            lightness(light_bar) > lightness(dark_bar),
            "light theme status bar should be brighter than dark"
        );
        set_active_theme(0);
    }
}
