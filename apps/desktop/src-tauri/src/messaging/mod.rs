pub mod slack;
pub mod teams;
pub mod types;
pub mod whatsapp;

pub use types::*;

// Re-export main clients and configs
pub use slack::{SlackClient, SlackConfig};
pub use teams::{TeamsClient, TeamsConfig};
pub use whatsapp::WhatsAppClient;
