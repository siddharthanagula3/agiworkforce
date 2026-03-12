//! Canvas renderer and manager
//!
//! Manages canvas instances and their elements, emitting events to the frontend.

use super::elements::CanvasElement;
use crate::sys::error::{Error, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Canvas state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Canvas {
    pub id: String,
    pub name: String,
    pub width: f64,
    pub height: f64,
    pub elements: Vec<CanvasElement>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Canvas {
    /// Create a new canvas
    pub fn new(id: String, name: String, width: f64, height: f64) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id,
            name,
            width,
            height,
            elements: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Add an element to the canvas
    pub fn add_element(&mut self, element: CanvasElement) {
        self.elements.push(element);
        self.updated_at = chrono::Utc::now().timestamp();
    }

    /// Remove an element by ID
    pub fn remove_element(&mut self, element_id: &str) -> Option<CanvasElement> {
        if let Some(pos) = self.elements.iter().position(|e| e.id() == element_id) {
            self.updated_at = chrono::Utc::now().timestamp();
            Some(self.elements.remove(pos))
        } else {
            None
        }
    }

    /// Get an element by ID
    pub fn get_element(&self, element_id: &str) -> Option<&CanvasElement> {
        self.elements.iter().find(|e| e.id() == element_id)
    }

    /// Get a mutable reference to an element by ID
    pub fn get_element_mut(&mut self, element_id: &str) -> Option<&mut CanvasElement> {
        self.elements.iter_mut().find(|e| e.id() == element_id)
    }

    /// Clear all elements from the canvas
    pub fn clear(&mut self) {
        self.elements.clear();
        self.updated_at = chrono::Utc::now().timestamp();
    }
}

/// Canvas event types emitted to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum CanvasEvent {
    /// A new canvas was created
    CanvasCreated { canvas: Canvas },
    /// A canvas was deleted
    CanvasDeleted { canvas_id: String },
    /// An element was added to a canvas
    ElementAdded {
        canvas_id: String,
        element: CanvasElement,
    },
    /// An element was updated
    ElementUpdated {
        canvas_id: String,
        element: CanvasElement,
    },
    /// An element was removed
    ElementRemoved {
        canvas_id: String,
        element_id: String,
    },
    /// A canvas was cleared
    CanvasCleared { canvas_id: String },
    /// Active canvas changed
    ActiveCanvasChanged { canvas_id: Option<String> },
    /// A notification was triggered
    Notification {
        canvas_id: Option<String>,
        message: String,
        notification_type: String,
        duration_ms: Option<u32>,
    },
}

/// Maximum number of elements allowed per canvas to prevent memory exhaustion
const MAX_ELEMENTS_PER_CANVAS: usize = 500;

/// Manages multiple canvases and their state
pub struct CanvasManager {
    canvases: RwLock<HashMap<String, Canvas>>,
    active_canvas: RwLock<Option<String>>,
    next_canvas_id: std::sync::atomic::AtomicU64,
    event_sender: Option<tokio::sync::mpsc::UnboundedSender<CanvasEvent>>,
}

impl CanvasManager {
    /// Create a new canvas manager
    pub fn new() -> Self {
        Self {
            canvases: RwLock::new(HashMap::new()),
            active_canvas: RwLock::new(None),
            next_canvas_id: std::sync::atomic::AtomicU64::new(1),
            event_sender: None,
        }
    }

    /// Create a canvas manager with an event sender
    pub fn with_event_sender(sender: tokio::sync::mpsc::UnboundedSender<CanvasEvent>) -> Self {
        Self {
            canvases: RwLock::new(HashMap::new()),
            active_canvas: RwLock::new(None),
            next_canvas_id: std::sync::atomic::AtomicU64::new(1),
            event_sender: Some(sender),
        }
    }

    /// Emit an event to the frontend
    fn emit_event(&self, event: CanvasEvent) {
        if let Some(sender) = &self.event_sender {
            let _ = sender.send(event);
        }
    }

    /// Generate a unique canvas ID
    fn generate_canvas_id(&self) -> String {
        let id = self
            .next_canvas_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        format!("canvas_{}", id)
    }

    /// Create a new canvas
    pub fn create_canvas(&self, name: &str, width: f64, height: f64) -> Result<String> {
        let id = self.generate_canvas_id();
        let canvas = Canvas::new(id.clone(), name.to_string(), width, height);

        {
            let mut canvases = self.canvases.write();
            canvases.insert(id.clone(), canvas.clone());
        }

        self.emit_event(CanvasEvent::CanvasCreated { canvas });
        Ok(id)
    }

    /// Delete a canvas
    pub fn delete_canvas(&self, canvas_id: &str) -> Result<()> {
        {
            let mut canvases = self.canvases.write();
            if canvases.remove(canvas_id).is_none() {
                return Err(Error::Generic(format!("Canvas not found: {}", canvas_id)));
            }
        }

        // Clear active if it was this canvas
        {
            let mut active = self.active_canvas.write();
            if active.as_deref() == Some(canvas_id) {
                *active = None;
                self.emit_event(CanvasEvent::ActiveCanvasChanged { canvas_id: None });
            }
        }

        self.emit_event(CanvasEvent::CanvasDeleted {
            canvas_id: canvas_id.to_string(),
        });
        Ok(())
    }

    /// Get a canvas by ID
    pub fn get_canvas(&self, canvas_id: &str) -> Option<Canvas> {
        let canvases = self.canvases.read();
        canvases.get(canvas_id).cloned()
    }

    /// Get all canvases
    pub fn list_canvases(&self) -> Vec<Canvas> {
        let canvases = self.canvases.read();
        canvases.values().cloned().collect()
    }

    /// Set the active canvas
    pub fn set_active(&self, canvas_id: Option<String>) -> Result<()> {
        if let Some(ref id) = canvas_id {
            let canvases = self.canvases.read();
            if !canvases.contains_key(id) {
                return Err(Error::Generic(format!("Canvas not found: {}", id)));
            }
        }

        {
            let mut active = self.active_canvas.write();
            *active = canvas_id.clone();
        }

        self.emit_event(CanvasEvent::ActiveCanvasChanged { canvas_id });
        Ok(())
    }

    /// Get the active canvas ID
    pub fn get_active(&self) -> Result<Option<String>> {
        let active = self.active_canvas.read();
        Ok(active.clone())
    }

    /// Add an element to a canvas
    pub fn add_element(&self, canvas_id: &str, element: CanvasElement) -> Result<()> {
        {
            let mut canvases = self.canvases.write();
            let canvas = canvases
                .get_mut(canvas_id)
                .ok_or_else(|| Error::Generic(format!("Canvas not found: {}", canvas_id)))?;
            if canvas.elements.len() >= MAX_ELEMENTS_PER_CANVAS {
                return Err(Error::Generic(format!(
                    "Canvas '{}' has reached the maximum element limit ({})",
                    canvas_id, MAX_ELEMENTS_PER_CANVAS
                )));
            }
            canvas.add_element(element.clone());
        }

        self.emit_event(CanvasEvent::ElementAdded {
            canvas_id: canvas_id.to_string(),
            element,
        });
        Ok(())
    }

    /// Remove an element from a canvas
    pub fn remove_element(&self, canvas_id: &str, element_id: &str) -> Result<CanvasElement> {
        let element = {
            let mut canvases = self.canvases.write();
            let canvas = canvases
                .get_mut(canvas_id)
                .ok_or_else(|| Error::Generic(format!("Canvas not found: {}", canvas_id)))?;
            canvas
                .remove_element(element_id)
                .ok_or_else(|| Error::Generic(format!("Element not found: {}", element_id)))?
        };

        self.emit_event(CanvasEvent::ElementRemoved {
            canvas_id: canvas_id.to_string(),
            element_id: element_id.to_string(),
        });
        Ok(element)
    }

    /// Update an element in a canvas
    pub fn update_element(
        &self,
        canvas_id: &str,
        element_id: &str,
        updater: impl FnOnce(&mut CanvasElement),
    ) -> Result<CanvasElement> {
        let element = {
            let mut canvases = self.canvases.write();
            let canvas = canvases
                .get_mut(canvas_id)
                .ok_or_else(|| Error::Generic(format!("Canvas not found: {}", canvas_id)))?;
            let element = canvas
                .get_element_mut(element_id)
                .ok_or_else(|| Error::Generic(format!("Element not found: {}", element_id)))?;
            updater(element);
            let element_clone = element.clone();
            canvas.updated_at = chrono::Utc::now().timestamp();
            element_clone
        };

        self.emit_event(CanvasEvent::ElementUpdated {
            canvas_id: canvas_id.to_string(),
            element: element.clone(),
        });
        Ok(element)
    }

    /// Clear all elements from a canvas
    pub fn clear_canvas(&self, canvas_id: &str) -> Result<()> {
        {
            let mut canvases = self.canvases.write();
            let canvas = canvases
                .get_mut(canvas_id)
                .ok_or_else(|| Error::Generic(format!("Canvas not found: {}", canvas_id)))?;
            canvas.clear();
        }

        self.emit_event(CanvasEvent::CanvasCleared {
            canvas_id: canvas_id.to_string(),
        });
        Ok(())
    }

    /// Emit a notification event to the frontend
    pub fn emit_notification(
        &self,
        canvas_id: Option<String>,
        message: String,
        notification_type: String,
        duration_ms: Option<u32>,
    ) {
        self.emit_event(CanvasEvent::Notification {
            canvas_id,
            message,
            notification_type,
            duration_ms,
        });
    }

    /// Get the element count for a canvas
    pub fn element_count(&self, canvas_id: &str) -> Result<usize> {
        let canvases = self.canvases.read();
        let canvas = canvases
            .get(canvas_id)
            .ok_or_else(|| Error::Generic(format!("Canvas not found: {}", canvas_id)))?;
        Ok(canvas.elements.len())
    }
}

impl Default for CanvasManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::canvas::elements::{Bounds, ElementStyle, Position, Size};

    #[test]
    fn test_create_canvas() {
        let manager = CanvasManager::new();
        let id = manager.create_canvas("Test Canvas", 800.0, 600.0).unwrap();

        let canvas = manager.get_canvas(&id).unwrap();
        assert_eq!(canvas.name, "Test Canvas");
        assert_eq!(canvas.width, 800.0);
        assert_eq!(canvas.height, 600.0);
    }

    #[test]
    fn test_add_element() {
        let manager = CanvasManager::new();
        let canvas_id = manager.create_canvas("Test", 800.0, 600.0).unwrap();

        let element = CanvasElement::Text {
            id: "text_1".to_string(),
            bounds: Bounds {
                position: Position { x: 10.0, y: 20.0 },
                size: Size {
                    width: 100.0,
                    height: 50.0,
                },
            },
            content: "Hello World".to_string(),
            style: ElementStyle::default(),
        };

        manager.add_element(&canvas_id, element).unwrap();

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 1);
        assert_eq!(canvas.elements[0].id(), "text_1");
    }

    #[test]
    fn test_remove_element() {
        let manager = CanvasManager::new();
        let canvas_id = manager.create_canvas("Test", 800.0, 600.0).unwrap();

        let element = CanvasElement::Text {
            id: "text_1".to_string(),
            bounds: Bounds::default(),
            content: "Hello".to_string(),
            style: ElementStyle::default(),
        };

        manager.add_element(&canvas_id, element).unwrap();
        manager.remove_element(&canvas_id, "text_1").unwrap();

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 0);
    }

    #[test]
    fn test_active_canvas() {
        let manager = CanvasManager::new();
        let id1 = manager.create_canvas("Canvas 1", 800.0, 600.0).unwrap();
        let id2 = manager.create_canvas("Canvas 2", 800.0, 600.0).unwrap();

        assert!(manager.get_active().unwrap().is_none());

        manager.set_active(Some(id1.clone())).unwrap();
        assert_eq!(manager.get_active().unwrap(), Some(id1));

        manager.set_active(Some(id2.clone())).unwrap();
        assert_eq!(manager.get_active().unwrap(), Some(id2));

        manager.set_active(None).unwrap();
        assert!(manager.get_active().unwrap().is_none());
    }

    #[test]
    fn test_clear_canvas() {
        let manager = CanvasManager::new();
        let canvas_id = manager.create_canvas("Test", 800.0, 600.0).unwrap();

        for i in 0..3 {
            let element = CanvasElement::Text {
                id: format!("text_{}", i),
                bounds: Bounds::default(),
                content: format!("Text {}", i),
                style: ElementStyle::default(),
            };
            manager.add_element(&canvas_id, element).unwrap();
        }

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 3);

        manager.clear_canvas(&canvas_id).unwrap();

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 0);
    }
}
