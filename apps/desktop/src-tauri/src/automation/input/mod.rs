mod clipboard;
mod keyboard;
mod mouse;

#[cfg(test)]
mod tests;

pub use clipboard::ClipboardManager;
pub use keyboard::KeyboardSimulator;
pub use mouse::{MouseButton, MouseSimulator};
