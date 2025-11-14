use crate::analytics::{ProcessMetrics, ROIReport, ToolMetrics, TrendPoint, UserMetrics};
use serde_json;
use std::collections::HashMap;

/// Report generator for various output formats
pub struct ReportGenerator;

impl ReportGenerator {
    pub fn new() -> Self {
        Self
    }

    /// Generate executive summary in Markdown format
    pub fn generate_executive_summary(
        &self,
        roi: &ROIReport,
        metrics: &[ProcessMetrics],
    ) -> String {
        let success_rate = if roi.total_automations > 0 {
            (roi.successful_executions as f64 / roi.total_automations as f64) * 100.0
        } else {
            0.0
        };

        let top_processes = self.format_top_processes(metrics);

        format!(
            "# Executive Summary - ROI Analytics Report\n\n\
             ## Report Period\n\
             - **Start Date**: {}\n\
             - **End Date**: {}\n\n\
             ## Key Metrics\n\n\
             ### Financial Impact\n\
             - **Total Cost Savings**: ${:.2}\n\
             - **Time Saved**: {:.1} hours\n\
             - **Avg Hourly Value**: ${:.2}\n\n\
             ### Operational Efficiency\n\
             - **Total Automations**: {}\n\
             - **Successful Executions**: {} ({:.1}%)\n\
             - **Failed Executions**: {}\n\
             - **Avg Execution Time**: {:.2}s\n\n\
             ### Quality & Accuracy\n\
             - **Error Reduction**: {:.1}%\n\
             - **Productivity Gain**: {:.1}%\n\n\
             ### LLM Cost Optimization\n\
             - **Total LLM Cost**: ${:.2}\n\
             - **LLM Cost Saved (via Ollama)**: ${:.2}\n\
             - **Net LLM Cost**: ${:.2}\n\n\
             ## Top Performing Processes\n\n\
             {}\n\n\
             ## Business Value Summary\n\n\
             This automation system has delivered **${:.2}** in cost savings over the reporting period. \
             With a success rate of **{:.1}%** across {} executions, the system demonstrates \
             reliable performance and significant ROI.\n\n\
             Key highlights:\n\
             - Reduced manual work by **{:.1} hours**\n\
             - Improved accuracy with **{:.1}%** error reduction\n\
             - Increased productivity by **{:.1}%**\n\
             - Optimized LLM costs through local models (Ollama)\n\n\
             ## Recommendations\n\n\
             1. **Scale High-Performing Processes**: Focus on expanding the top 3 performing process types\n\
             2. **Investigate Failures**: Address the {} failed executions to improve success rate\n\
             3. **Optimize Execution Time**: Average execution time of {:.2}s could be optimized\n\
             4. **Continue Local LLM Usage**: Ollama has saved ${:.2} in cloud LLM costs\n",
            self.format_timestamp(roi.report_start_date),
            self.format_timestamp(roi.report_end_date),
            roi.cost_savings_usd,
            roi.time_saved_hours,
            if roi.time_saved_hours > 0.0 { roi.cost_savings_usd / roi.time_saved_hours } else { 0.0 },
            roi.total_automations,
            roi.successful_executions,
            success_rate,
            roi.failed_executions,
            roi.avg_execution_time_ms / 1000.0,
            roi.error_reduction_percent,
            roi.productivity_gain_percent,
            roi.total_llm_cost_usd,
            roi.llm_cost_saved_usd,
            roi.total_llm_cost_usd - roi.llm_cost_saved_usd,
            top_processes,
            roi.cost_savings_usd,
            success_rate,
            roi.total_automations,
            roi.time_saved_hours,
            roi.error_reduction_percent,
            roi.productivity_gain_percent,
            roi.failed_executions,
            roi.avg_execution_time_ms / 1000.0,
            roi.llm_cost_saved_usd,
        )
    }

    /// Format top processes section
    fn format_top_processes(&self, metrics: &[ProcessMetrics]) -> String {
        if metrics.is_empty() {
            return "No process data available.".to_string();
        }

        let mut result = String::from(
            "| Process Type | Executions | Success Rate | Time Saved | Cost Savings |\n",
        );
        result
            .push_str("|--------------|------------|--------------|------------|-------------|\n");

        for (i, metric) in metrics.iter().take(5).enumerate() {
            result.push_str(&format!(
                "| {}. {} | {} | {:.1}% | {:.1}h | ${:.2} |\n",
                i + 1,
                metric.process_type,
                metric.execution_count,
                metric.success_rate,
                metric.time_saved_hours,
                metric.cost_savings_usd
            ));
        }

        result
    }

    /// Generate CSV export for Excel/spreadsheet import
    pub fn generate_csv_export(&self, metrics: &[ProcessMetrics]) -> String {
        let mut csv = String::from(
            "Process Type,Execution Count,Success Count,Failure Count,Success Rate %,\
             Avg Duration (s),Total Duration (s),Time Saved (h),Cost Savings ($),Error Rate %\n",
        );

        for metric in metrics {
            csv.push_str(&format!(
                "{},{},{},{},{:.2},{:.2},{:.2},{:.2},{:.2},{:.2}\n",
                metric.process_type,
                metric.execution_count,
                metric.success_count,
                metric.failure_count,
                metric.success_rate,
                metric.avg_duration_seconds,
                metric.total_duration_seconds,
                metric.time_saved_hours,
                metric.cost_savings_usd,
                metric.error_rate
            ));
        }

        csv
    }

    /// Generate user metrics CSV
    pub fn generate_user_csv(&self, users: &[UserMetrics]) -> String {
        let mut csv = String::from(
            "User ID,Automation Count,Goal Count,Time Saved (h),Cost Savings ($),\
             Most Used Tool,Most Used Process,Avg Success Rate %\n",
        );

        for user in users {
            csv.push_str(&format!(
                "{},{},{},{:.2},{:.2},{},{},{:.2}\n",
                user.user_id,
                user.automation_count,
                user.goal_count,
                user.time_saved_hours,
                user.cost_savings_usd,
                user.most_used_tool,
                user.most_used_process,
                user.avg_success_rate
            ));
        }

        csv
    }

    /// Generate tool metrics CSV
    pub fn generate_tool_csv(&self, tools: &[ToolMetrics]) -> String {
        let mut csv = String::from(
            "Tool Name,Usage Count,Success Count,Failure Count,Success Rate %,\
             Avg Execution Time (ms),Time Saved (h)\n",
        );

        for tool in tools {
            csv.push_str(&format!(
                "{},{},{},{},{:.2},{:.2},{:.2}\n",
                tool.tool_name,
                tool.usage_count,
                tool.success_count,
                tool.failure_count,
                tool.success_rate,
                tool.avg_execution_time_ms,
                tool.total_time_saved_hours
            ));
        }

        csv
    }

    /// Generate JSON export for API integration
    pub fn generate_json_export(
        &self,
        roi: &ROIReport,
        process_metrics: &[ProcessMetrics],
        user_metrics: &[UserMetrics],
        tool_metrics: &[ToolMetrics],
    ) -> Result<String, serde_json::Error> {
        let mut data = HashMap::new();
        data.insert("roi_report", serde_json::to_value(roi)?);
        data.insert("process_metrics", serde_json::to_value(process_metrics)?);
        data.insert("user_metrics", serde_json::to_value(user_metrics)?);
        data.insert("tool_metrics", serde_json::to_value(tool_metrics)?);
        data.insert(
            "generated_at",
            serde_json::to_value(chrono::Utc::now().to_rfc3339())?,
        );

        serde_json::to_string_pretty(&data)
    }

    /// Generate trend report
    pub fn generate_trend_report(&self, metric_name: &str, trends: &[TrendPoint]) -> String {
        let mut report = format!("# {} Trend Analysis\n\n", metric_name);
        report.push_str("| Date | Value |\n");
        report.push_str("|------|-------|\n");

        for trend in trends {
            report.push_str(&format!("| {} | {:.2} |\n", trend.date, trend.value));
        }

        // Calculate trend direction
        if trends.len() >= 2 {
            let first_value = trends.first().map(|t| t.value).unwrap_or(0.0);
            let last_value = trends.last().map(|t| t.value).unwrap_or(0.0);
            let change = last_value - first_value;
            let change_percent = if first_value > 0.0 {
                (change / first_value) * 100.0
            } else {
                0.0
            };

            report.push_str(&format!(
                "\n**Trend Direction**: {} ({:+.2}%)\n",
                if change > 0.0 {
                    "↑ Increasing"
                } else if change < 0.0 {
                    "↓ Decreasing"
                } else {
                    "→ Stable"
                },
                change_percent
            ));
        }

        report
    }

    /// Generate detailed process report
    pub fn generate_process_report(&self, process: &ProcessMetrics) -> String {
        format!(
            "# Process Report: {}\n\n\
             ## Overview\n\
             - **Total Executions**: {}\n\
             - **Success Rate**: {:.1}%\n\
             - **Error Rate**: {:.1}%\n\n\
             ## Performance\n\
             - **Average Duration**: {:.2} seconds\n\
             - **Total Duration**: {:.2} seconds\n\
             - **Time Saved**: {:.1} hours\n\n\
             ## Financial Impact\n\
             - **Cost Savings**: ${:.2}\n\
             - **Value per Execution**: ${:.2}\n\n\
             ## Execution Details\n\
             - **Successful**: {} executions\n\
             - **Failed**: {} executions\n\
             - **Success Rate**: {:.1}%\n",
            process.process_type,
            process.execution_count,
            process.success_rate,
            process.error_rate,
            process.avg_duration_seconds,
            process.total_duration_seconds,
            process.time_saved_hours,
            process.cost_savings_usd,
            if process.execution_count > 0 {
                process.cost_savings_usd / process.execution_count as f64
            } else {
                0.0
            },
            process.success_count,
            process.failure_count,
            process.success_rate
        )
    }

    /// Format timestamp as ISO 8601 date
    fn format_timestamp(&self, timestamp: i64) -> String {
        if let Some(dt) = chrono::DateTime::from_timestamp(timestamp, 0) {
            dt.format("%Y-%m-%d").to_string()
        } else {
            "Unknown".to_string()
        }
    }

    /// Generate comparison report between two periods
    pub fn generate_comparison_report(
        &self,
        period1_roi: &ROIReport,
        period2_roi: &ROIReport,
        period1_name: &str,
        period2_name: &str,
    ) -> String {
        let time_saved_change = period2_roi.time_saved_hours - period1_roi.time_saved_hours;
        let cost_change = period2_roi.cost_savings_usd - period1_roi.cost_savings_usd;
        let success_rate1 = if period1_roi.total_automations > 0 {
            (period1_roi.successful_executions as f64 / period1_roi.total_automations as f64)
                * 100.0
        } else {
            0.0
        };
        let success_rate2 = if period2_roi.total_automations > 0 {
            (period2_roi.successful_executions as f64 / period2_roi.total_automations as f64)
                * 100.0
        } else {
            0.0
        };

        format!(
            "# Comparison Report: {} vs {}\n\n\
             ## Time Saved\n\
             - {}: {:.1} hours\n\
             - {}: {:.1} hours\n\
             - **Change**: {:+.1} hours ({:+.1}%)\n\n\
             ## Cost Savings\n\
             - {}: ${:.2}\n\
             - {}: ${:.2}\n\
             - **Change**: ${:+.2} ({:+.1}%)\n\n\
             ## Success Rate\n\
             - {}: {:.1}%\n\
             - {}: {:.1}%\n\
             - **Change**: {:+.1}%\n\n\
             ## Automation Volume\n\
             - {}: {} executions\n\
             - {}: {} executions\n\
             - **Change**: {:+} executions ({:+.1}%)\n",
            period1_name,
            period2_name,
            period1_name,
            period1_roi.time_saved_hours,
            period2_name,
            period2_roi.time_saved_hours,
            time_saved_change,
            if period1_roi.time_saved_hours > 0.0 {
                (time_saved_change / period1_roi.time_saved_hours) * 100.0
            } else {
                0.0
            },
            period1_name,
            period1_roi.cost_savings_usd,
            period2_name,
            period2_roi.cost_savings_usd,
            cost_change,
            if period1_roi.cost_savings_usd > 0.0 {
                (cost_change / period1_roi.cost_savings_usd) * 100.0
            } else {
                0.0
            },
            period1_name,
            success_rate1,
            period2_name,
            success_rate2,
            success_rate2 - success_rate1,
            period1_name,
            period1_roi.total_automations,
            period2_name,
            period2_roi.total_automations,
            period2_roi.total_automations as i64 - period1_roi.total_automations as i64,
            if period1_roi.total_automations > 0 {
                ((period2_roi.total_automations as f64 - period1_roi.total_automations as f64)
                    / period1_roi.total_automations as f64)
                    * 100.0
            } else {
                0.0
            }
        )
    }
}

impl Default for ReportGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_report_generator_creation() {
        let generator = ReportGenerator::new();
        assert!(std::mem::size_of_val(&generator) == 0); // Zero-sized type
    }

    #[test]
    fn test_csv_generation() {
        let generator = ReportGenerator::new();
        let metrics = vec![ProcessMetrics {
            process_type: "browser_automation".to_string(),
            execution_count: 100,
            success_count: 95,
            failure_count: 5,
            success_rate: 95.0,
            avg_duration_seconds: 2.5,
            total_duration_seconds: 250.0,
            time_saved_hours: 10.0,
            cost_savings_usd: 500.0,
            error_rate: 5.0,
        }];

        let csv = generator.generate_csv_export(&metrics);
        assert!(csv.contains("browser_automation"));
        assert!(csv.contains("100"));
        assert!(csv.contains("95.00"));
    }
}
