pub mod pty;
pub mod session_manager;
pub mod shells;

#[cfg(test)]
mod tests;

pub use pty::{PtySession, ShellType};
pub use session_manager::SessionManager;
pub use shells::{detect_available_shells, get_default_shell, ShellInfo};
