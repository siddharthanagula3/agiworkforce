// platform/ — OS-specific implementations (macOS, Windows, Linux)
//
// This is the target location for platform-conditional code
// currently scattered across src/sys/ and src/core/.
//
// Phase 5 skeleton — module not yet declared in lib.rs.
// Platform modules are migrated progressively.
//
// Suggested structure (future):
//   platform/
//     macos/   — AppleScript, AXUIElement, Spotlight, Notification Center
//     windows/ — WinAPI, COM, PowerShell bridges
//     linux/   — D-Bus, XDG, Wayland/X11
//     mod.rs   — this file; re-exports common platform trait
