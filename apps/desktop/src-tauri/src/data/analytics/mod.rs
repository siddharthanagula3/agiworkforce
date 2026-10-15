pub mod metrics_aggregator;
pub mod report_generator;
pub mod roi_calculator;

pub use metrics_aggregator::*;
pub use report_generator::*;
pub use roi_calculator::*;

use rusqlite::Connection;
use std::sync::Arc;
use std::sync::Mutex;

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
