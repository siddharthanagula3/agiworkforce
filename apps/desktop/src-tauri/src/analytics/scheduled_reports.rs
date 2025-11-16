use crate::analytics::{MetricsAggregator, ROICalculator, ReportGenerator};
use rusqlite::Connection;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Scheduled report generator for automated reporting
pub struct ScheduledReportGenerator {
    calculator: ROICalculator,
    aggregator: MetricsAggregator,
    generator: ReportGenerator,
}

impl ScheduledReportGenerator {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        let calculator = ROICalculator::new(db.clone());
        let aggregator = MetricsAggregator::new(db.clone());
        let generator = ReportGenerator::new();

        Self {
            calculator,
            aggregator,
            generator,
        }
    }

    /// Generate weekly ROI report
    pub async fn generate_weekly_report(&self, user_id: &str) -> Result<String, String> {
        let end = chrono::Utc::now().timestamp();
        let start = end - (7 * 24 * 60 * 60); // 7 days ago

        let roi = self
            .calculator
            .calculate_roi(start, end)
            .await
            .map_err(|e| format!("Failed to calculate ROI: {}", e))?;

        let process_metrics = self
            .aggregator
            .aggregate_by_process_type(start, end)
            .await
            .map_err(|e| format!("Failed to aggregate metrics: {}", e))?;

        let report = self
            .generator
            .generate_executive_summary(&roi, &process_metrics);

        // Save snapshot
        self.calculator
            .save_snapshot(user_id, None, &roi)
            .await
            .map_err(|e| format!("Failed to save snapshot: {}", e))?;

        Ok(report)
    }

    /// Generate monthly ROI report
    pub async fn generate_monthly_report(&self, user_id: &str) -> Result<String, String> {
        let end = chrono::Utc::now().timestamp();
        let start = end - (30 * 24 * 60 * 60); // 30 days ago

        let roi = self
            .calculator
            .calculate_roi(start, end)
            .await
            .map_err(|e| format!("Failed to calculate ROI: {}", e))?;

        let process_metrics = self
            .aggregator
            .aggregate_by_process_type(start, end)
            .await
            .map_err(|e| format!("Failed to aggregate metrics: {}", e))?;

        let tool_metrics = self
            .aggregator
            .aggregate_by_tool(start, end)
            .await
            .map_err(|e| format!("Failed to aggregate tool metrics: {}", e))?;

        // Generate comprehensive report
        let mut report = self
            .generator
            .generate_executive_summary(&roi, &process_metrics);
        report.push_str("\n\n---\n\n");
        report.push_str("## Detailed Metrics\n\n");

        // Add top processes
        if !process_metrics.is_empty() {
            report.push_str("### Process Performance\n\n");
            for (i, metric) in process_metrics.iter().take(10).enumerate() {
                report.push_str(&format!(
                    "{}. **{}**: {} executions, {:.1}% success rate, ${:.2} savings\n",
                    i + 1,
                    metric.process_type,
                    metric.execution_count,
                    metric.success_rate,
                    metric.cost_savings_usd
                ));
            }
            report.push_str("\n");
        }

        // Add tool usage
        if !tool_metrics.is_empty() {
            report.push_str("### Tool Usage\n\n");
            for (i, metric) in tool_metrics.iter().take(10).enumerate() {
                report.push_str(&format!(
                    "{}. **{}**: {} uses, {:.1}% success rate\n",
                    i + 1,
                    metric.tool_name,
                    metric.usage_count,
                    metric.success_rate
                ));
            }
        }

        // Save snapshot
        self.calculator
            .save_snapshot(user_id, None, &roi)
            .await
            .map_err(|e| format!("Failed to save snapshot: {}", e))?;

        Ok(report)
    }

    /// Generate comparison report (current month vs previous month)
    pub async fn generate_comparison_report(&self) -> Result<String, String> {
        let now = chrono::Utc::now().timestamp();
        let current_month_start = now - (30 * 24 * 60 * 60);
        let previous_month_start = now - (60 * 24 * 60 * 60);
        let previous_month_end = current_month_start;

        let current_roi = self
            .calculator
            .calculate_roi(current_month_start, now)
            .await
            .map_err(|e| format!("Failed to calculate current ROI: {}", e))?;

        let previous_roi = self
            .calculator
            .calculate_roi(previous_month_start, previous_month_end)
            .await
            .map_err(|e| format!("Failed to calculate previous ROI: {}", e))?;

        let report = self.generator.generate_comparison_report(
            &previous_roi,
            &current_roi,
            "Previous Month",
            "Current Month",
        );

        Ok(report)
    }

    /// Generate trend report for the last N days
    pub async fn generate_trend_report(&self, metric: &str, days: usize) -> Result<String, String> {
        let trends = self
            .aggregator
            .calculate_trends(metric, days)
            .await
            .map_err(|e| format!("Failed to calculate trends: {}", e))?;

        let report = self.generator.generate_trend_report(metric, &trends);

        Ok(report)
    }

    /// Generate full analytics package (all reports combined)
    pub async fn generate_full_package(&self, user_id: &str) -> Result<AnalyticsPackage, String> {
        let end = chrono::Utc::now().timestamp();
        let start = end - (30 * 24 * 60 * 60);

        let roi = self
            .calculator
            .calculate_roi(start, end)
            .await
            .map_err(|e| format!("Failed to calculate ROI: {}", e))?;

        let process_metrics = self
            .aggregator
            .aggregate_by_process_type(start, end)
            .await
            .map_err(|e| format!("Failed to aggregate process metrics: {}", e))?;

        let user_metrics = self
            .aggregator
            .aggregate_by_user(start, end)
            .await
            .map_err(|e| format!("Failed to aggregate user metrics: {}", e))?;

        let tool_metrics = self
            .aggregator
            .aggregate_by_tool(start, end)
            .await
            .map_err(|e| format!("Failed to aggregate tool metrics: {}", e))?;

        // Generate reports in different formats
        let executive_summary = self
            .generator
            .generate_executive_summary(&roi, &process_metrics);
        let process_csv = self.generator.generate_csv_export(&process_metrics);
        let user_csv = self.generator.generate_user_csv(&user_metrics);
        let tool_csv = self.generator.generate_tool_csv(&tool_metrics);
        let json_export = self
            .generator
            .generate_json_export(&roi, &process_metrics, &user_metrics, &tool_metrics)
            .map_err(|e| format!("Failed to generate JSON: {}", e))?;

        // Save snapshot
        self.calculator
            .save_snapshot(user_id, None, &roi)
            .await
            .map_err(|e| format!("Failed to save snapshot: {}", e))?;

        Ok(AnalyticsPackage {
            executive_summary,
            process_csv,
            user_csv,
            tool_csv,
            json_export,
            roi,
        })
    }
}

/// Complete analytics package with all report formats
#[derive(Debug, Clone)]
pub struct AnalyticsPackage {
    pub executive_summary: String,
    pub process_csv: String,
    pub user_csv: String,
    pub tool_csv: String,
    pub json_export: String,
    pub roi: crate::analytics::ROIReport,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[tokio::test]
    async fn test_scheduled_report_generator_creation() {
        let conn = Connection::open_in_memory().unwrap();
        let db = Arc::new(Mutex::new(conn));
        let generator = ScheduledReportGenerator::new(db);

        // Without any schema/data the report generation should fail gracefully
        assert!(generator.generate_trend_report("roi", 7).await.is_err());
    }
}
