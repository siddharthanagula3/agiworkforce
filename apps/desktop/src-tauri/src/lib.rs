#![deny(warnings)]
#![allow(clippy::should_implement_trait)]

// Core application modules
pub mod commands;
pub mod state;
pub mod tray;
pub mod window;

// LLM Router and Cost Management
pub mod router;

// Automation modules
pub mod automation;

// Browser integration
pub mod browser;

// P2P Communication
pub mod p2p;

// Database layer
pub mod db;

// Settings storage
pub mod settings;

// Telemetry (logging, tracing, metrics)
pub mod telemetry;

// Overlay visualization
pub mod overlay;

// LLM Providers
pub mod providers;

// Security and guardrails
pub mod security;

// Modular Control Primitives (MCPs)
pub mod mcps;

// Event system
pub mod events;

// Terminal/PTY
pub mod terminal;

// Filesystem operations and watching
pub mod filesystem;

// API client and OAuth
pub mod api;

// Database clients (SQL and NoSQL)
pub mod database;

// Communications (Email/IMAP/SMTP)
pub mod communications;

// Calendar integration (Google Calendar, Outlook)
pub mod calendar;

// Cloud storage integrations (Drive, Dropbox, OneDrive)
pub mod cloud;

// Productivity tools (Notion, Trello, Asana)
pub mod productivity;

// Document MCP (M16) - Word, Excel, PDF support
pub mod document;

// Autonomous Agent System
pub mod agent;

// AGI (Artificial General Intelligence) System
pub mod agi;

// Model Context Protocol (MCP) integration
pub mod mcp;

// Re-exports for convenience
pub use state::{AppState, DockPosition, PersistentWindowState, WindowGeometry};
pub use tray::build_system_tray;
pub use window::{
    apply_dock, hide_window, initialize_window, set_always_on_top, set_pinned, show_window, undock,
    DockPreviewEvent, DockState,
};

// Error types
pub mod error;
pub use error::{Error, Result};

// Utilities
pub mod utils;
