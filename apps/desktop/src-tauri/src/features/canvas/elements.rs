//! Canvas element types for the A2UI protocol
//!
//! Defines all visual elements that can be rendered on a canvas.

use serde::{Deserialize, Serialize};

/// Position on the canvas
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

/// Size of an element
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

impl Default for Size {
    fn default() -> Self {
        Self {
            width: 100.0,
            height: 50.0,
        }
    }
}

/// Bounding box for an element
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct Bounds {
    pub position: Position,
    pub size: Size,
}

/// Style properties for canvas elements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementStyle {
    /// Font size in pixels
    pub font_size: Option<f64>,
    /// Font family name
    pub font_family: Option<String>,
    /// Font weight (normal, bold, etc.)
    pub font_weight: Option<String>,
    /// Text color (CSS color string)
    pub color: Option<String>,
    /// Background color (CSS color string)
    pub background_color: Option<String>,
    /// Border radius in pixels
    pub border_radius: Option<f64>,
    /// Border width in pixels
    pub border_width: Option<f64>,
    /// Border color (CSS color string)
    pub border_color: Option<String>,
    /// Padding in pixels
    pub padding: Option<f64>,
    /// Opacity (0.0 to 1.0)
    pub opacity: Option<f64>,
    /// Text alignment (left, center, right)
    pub text_align: Option<String>,
}

impl Default for ElementStyle {
    fn default() -> Self {
        Self {
            font_size: Some(14.0),
            font_family: Some("Inter, sans-serif".to_string()),
            font_weight: Some("normal".to_string()),
            color: Some("#1f2937".to_string()),
            background_color: None,
            border_radius: None,
            border_width: None,
            border_color: None,
            padding: None,
            opacity: Some(1.0),
            text_align: Some("left".to_string()),
        }
    }
}

/// Chart types supported by the canvas
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChartType {
    Bar,
    Line,
    Pie,
    Doughnut,
    Area,
    Scatter,
    Radar,
}

/// Dataset for chart elements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartDataset {
    pub label: String,
    pub data: Vec<f64>,
    pub color: Option<String>,
}

/// Data for chart elements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartData {
    pub labels: Vec<String>,
    pub datasets: Vec<ChartDataset>,
}

/// Input types for form fields
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InputType {
    Text,
    Number,
    Email,
    Password,
    Textarea,
    Select,
    Checkbox,
    Radio,
    Date,
    Time,
    File,
}

/// Form field definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormField {
    pub name: String,
    pub label: String,
    pub field_type: InputType,
    pub placeholder: Option<String>,
    pub required: bool,
    pub default_value: Option<String>,
    pub options: Option<Vec<String>>,
    pub validation_pattern: Option<String>,
}

/// Interactive button element
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ButtonConfig {
    pub label: String,
    pub action_id: String,
    pub variant: ButtonVariant,
    pub disabled: bool,
}

/// Button variants
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ButtonVariant {
    Primary,
    Secondary,
    Outline,
    Ghost,
    Destructive,
}

impl Default for ButtonVariant {
    fn default() -> Self {
        Self::Primary
    }
}

/// Canvas element types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CanvasElement {
    /// Plain text element
    Text {
        id: String,
        bounds: Bounds,
        content: String,
        style: ElementStyle,
    },
    /// Image element
    Image {
        id: String,
        bounds: Bounds,
        src: String,
        alt: Option<String>,
        style: ElementStyle,
    },
    /// Chart element (bar, line, pie, etc.)
    Chart {
        id: String,
        bounds: Bounds,
        chart_type: ChartType,
        data: ChartData,
        style: ElementStyle,
    },
    /// Table element
    Table {
        id: String,
        bounds: Bounds,
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
        style: ElementStyle,
    },
    /// Form element with input fields
    Form {
        id: String,
        bounds: Bounds,
        fields: Vec<FormField>,
        submit_label: String,
        style: ElementStyle,
    },
    /// Markdown content
    Markdown {
        id: String,
        bounds: Bounds,
        content: String,
        style: ElementStyle,
    },
    /// Code block with syntax highlighting
    Code {
        id: String,
        bounds: Bounds,
        content: String,
        language: Option<String>,
        style: ElementStyle,
    },
    /// Interactive button
    Button {
        id: String,
        bounds: Bounds,
        config: ButtonConfig,
        style: ElementStyle,
    },
    /// Container for grouping elements
    Container {
        id: String,
        bounds: Bounds,
        children: Vec<String>,
        layout: ContainerLayout,
        style: ElementStyle,
    },
    /// Divider/separator
    Divider {
        id: String,
        bounds: Bounds,
        orientation: Orientation,
        style: ElementStyle,
    },
    /// Progress indicator
    Progress {
        id: String,
        bounds: Bounds,
        value: f64,
        max_value: f64,
        label: Option<String>,
        style: ElementStyle,
    },
}

/// Container layout options
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerLayout {
    Vertical,
    Horizontal,
    Grid,
    Flex,
}

impl Default for ContainerLayout {
    fn default() -> Self {
        Self::Vertical
    }
}

/// Orientation for dividers and other elements
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Horizontal,
    Vertical,
}

impl Default for Orientation {
    fn default() -> Self {
        Self::Horizontal
    }
}

impl CanvasElement {
    /// Get the element's unique ID
    pub fn id(&self) -> &str {
        match self {
            Self::Text { id, .. }
            | Self::Image { id, .. }
            | Self::Chart { id, .. }
            | Self::Table { id, .. }
            | Self::Form { id, .. }
            | Self::Markdown { id, .. }
            | Self::Code { id, .. }
            | Self::Button { id, .. }
            | Self::Container { id, .. }
            | Self::Divider { id, .. }
            | Self::Progress { id, .. } => id,
        }
    }

    /// Get the element's bounding box
    pub fn bounds(&self) -> &Bounds {
        match self {
            Self::Text { bounds, .. }
            | Self::Image { bounds, .. }
            | Self::Chart { bounds, .. }
            | Self::Table { bounds, .. }
            | Self::Form { bounds, .. }
            | Self::Markdown { bounds, .. }
            | Self::Code { bounds, .. }
            | Self::Button { bounds, .. }
            | Self::Container { bounds, .. }
            | Self::Divider { bounds, .. }
            | Self::Progress { bounds, .. } => bounds,
        }
    }

    /// Get a mutable reference to the element's bounding box
    pub fn bounds_mut(&mut self) -> &mut Bounds {
        match self {
            Self::Text { bounds, .. }
            | Self::Image { bounds, .. }
            | Self::Chart { bounds, .. }
            | Self::Table { bounds, .. }
            | Self::Form { bounds, .. }
            | Self::Markdown { bounds, .. }
            | Self::Code { bounds, .. }
            | Self::Button { bounds, .. }
            | Self::Container { bounds, .. }
            | Self::Divider { bounds, .. }
            | Self::Progress { bounds, .. } => bounds,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_element_id() {
        let element = CanvasElement::Text {
            id: "text_1".to_string(),
            bounds: Bounds::default(),
            content: "Hello".to_string(),
            style: ElementStyle::default(),
        };
        assert_eq!(element.id(), "text_1");
    }

    #[test]
    fn test_element_bounds() {
        let element = CanvasElement::Chart {
            id: "chart_1".to_string(),
            bounds: Bounds {
                position: Position { x: 10.0, y: 20.0 },
                size: Size {
                    width: 300.0,
                    height: 200.0,
                },
            },
            chart_type: ChartType::Bar,
            data: ChartData {
                labels: vec!["A".to_string()],
                datasets: vec![],
            },
            style: ElementStyle::default(),
        };
        assert_eq!(element.bounds().position.x, 10.0);
        assert_eq!(element.bounds().size.width, 300.0);
    }

    #[test]
    fn test_style_default() {
        let style = ElementStyle::default();
        assert_eq!(style.font_size, Some(14.0));
        assert_eq!(style.opacity, Some(1.0));
    }

    #[test]
    fn test_chart_type_serialization() {
        let chart_type = ChartType::Bar;
        let json = serde_json::to_string(&chart_type).unwrap();
        assert_eq!(json, "\"bar\"");
    }
}
