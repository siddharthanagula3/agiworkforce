pub mod metrics_aggregator;
pub mod report_generator;
pub mod roi_calculator;
pub mod scheduled_reports;

pub use metrics_aggregator::*;
pub use report_generator::*;
pub use roi_calculator::*;
pub use scheduled_reports::*;

use rusqlite::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Analytics state for managing ROI calculations
pub struct AnalyticsState {
    pub db: Arc<Mutex<Connection>>,
}

impl AnalyticsState {
    pub fn new(db: Connection) -> Self {
        Self {
            db: Arc::new(Mutex::new(db)),
        }
    }
}
