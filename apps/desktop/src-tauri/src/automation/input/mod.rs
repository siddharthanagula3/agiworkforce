// Cross-platform input automation modules
mod clipboard;
mod enigo_lock;
mod keyboard;
mod mouse;

#[cfg(test)]
mod tests;

pub use clipboard::ClipboardManager;
pub(crate) use enigo_lock::lock_enigo;
pub use keyboard::KeyboardSimulator;
pub use mouse::{MouseButton, MouseSimulator};
