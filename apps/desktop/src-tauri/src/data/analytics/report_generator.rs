use crate::data::analytics::{ProcessMetrics, ROIReport, ToolMetrics, UserMetrics};
use serde_json;
use std::collections::HashMap;

pub struct ReportGenerator;

impl ReportGenerator {
    pub fn new() -> Self {
        Self
    }

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
            "# Executive Summary - ROI Analytics Report\n\n
             ## Report Period\n
             - **Start Date**: {}\n
             - **End Date**: {}\n\n
             ## Key Metrics\n\n
             ### Financial Impact\n
             - **Total Cost Savings**: ${:.2}\n
             - **Time Saved**: {:.1} hours\n
             - **Avg Hourly Value**: ${:.2}\n\n
             ### Operational Efficiency\n
             - **Total Automations**: {}\n
             - **Successful Executions**: {} ({:.1}%)\n
             - **Failed Executions**: {}\n
             - **Avg Execution Time**: {:.2}s\n\n
             ### Quality & Accuracy\n
             - **Error Reduction**: {:.1}%\n
             - **Productivity Gain**: {:.1}%\n\n
             ### LLM Cost Optimization\n
             - **Total LLM Cost**: ${:.2}\n
             - **LLM Cost Saved (via Ollama)**: ${:.2}\n
             - **Net LLM Cost**: ${:.2}\n\n
             ## Top Performing Processes\n\n
             {}\n\n
             ## Business Value Summary\n\n
             This automation system has delivered **${:.2}** in cost savings over the reporting period.
             With a success rate of **{:.1}%** across {} executions, the system demonstrates
             reliable performance and significant ROI.\n\n
             Key highlights:\n
             - Reduced manual work by **{:.1} hours**\n
             - Improved accuracy with **{:.1}%** error reduction\n
             - Increased productivity by **{:.1}%**\n
             - Optimized LLM costs through local models (Ollama)\n\n
             ## Recommendations\n\n
             1. **Scale High-Performing Processes**: Focus on expanding the top 3 performing process types\n
             2. **Investigate Failures**: Address the {} failed executions to improve success rate\n
             3. **Optimize Execution Time**: Average execution time of {:.2}s could be optimized\n
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

    pub fn generate_csv_export(&self, metrics: &[ProcessMetrics]) -> String {
        let mut csv = String::from(
            "Process Type,Execution Count,Success Count,Failure Count,Success Rate %,
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

    fn format_timestamp(&self, timestamp: i64) -> String {
        if let Some(dt) = chrono::DateTime::from_timestamp(timestamp, 0) {
            dt.format("%Y-%m-%d").to_string()
        } else {
            "Unknown".to_string()
        }
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
        assert!(std::mem::size_of_val(&generator) == 0);
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
