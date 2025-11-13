use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::{MetricsSnapshot, PeriodStats, RealtimeMetricsCollector};
use crate::realtime::{RealtimeEvent, RealtimeServer};

/// Type of metrics update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UpdateType {
    AutomationCompleted,
    NewEmployeeHired,
    MilestoneReached,
}

/// Metrics update event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsUpdate {
    pub update_type: UpdateType,
    pub delta: MetricsSnapshot,
    pub new_totals: PeriodStats,
}

/// Live metrics stream for real-time updates
pub struct LiveMetricsStream {
    realtime_server: Arc<RealtimeServer>,
    collector: Arc<RealtimeMetricsCollector>,
}

impl LiveMetricsStream {
    pub fn new(
        realtime_server: Arc<RealtimeServer>,
        collector: Arc<RealtimeMetricsCollector>,
    ) -> Self {
        Self {
            realtime_server,
            collector,
        }
    }

    /// Emit a metrics update to a specific user
    pub async fn emit_update(&self, user_id: &str, update: MetricsUpdate) -> Result<(), String> {
        let event = RealtimeEvent::MetricsUpdated {
            metrics: serde_json::to_value(update)
                .map_err(|e| format!("Failed to serialize update: {}", e))?,
        };

        self.realtime_server
            .broadcast_to_user(user_id, event)
            .await
            .map_err(|e| format!("Failed to broadcast update: {}", e))?;

        Ok(())
    }

    /// Emit an automation completion update
    pub async fn emit_automation_completed(
        &self,
        user_id: &str,
        delta: MetricsSnapshot,
    ) -> Result<(), String> {
        let new_totals = self.collector.get_realtime_stats(user_id).await?.today;

        let update = MetricsUpdate {
            update_type: UpdateType::AutomationCompleted,
            delta,
            new_totals,
        };

        self.emit_update(user_id, update).await
    }

    /// Emit a milestone reached event
    pub async fn emit_milestone(
        &self,
        user_id: &str,
        milestone_title: &str,
        hours_saved: f64,
        cost_saved: f64,
    ) -> Result<(), String> {
        let event = RealtimeEvent::MilestoneReached {
            milestone: serde_json::json!({
                "title": milestone_title,
                "hours_saved": hours_saved,
                "cost_saved": cost_saved,
            }),
        };

        self.realtime_server
            .broadcast_to_user(user_id, event)
            .await
            .map_err(|e| format!("Failed to broadcast milestone: {}", e))?;

        Ok(())
    }
}
