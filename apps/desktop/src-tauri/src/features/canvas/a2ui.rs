//! A2UI Protocol - Agent-to-UI communication protocol
//!
//! Allows the AGI to compose and update visual elements in the canvas.

use super::elements::*;
use super::renderer::CanvasManager;
use crate::sys::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// A2UI command from the AGI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case")]
pub enum A2UICommand {
    /// Create a new canvas
    CreateCanvas {
        name: String,
        width: Option<f64>,
        height: Option<f64>,
    },
    /// Add text to canvas
    AddText {
        canvas_id: Option<String>,
        text: String,
        x: Option<f64>,
        y: Option<f64>,
        style: Option<ElementStyle>,
    },
    /// Add image to canvas
    AddImage {
        canvas_id: Option<String>,
        src: String,
        alt: Option<String>,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
        height: Option<f64>,
    },
    /// Add a chart
    AddChart {
        canvas_id: Option<String>,
        chart_type: ChartType,
        labels: Vec<String>,
        datasets: Vec<A2UIDataset>,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
        height: Option<f64>,
    },
    /// Add a table
    AddTable {
        canvas_id: Option<String>,
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
        x: Option<f64>,
        y: Option<f64>,
    },
    /// Add a form
    AddForm {
        canvas_id: Option<String>,
        fields: Vec<A2UIFormField>,
        submit_label: Option<String>,
        x: Option<f64>,
        y: Option<f64>,
    },
    /// Add markdown content
    AddMarkdown {
        canvas_id: Option<String>,
        content: String,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
    },
    /// Add code block
    AddCode {
        canvas_id: Option<String>,
        content: String,
        language: Option<String>,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
    },
    /// Update an element
    UpdateElement {
        canvas_id: Option<String>,
        element_id: String,
        updates: serde_json::Value,
    },
    /// Remove an element
    RemoveElement {
        canvas_id: Option<String>,
        element_id: String,
    },
    /// Clear the canvas
    ClearCanvas { canvas_id: Option<String> },
    /// Show a notification on canvas
    ShowNotification {
        canvas_id: Option<String>,
        message: String,
        notification_type: NotificationType,
        duration_ms: Option<u32>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2UIDataset {
    pub label: String,
    pub data: Vec<f64>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2UIFormField {
    pub name: String,
    pub label: String,
    pub field_type: InputType,
    pub placeholder: Option<String>,
    pub required: bool,
    pub options: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationType {
    Info,
    Success,
    Warning,
    Error,
}

/// A2UI response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2UIResponse {
    pub success: bool,
    pub element_id: Option<String>,
    pub canvas_id: Option<String>,
    pub error: Option<String>,
}

impl A2UIResponse {
    pub fn success(element_id: Option<String>, canvas_id: Option<String>) -> Self {
        Self {
            success: true,
            element_id,
            canvas_id,
            error: None,
        }
    }

    pub fn error(message: &str) -> Self {
        Self {
            success: false,
            element_id: None,
            canvas_id: None,
            error: Some(message.to_string()),
        }
    }
}

/// A2UI protocol handler
pub struct A2UIProtocol {
    canvas_manager: Arc<CanvasManager>,
    next_element_id: std::sync::atomic::AtomicU64,
    auto_layout: AutoLayoutConfig,
}

#[derive(Debug, Clone)]
pub struct AutoLayoutConfig {
    pub start_x: f64,
    pub start_y: f64,
    pub spacing: f64,
    pub default_width: f64,
    pub default_height: f64,
}

impl Default for AutoLayoutConfig {
    fn default() -> Self {
        Self {
            start_x: 20.0,
            start_y: 20.0,
            spacing: 20.0,
            default_width: 400.0,
            default_height: 200.0,
        }
    }
}

impl A2UIProtocol {
    pub fn new(canvas_manager: Arc<CanvasManager>) -> Self {
        Self {
            canvas_manager,
            next_element_id: std::sync::atomic::AtomicU64::new(1),
            auto_layout: AutoLayoutConfig::default(),
        }
    }

    fn generate_element_id(&self) -> String {
        let id = self
            .next_element_id
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        format!("elem_{}", id)
    }

    fn get_or_active_canvas(&self, canvas_id: Option<String>) -> Result<String> {
        if let Some(id) = canvas_id {
            Ok(id)
        } else {
            self.canvas_manager
                .get_active()?
                .ok_or_else(|| Error::Generic("No active canvas".into()))
        }
    }

    /// Execute an A2UI command
    pub fn execute(&self, command: A2UICommand) -> A2UIResponse {
        match self.execute_internal(command) {
            Ok(response) => response,
            Err(e) => A2UIResponse::error(&e.to_string()),
        }
    }

    fn execute_internal(&self, command: A2UICommand) -> Result<A2UIResponse> {
        match command {
            A2UICommand::CreateCanvas {
                name,
                width,
                height,
            } => {
                let id = self.canvas_manager.create_canvas(
                    &name,
                    width.unwrap_or(800.0),
                    height.unwrap_or(600.0),
                )?;
                self.canvas_manager.set_active(Some(id.clone()))?;
                Ok(A2UIResponse::success(None, Some(id)))
            }

            A2UICommand::AddText {
                canvas_id,
                text,
                x,
                y,
                style,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                let element_id = self.generate_element_id();

                let element = CanvasElement::Text {
                    id: element_id.clone(),
                    bounds: Bounds {
                        position: Position {
                            x: x.unwrap_or(self.auto_layout.start_x),
                            y: y.unwrap_or(self.auto_layout.start_y),
                        },
                        size: Size {
                            width: self.auto_layout.default_width,
                            height: 50.0,
                        },
                    },
                    content: text,
                    style: style.unwrap_or_default(),
                };

                self.canvas_manager.add_element(&canvas_id, element)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::AddImage {
                canvas_id,
                src,
                alt,
                x,
                y,
                width,
                height,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                let element_id = self.generate_element_id();

                let element = CanvasElement::Image {
                    id: element_id.clone(),
                    bounds: Bounds {
                        position: Position {
                            x: x.unwrap_or(self.auto_layout.start_x),
                            y: y.unwrap_or(self.auto_layout.start_y),
                        },
                        size: Size {
                            width: width.unwrap_or(self.auto_layout.default_width),
                            height: height.unwrap_or(self.auto_layout.default_height),
                        },
                    },
                    src,
                    alt,
                    style: ElementStyle::default(),
                };

                self.canvas_manager.add_element(&canvas_id, element)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::AddChart {
                canvas_id,
                chart_type,
                labels,
                datasets,
                x,
                y,
                width,
                height,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                let element_id = self.generate_element_id();

                let element = CanvasElement::Chart {
                    id: element_id.clone(),
                    bounds: Bounds {
                        position: Position {
                            x: x.unwrap_or(self.auto_layout.start_x),
                            y: y.unwrap_or(self.auto_layout.start_y),
                        },
                        size: Size {
                            width: width.unwrap_or(self.auto_layout.default_width),
                            height: height.unwrap_or(self.auto_layout.default_height),
                        },
                    },
                    chart_type,
                    data: ChartData {
                        labels,
                        datasets: datasets
                            .into_iter()
                            .map(|d| ChartDataset {
                                label: d.label,
                                data: d.data,
                                color: d.color,
                            })
                            .collect(),
                    },
                    style: ElementStyle::default(),
                };

                self.canvas_manager.add_element(&canvas_id, element)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::AddTable {
                canvas_id,
                headers,
                rows,
                x,
                y,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                let element_id = self.generate_element_id();

                let element = CanvasElement::Table {
                    id: element_id.clone(),
                    bounds: Bounds {
                        position: Position {
                            x: x.unwrap_or(self.auto_layout.start_x),
                            y: y.unwrap_or(self.auto_layout.start_y),
                        },
                        size: Size {
                            width: self.auto_layout.default_width,
                            height: (rows.len() as f64 + 1.0) * 40.0,
                        },
                    },
                    headers,
                    rows,
                    style: ElementStyle::default(),
                };

                self.canvas_manager.add_element(&canvas_id, element)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::AddForm {
                canvas_id,
                fields,
                submit_label,
                x,
                y,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                let element_id = self.generate_element_id();

                let form_fields: Vec<FormField> = fields
                    .into_iter()
                    .map(|f| FormField {
                        name: f.name,
                        label: f.label,
                        field_type: f.field_type,
                        placeholder: f.placeholder,
                        required: f.required,
                        default_value: None,
                        options: f.options,
                        validation_pattern: None,
                    })
                    .collect();

                let element = CanvasElement::Form {
                    id: element_id.clone(),
                    bounds: Bounds {
                        position: Position {
                            x: x.unwrap_or(self.auto_layout.start_x),
                            y: y.unwrap_or(self.auto_layout.start_y),
                        },
                        size: Size {
                            width: self.auto_layout.default_width,
                            height: (form_fields.len() as f64 * 60.0) + 50.0,
                        },
                    },
                    fields: form_fields,
                    submit_label: submit_label.unwrap_or_else(|| "Submit".to_string()),
                    style: ElementStyle::default(),
                };

                self.canvas_manager.add_element(&canvas_id, element)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::AddMarkdown {
                canvas_id,
                content,
                x,
                y,
                width,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                let element_id = self.generate_element_id();

                let element = CanvasElement::Markdown {
                    id: element_id.clone(),
                    bounds: Bounds {
                        position: Position {
                            x: x.unwrap_or(self.auto_layout.start_x),
                            y: y.unwrap_or(self.auto_layout.start_y),
                        },
                        size: Size {
                            width: width.unwrap_or(self.auto_layout.default_width),
                            height: self.auto_layout.default_height,
                        },
                    },
                    content,
                    style: ElementStyle::default(),
                };

                self.canvas_manager.add_element(&canvas_id, element)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::AddCode {
                canvas_id,
                content,
                language,
                x,
                y,
                width,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                let element_id = self.generate_element_id();

                let element = CanvasElement::Code {
                    id: element_id.clone(),
                    bounds: Bounds {
                        position: Position {
                            x: x.unwrap_or(self.auto_layout.start_x),
                            y: y.unwrap_or(self.auto_layout.start_y),
                        },
                        size: Size {
                            width: width.unwrap_or(self.auto_layout.default_width),
                            height: self.auto_layout.default_height,
                        },
                    },
                    content,
                    language,
                    style: ElementStyle::default(),
                };

                self.canvas_manager.add_element(&canvas_id, element)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::UpdateElement {
                canvas_id,
                element_id,
                updates,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;

                // Apply updates to the element
                self.canvas_manager
                    .update_element(&canvas_id, &element_id, |element| {
                        // Update bounds if provided
                        if let Some(x) = updates.get("x").and_then(|v| v.as_f64()) {
                            element.bounds_mut().position.x = x;
                        }
                        if let Some(y) = updates.get("y").and_then(|v| v.as_f64()) {
                            element.bounds_mut().position.y = y;
                        }
                        if let Some(width) = updates.get("width").and_then(|v| v.as_f64()) {
                            element.bounds_mut().size.width = width;
                        }
                        if let Some(height) = updates.get("height").and_then(|v| v.as_f64()) {
                            element.bounds_mut().size.height = height;
                        }

                        // Update content for text elements
                        if let Some(content) = updates.get("content").and_then(|v| v.as_str()) {
                            if let CanvasElement::Text {
                                content: ref mut c, ..
                            } = element
                            {
                                *c = content.to_string();
                            } else if let CanvasElement::Markdown {
                                content: ref mut c, ..
                            } = element
                            {
                                *c = content.to_string();
                            } else if let CanvasElement::Code {
                                content: ref mut c, ..
                            } = element
                            {
                                *c = content.to_string();
                            }
                        }
                    })?;

                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::RemoveElement {
                canvas_id,
                element_id,
            } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                self.canvas_manager
                    .remove_element(&canvas_id, &element_id)?;
                Ok(A2UIResponse::success(Some(element_id), Some(canvas_id)))
            }

            A2UICommand::ClearCanvas { canvas_id } => {
                let canvas_id = self.get_or_active_canvas(canvas_id)?;
                self.canvas_manager.clear_canvas(&canvas_id)?;
                Ok(A2UIResponse::success(None, Some(canvas_id)))
            }

            A2UICommand::ShowNotification {
                canvas_id,
                message,
                notification_type,
                duration_ms,
            } => {
                // Notifications are handled by emitting an event to the frontend
                // The canvas_id is optional for notifications
                let canvas_id =
                    canvas_id.or_else(|| self.canvas_manager.get_active().ok().flatten());

                // In a full implementation, this would emit a notification event
                // For now, we just acknowledge the command
                let _ = (message, notification_type, duration_ms);

                Ok(A2UIResponse::success(None, canvas_id))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_canvas_command() {
        let manager = Arc::new(CanvasManager::new());
        let protocol = A2UIProtocol::new(manager.clone());

        let response = protocol.execute(A2UICommand::CreateCanvas {
            name: "Test Canvas".to_string(),
            width: Some(800.0),
            height: Some(600.0),
        });

        assert!(response.success);
        assert!(response.canvas_id.is_some());

        let canvas_id = response.canvas_id.unwrap();
        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.name, "Test Canvas");
    }

    #[test]
    fn test_add_text_command() {
        let manager = Arc::new(CanvasManager::new());
        let protocol = A2UIProtocol::new(manager.clone());

        // First create a canvas
        let create_response = protocol.execute(A2UICommand::CreateCanvas {
            name: "Test".to_string(),
            width: None,
            height: None,
        });
        let canvas_id = create_response.canvas_id.unwrap();

        // Add text
        let response = protocol.execute(A2UICommand::AddText {
            canvas_id: Some(canvas_id.clone()),
            text: "Hello World".to_string(),
            x: Some(100.0),
            y: Some(50.0),
            style: None,
        });

        assert!(response.success);
        assert!(response.element_id.is_some());

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 1);
    }

    #[test]
    fn test_add_chart_command() {
        let manager = Arc::new(CanvasManager::new());
        let protocol = A2UIProtocol::new(manager.clone());

        protocol.execute(A2UICommand::CreateCanvas {
            name: "Chart Test".to_string(),
            width: None,
            height: None,
        });

        let response = protocol.execute(A2UICommand::AddChart {
            canvas_id: None, // Use active canvas
            chart_type: ChartType::Bar,
            labels: vec!["Jan".to_string(), "Feb".to_string(), "Mar".to_string()],
            datasets: vec![A2UIDataset {
                label: "Sales".to_string(),
                data: vec![100.0, 150.0, 200.0],
                color: Some("#3b82f6".to_string()),
            }],
            x: None,
            y: None,
            width: Some(400.0),
            height: Some(300.0),
        });

        assert!(response.success);
        assert!(response.element_id.is_some());
    }

    #[test]
    fn test_remove_element_command() {
        let manager = Arc::new(CanvasManager::new());
        let protocol = A2UIProtocol::new(manager.clone());

        protocol.execute(A2UICommand::CreateCanvas {
            name: "Test".to_string(),
            width: None,
            height: None,
        });

        let add_response = protocol.execute(A2UICommand::AddText {
            canvas_id: None,
            text: "To be removed".to_string(),
            x: None,
            y: None,
            style: None,
        });

        let element_id = add_response.element_id.unwrap();
        let canvas_id = add_response.canvas_id.unwrap();

        let remove_response = protocol.execute(A2UICommand::RemoveElement {
            canvas_id: Some(canvas_id.clone()),
            element_id: element_id.clone(),
        });

        assert!(remove_response.success);

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 0);
    }

    #[test]
    fn test_clear_canvas_command() {
        let manager = Arc::new(CanvasManager::new());
        let protocol = A2UIProtocol::new(manager.clone());

        let create_response = protocol.execute(A2UICommand::CreateCanvas {
            name: "Test".to_string(),
            width: None,
            height: None,
        });
        let canvas_id = create_response.canvas_id.unwrap();

        // Add multiple elements
        for i in 0..3 {
            protocol.execute(A2UICommand::AddText {
                canvas_id: Some(canvas_id.clone()),
                text: format!("Text {}", i),
                x: None,
                y: None,
                style: None,
            });
        }

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 3);

        // Clear the canvas
        let clear_response = protocol.execute(A2UICommand::ClearCanvas {
            canvas_id: Some(canvas_id.clone()),
        });

        assert!(clear_response.success);

        let canvas = manager.get_canvas(&canvas_id).unwrap();
        assert_eq!(canvas.elements.len(), 0);
    }

    #[test]
    fn test_no_active_canvas_error() {
        let manager = Arc::new(CanvasManager::new());
        let protocol = A2UIProtocol::new(manager);

        let response = protocol.execute(A2UICommand::AddText {
            canvas_id: None,
            text: "Test".to_string(),
            x: None,
            y: None,
            style: None,
        });

        assert!(!response.success);
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("No active canvas"));
    }

    #[test]
    fn test_a2ui_response_constructors() {
        let success =
            A2UIResponse::success(Some("elem_1".to_string()), Some("canvas_1".to_string()));
        assert!(success.success);
        assert_eq!(success.element_id, Some("elem_1".to_string()));
        assert_eq!(success.canvas_id, Some("canvas_1".to_string()));
        assert!(success.error.is_none());

        let error = A2UIResponse::error("Something went wrong");
        assert!(!error.success);
        assert!(error.element_id.is_none());
        assert!(error.canvas_id.is_none());
        assert_eq!(error.error, Some("Something went wrong".to_string()));
    }
}
