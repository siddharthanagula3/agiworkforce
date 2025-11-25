#![warn(warnings)] // Warn on warnings - allow for dev
#![allow(unsafe_code)] // Required for Windows API calls
#![allow(unused_qualifications)] // Some qualifications improve code clarity
#![allow(clippy::should_implement_trait)]

use tauri::Manager;

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

// Security and guardrails
pub mod security;

// Modular Control Primitives (MCPs)
// pub mod mcps; // REMOVED duplicate

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

// Windows Speech Recognition integration
pub mod speech;

// Windows Clipboard Monitoring
pub mod clipboard;

// Cloud Sync System
pub mod sync;

// Full-Text Search (FTS5)
pub mod search;

// Projects System with RAG
pub mod projects;

// Advanced Tool Permission System
pub mod permissions;

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

// Autonomous agent system (planner/executor/approval runtime)
pub mod agent;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Initialize database in proper app data directory (Bug #31 fix)
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            // Ensure directory exists
            if let Some(parent) = app_data_dir.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("agi.db");
            let db = crate::db::Database::new(db_path.to_str().expect("Invalid db path"))
                .expect("Failed to init DB");

            app.manage(commands::chat::AppDatabase {
                conn: db.get_connection(),
            });

            app.manage(crate::billing::BillingStateWrapper::default());
            app.manage(commands::llm::LLMState::default());
            app.manage(commands::settings::SettingsState::default());

            Ok(())
        })
        // Register All Commands
        .invoke_handler(tauri::generate_handler![
            commands::chat::chat_send_message,
            commands::chat::chat_get_conversations,
            commands::security::auth_login,
            commands::mcp::mcp_list_servers,
            commands::tutorials::get_user_credits, // Tutorial rewards credits
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
