#[cfg(windows)]
mod clipboard;
#[cfg(windows)]
mod keyboard;
#[cfg(windows)]
mod mouse;

#[cfg(test)]
mod tests;

#[cfg(windows)]
pub use clipboard::ClipboardManager;
#[cfg(windows)]
pub use keyboard::KeyboardSimulator;
#[cfg(windows)]
pub use mouse::{MouseButton, MouseSimulator};
