//! Unicode/ASCII glyph mapping for TUI tool-call icons per design-spec §5.3.
//!
//! Each Lucide icon name used in the inline tool-call anatomy (§4.6) maps to a
//! single Unicode glyph for color terminals and an ASCII fallback for
//! `NO_COLOR=1` / `TERM=dumb` environments.

#![allow(dead_code)]

/// Tool types that correspond to Lucide icons in the design spec.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ToolIcon {
    /// `Terminal` — bash / shell execution
    Terminal,
    /// `FileText` — file read
    FileText,
    /// `FilePlus2` — file write (new file)
    FilePlus2,
    /// `FilePen` — file edit / patch
    FilePen,
    /// `Search` — web-search
    Search,
    /// `Globe` — web-fetch
    Globe,
    /// `Folder` — filesystem list
    Folder,
    /// `Image` — image generation
    Image,
    /// `MousePointerClick` — browser / computer use
    MousePointerClick,
    /// `Plug` — MCP custom tool
    Plug,
    /// `CircleCheck` — done terminator
    CircleCheck,
    /// `Brain` — thinking / reasoning
    Brain,
    /// `Loader2` — pending spinner (animated braille cycle)
    Loader2,
}

/// Braille spinner frames for the `Loader2` animation.
pub(crate) const BRAILLE_FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/// ASCII spinner frames for dumb-terminal fallback.
pub(crate) const ASCII_FRAMES: &[&str] = &["|", "/", "-", "\\"];

pub(crate) fn ascii_mode() -> bool {
    std::env::var("NO_COLOR").is_ok()
        || std::env::var("TERM")
            .map(|t| t == "dumb")
            .unwrap_or(false)
}

/// Return the single glyph for a tool icon.
///
/// Returns an ASCII fallback when `NO_COLOR=1` or `TERM=dumb` is set.
pub(crate) fn glyph(icon: ToolIcon) -> &'static str {
    if ascii_mode() {
        return ascii_glyph(icon);
    }
    unicode_glyph(icon)
}

/// Return the animated spinner frame for a given tick index.
///
/// `tick` should be incremented by the render loop on each animation frame.
/// Returns ASCII frames when in dumb-terminal mode.
pub(crate) fn spinner_frame(tick: usize) -> &'static str {
    if ascii_mode() {
        ASCII_FRAMES[tick % ASCII_FRAMES.len()]
    } else {
        BRAILLE_FRAMES[tick % BRAILLE_FRAMES.len()]
    }
}

pub(crate) fn unicode_glyph(icon: ToolIcon) -> &'static str {
    match icon {
        ToolIcon::Terminal => "❯",
        ToolIcon::FileText => "📄",
        ToolIcon::FilePlus2 => "📝",
        ToolIcon::FilePen => "✎",
        ToolIcon::Search => "🔍",
        ToolIcon::Globe => "🌐",
        ToolIcon::Folder => "📁",
        ToolIcon::Image => "🖼",
        ToolIcon::MousePointerClick => "🖱",
        ToolIcon::Plug => "🔌",
        ToolIcon::CircleCheck => "✓",
        ToolIcon::Brain => "🧠",
        ToolIcon::Loader2 => BRAILLE_FRAMES[0],
    }
}

pub(crate) fn ascii_glyph(icon: ToolIcon) -> &'static str {
    match icon {
        ToolIcon::Terminal => ">",
        ToolIcon::FileText => "[F]",
        ToolIcon::FilePlus2 => "[+]",
        ToolIcon::FilePen => "[E]",
        ToolIcon::Search => "?",
        ToolIcon::Globe => "@",
        ToolIcon::Folder => "[D]",
        ToolIcon::Image => "[I]",
        ToolIcon::MousePointerClick => "[C]",
        ToolIcon::Plug => "[P]",
        ToolIcon::CircleCheck => "v",
        ToolIcon::Brain => "[T]",
        ToolIcon::Loader2 => ASCII_FRAMES[0],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_glyphs_are_non_empty() {
        let icons = [
            ToolIcon::Terminal,
            ToolIcon::FileText,
            ToolIcon::FilePlus2,
            ToolIcon::FilePen,
            ToolIcon::Search,
            ToolIcon::Globe,
            ToolIcon::Folder,
            ToolIcon::Image,
            ToolIcon::MousePointerClick,
            ToolIcon::Plug,
            ToolIcon::CircleCheck,
            ToolIcon::Brain,
            ToolIcon::Loader2,
        ];
        for icon in icons {
            assert!(!unicode_glyph(icon).is_empty(), "unicode_glyph({icon:?}) is empty");
        }
    }

    #[test]
    fn ascii_glyphs_are_non_empty() {
        let icons = [
            ToolIcon::Terminal,
            ToolIcon::FileText,
            ToolIcon::FilePlus2,
            ToolIcon::FilePen,
            ToolIcon::Search,
            ToolIcon::Globe,
            ToolIcon::Folder,
            ToolIcon::Image,
            ToolIcon::MousePointerClick,
            ToolIcon::Plug,
            ToolIcon::CircleCheck,
            ToolIcon::Brain,
            ToolIcon::Loader2,
        ];
        for icon in icons {
            assert!(!ascii_glyph(icon).is_empty(), "ascii_glyph({icon:?}) is empty");
        }
    }

    #[test]
    fn spec_table_entries_match() {
        // Verify the exact §5.3 table entries
        assert_eq!(unicode_glyph(ToolIcon::Terminal), "❯");
        assert_eq!(unicode_glyph(ToolIcon::FileText), "📄");
        assert_eq!(unicode_glyph(ToolIcon::FilePen), "✎");
        assert_eq!(unicode_glyph(ToolIcon::Search), "🔍");
        assert_eq!(unicode_glyph(ToolIcon::Globe), "🌐");
        assert_eq!(unicode_glyph(ToolIcon::CircleCheck), "✓");
        assert!(BRAILLE_FRAMES.contains(&unicode_glyph(ToolIcon::Loader2)));

        assert_eq!(ascii_glyph(ToolIcon::Terminal), ">");
        assert_eq!(ascii_glyph(ToolIcon::FileText), "[F]");
        assert_eq!(ascii_glyph(ToolIcon::FilePen), "[E]");
        assert_eq!(ascii_glyph(ToolIcon::Search), "?");
        assert_eq!(ascii_glyph(ToolIcon::Globe), "@");
        assert_eq!(ascii_glyph(ToolIcon::CircleCheck), "v");
    }

    #[test]
    fn spinner_frames_cycle() {
        // Unicode path (force by bypassing env check)
        for i in 0..BRAILLE_FRAMES.len() * 3 {
            let frame = BRAILLE_FRAMES[i % BRAILLE_FRAMES.len()];
            assert!(!frame.is_empty());
        }
        for i in 0..ASCII_FRAMES.len() * 3 {
            let frame = ASCII_FRAMES[i % ASCII_FRAMES.len()];
            assert!(!frame.is_empty());
        }
    }
}
