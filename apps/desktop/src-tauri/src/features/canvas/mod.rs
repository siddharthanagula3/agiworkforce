//! Canvas feature module for AGI-driven UI
//!
//! This module implements the A2UI (Agent-to-UI) protocol, enabling the AGI
//! to dynamically compose and update visual elements in a canvas interface.
//!
//! # Architecture
//!
//! - `elements`: Defines all canvas element types (text, charts, tables, forms, etc.)
//! - `renderer`: Manages canvas instances and emits events to the frontend
//! - `a2ui`: The A2UI protocol handler that translates AGI commands into canvas operations
//!
//! # Example
//!
//! ```ignore
//! use std::sync::Arc;
//! use crate::features::canvas::{A2UIProtocol, A2UICommand, CanvasManager};
//!
//! let manager = Arc::new(CanvasManager::new());
//! let protocol = A2UIProtocol::new(manager);
//!
//! // AGI creates a canvas
//! let response = protocol.execute(A2UICommand::CreateCanvas {
//!     name: "Sales Report".to_string(),
//!     width: Some(800.0),
//!     height: Some(600.0),
//! });
//!
//! // AGI adds a chart
//! protocol.execute(A2UICommand::AddChart {
//!     canvas_id: None, // uses active canvas
//!     chart_type: ChartType::Bar,
//!     labels: vec!["Q1", "Q2", "Q3", "Q4"].into_iter().map(String::from).collect(),
//!     datasets: vec![A2UIDataset {
//!         label: "Revenue".to_string(),
//!         data: vec![100.0, 150.0, 200.0, 180.0],
//!         color: Some("#3b82f6".to_string()),
//!     }],
//!     x: None,
//!     y: None,
//!     width: Some(400.0),
//!     height: Some(300.0),
//! });
//! ```

pub mod a2ui;
pub mod elements;
pub mod renderer;

pub use a2ui::*;
pub use elements::*;
pub use renderer::*;
