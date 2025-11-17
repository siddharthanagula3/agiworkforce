#![deny(warnings)] // Deny ALL warnings - zero tolerance
#![allow(unsafe_code)] // Required for Windows API calls
#![allow(unused_qualifications)] // Some qualifications improve code clarity
#![allow(clippy::should_implement_trait)]

// Core application modules
pub mod commands;
pub mod state;
pub mod tray;
pub mod window;

// Error handling and logging
pub mod logging;

// LLM Router and Cost Management
pub mod router;

// Prompt Enhancement and API Routing
pub mod prompt_enhancement;

// API Integrations (Perplexity, Veo3, Image Generation)
pub mod api_integrations;

// Automation modules
pub mod automation;

// Browser integration
pub mod browser;

// P2P Communication
pub mod p2p;

// Database layer
pub mod db;

// Billing and subscriptions (Stripe integration)
pub mod billing;

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

// Codebase indexing and analysis
pub mod codebase;

// Vector embeddings for semantic search
pub mod embeddings;

// API client and OAuth
pub mod api;

// Database clients (SQL and NoSQL)
pub mod database;

// Communications (Email/IMAP/SMTP)

// Messaging platform integrations (Slack, WhatsApp, Teams)
pub mod communications;
pub mod messaging;

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

// Background Task Management System
pub mod tasks;

// AI Employee Library - Pre-built AI employees for instant value
pub mod ai_employees;

// Analytics and ROI tracking system
pub mod analytics;

// Workflow Orchestration System
pub mod orchestration;

// Onboarding and first-run experience
pub mod onboarding;

// Public Workflow Marketplace - Viral sharing system
pub mod workflows;

// Model Context Protocol (MCP) integration
pub mod mcp;

// Cache system for LLM responses and tool results
pub mod cache;

// Hook system for event-driven automation
pub mod hooks;

// Team collaboration system
pub mod teams;

// Real-time collaboration and WebSocket communication
pub mod realtime;

// Real-time ROI metrics and dashboard
pub mod metrics;

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

// Test utilities (only compiled in test builds)
#[cfg(test)]
pub mod test_utils;
