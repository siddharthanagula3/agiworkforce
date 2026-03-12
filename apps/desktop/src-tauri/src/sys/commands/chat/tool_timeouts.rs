use super::state::{
    DEFAULT_TOOL_TIMEOUT_SECS, FAST_METADATA_FOLLOWUP_INVOKE_TIMEOUT_SECS,
    FAST_METADATA_FOLLOWUP_TOTAL_TIMEOUT_SECS, FAST_METADATA_TOOL_LOOP_MAX_ITERATIONS,
    FAST_METADATA_TOOL_LOOP_MAX_SECS, FAST_TOOL_TIMEOUT_SECS, FOLLOWUP_INVOKE_TIMEOUT_SECS,
    FOLLOWUP_TOTAL_TIMEOUT_SECS, LONG_RUNNING_TOOL_TIMEOUT_SECS,
    MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS, STREAMING_TOOL_LOOP_MAX_ITERATIONS,
    STREAMING_TOOL_LOOP_MAX_SECS,
};
use super::tools;

pub(super) fn resolve_tool_execution_timeout_secs(tool_name: &str) -> u64 {
    let normalized = tool_name.to_lowercase();
    if normalized == "file_read"
        || normalized == "file_list"
        || normalized.contains("list_directory")
        || normalized.contains("filesystem__list_directory")
        || normalized.contains("list_allowed_directories")
        || normalized.contains("filesystem__list_allowed_directories")
        || normalized.contains("read_text_file")
        || normalized.contains("filesystem__read_text_file")
    {
        return FAST_TOOL_TIMEOUT_SECS;
    }

    if normalized == "terminal_execute"
        || normalized.starts_with("document_create_")
        || normalized == "video_generate"
        || normalized == "media_generate_video"
        || normalized == "image_generate"
        || normalized == "media_generate_image"
    {
        return LONG_RUNNING_TOOL_TIMEOUT_SECS;
    }

    DEFAULT_TOOL_TIMEOUT_SECS
}

pub(super) fn is_fast_metadata_tool(tool_name: &str) -> bool {
    resolve_tool_execution_timeout_secs(tool_name) == FAST_TOOL_TIMEOUT_SECS
}

/// Check if a tool is a media generation tool (image/video generation).
/// These tools require extended followup timeouts because the generated
/// output is large and the followup model needs extra time to process it.
pub(super) fn is_media_generation_tool(tool_name: &str) -> bool {
    let normalized = tool_name.to_lowercase();
    normalized == "image_generate"
        || normalized == "media_generate_image"
        || normalized == "video_generate"
        || normalized == "media_generate_video"
}

pub(super) fn is_fast_metadata_batch(tool_results: &[tools::ChatToolResult]) -> bool {
    !tool_results.is_empty()
        && tool_results
            .iter()
            .all(|result| is_fast_metadata_tool(&result.tool_name))
}

pub(super) fn did_fast_metadata_batch_fail(tool_results: &[tools::ChatToolResult]) -> bool {
    is_fast_metadata_batch(tool_results) && tool_results.iter().all(|result| !result.success)
}

pub(super) fn build_fast_metadata_failure_message(tool_failure_summaries: &[String]) -> String {
    if tool_failure_summaries.is_empty() {
        return "I couldn't access local files right now. Please select or allow a project folder and retry.".to_string();
    }

    format!(
        "I couldn't access local files right now because file access tools failed: {}. \
Please select or allow a project folder and retry.",
        tool_failure_summaries.join("; ")
    )
}

pub(super) fn resolve_followup_invoke_timeout_secs(
    only_fast_metadata_tools: bool,
    has_media_tools: bool,
) -> u64 {
    if only_fast_metadata_tools {
        FAST_METADATA_FOLLOWUP_INVOKE_TIMEOUT_SECS
    } else if has_media_tools {
        MEDIA_FOLLOWUP_INVOKE_TIMEOUT_SECS
    } else {
        FOLLOWUP_INVOKE_TIMEOUT_SECS
    }
}

pub(super) fn resolve_followup_total_timeout_secs(only_fast_metadata_tools: bool) -> u64 {
    if only_fast_metadata_tools {
        FAST_METADATA_FOLLOWUP_TOTAL_TIMEOUT_SECS
    } else {
        FOLLOWUP_TOTAL_TIMEOUT_SECS
    }
}

pub(super) fn resolve_streaming_tool_loop_max_secs(only_fast_metadata_tools: bool) -> u64 {
    if only_fast_metadata_tools {
        FAST_METADATA_TOOL_LOOP_MAX_SECS
    } else {
        STREAMING_TOOL_LOOP_MAX_SECS
    }
}

pub(super) fn resolve_streaming_tool_loop_max_iterations(only_fast_metadata_tools: bool) -> usize {
    if only_fast_metadata_tools {
        FAST_METADATA_TOOL_LOOP_MAX_ITERATIONS
    } else {
        STREAMING_TOOL_LOOP_MAX_ITERATIONS
    }
}
