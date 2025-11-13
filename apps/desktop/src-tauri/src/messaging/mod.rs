pub mod slack;
pub mod whatsapp;
pub mod teams;
pub mod types;

pub use types::*;

// Re-export main clients and configs
pub use slack::{SlackClient, SlackConfig};
pub use whatsapp::WhatsAppClient;
pub use teams::{TeamsClient, TeamsConfig};
