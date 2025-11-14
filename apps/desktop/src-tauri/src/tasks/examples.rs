//! Example task executors for common use cases

use super::types::{TaskContext, TaskResult};
use anyhow::Context;

/// Example: Long-running analysis task
pub async fn example_analysis_task(ctx: TaskContext) -> anyhow::Result<String> {
    ctx.update_progress(0).await?;
    
    // Simulate analysis work
    for i in 1..=10 {
        // Check for cancellation
        ctx.check_cancellation().await?;
        
        // Simulate work
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        
        // Update progress
        ctx.update_progress((i * 10) as u8).await?;
    }
    
    Ok("Analysis complete".to_string())
}

/// Example: File processing task
pub async fn example_file_processing_task(ctx: TaskContext) -> anyhow::Result<String> {
    let payload = ctx.payload.as_ref()
        .context("File processing requires payload")?;
    
    // Parse payload (expecting JSON with file paths)
    let data: serde_json::Value = serde_json::from_str(payload)
        .context("Invalid payload format")?;
    
    let files = data["files"].as_array()
        .context("Payload missing 'files' array")?;
    
    let total = files.len();
    
    for (i, file) in files.iter().enumerate() {
        ctx.check_cancellation().await?;
        
        let file_path = file.as_str()
            .context("Invalid file path in payload")?;
        
        tracing::info!("Processing file: {}", file_path);
        
        // Simulate file processing
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        
        // Update progress
        let progress = ((i + 1) as f32 / total as f32 * 100.0) as u8;
        ctx.update_progress(progress).await?;
    }
    
    Ok(format!("Processed {} files", total))
}

/// Example: API data sync task
pub async fn example_api_sync_task(ctx: TaskContext) -> anyhow::Result<String> {
    ctx.update_progress(10).await?;
    
    // Simulate fetching data from API
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    ctx.check_cancellation().await?;
    ctx.update_progress(40).await?;
    
    // Simulate processing data
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    ctx.check_cancellation().await?;
    ctx.update_progress(70).await?;
    
    // Simulate saving to database
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    ctx.check_cancellation().await?;
    ctx.update_progress(100).await?;
    
    Ok("Sync complete: 1,234 records updated".to_string())
}

/// Example: Codebase indexing task
pub async fn example_codebase_indexing_task(ctx: TaskContext) -> anyhow::Result<String> {
    let payload = ctx.payload.as_ref()
        .context("Codebase indexing requires payload")?;
    
    let data: serde_json::Value = serde_json::from_str(payload)
        .context("Invalid payload format")?;
    
    let project_path = data["project_path"].as_str()
        .context("Payload missing 'project_path'")?;
    
    ctx.update_progress(5).await?;
    
    // Simulate scanning directory structure
    tracing::info!("Scanning project: {}", project_path);
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    ctx.check_cancellation().await?;
    ctx.update_progress(20).await?;
    
    // Simulate parsing files
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    ctx.check_cancellation().await?;
    ctx.update_progress(60).await?;
    
    // Simulate building index
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    ctx.check_cancellation().await?;
    ctx.update_progress(90).await?;
    
    // Simulate saving index
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    ctx.update_progress(100).await?;
    
    Ok(format!("Indexed project: {} (432 files, 12,845 symbols)", project_path))
}
