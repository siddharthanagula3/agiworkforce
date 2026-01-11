use crate::orchestration::workflow_engine::WorkflowDefinition;
use crate::workflows::{
    get_all_templates, PublishedWorkflow, SharePlatform, SortOption, WorkflowCategory,
    WorkflowComment, WorkflowFilters, WorkflowMarketplace, WorkflowPublisher, WorkflowSocial,
    WorkflowStats, WorkflowTemplate,
};
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::State;

/// State for marketplace operations
pub struct MarketplaceState {
    pub db: Arc<Mutex<Connection>>,
}

/// Publish a workflow to the marketplace
#[tauri::command]
pub async fn publish_workflow_to_marketplace(
    workflow_id: String,
    category: String,
    tags: Vec<String>,
    estimated_time_saved: u64,
    estimated_cost_saved: f64,
    thumbnail_url: Option<String>,
    user_id: String,
    user_name: String,
    state: State<'_, MarketplaceState>,
) -> Result<PublishedWorkflow, String> {
    // First, get the workflow from workflow_definitions table
    let db = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let workflow: WorkflowDefinition = {
        let mut stmt = db.prepare(
            "SELECT id, user_id, name, description, nodes, edges, triggers, metadata, created_at, updated_at
             FROM workflow_definitions WHERE id = ?1"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        stmt.query_row(rusqlite::params![&workflow_id], |row| {
            let nodes_json: String = row.get(4)?;
            let edges_json: String = row.get(5)?;
            let triggers_json: String = row.get(6)?;
            let metadata_json: String = row.get(7)?;

            let nodes =
                serde_json::from_str(&nodes_json).map_err(|_| rusqlite::Error::InvalidQuery)?;
            let edges =
                serde_json::from_str(&edges_json).map_err(|_| rusqlite::Error::InvalidQuery)?;
            let triggers =
                serde_json::from_str(&triggers_json).map_err(|_| rusqlite::Error::InvalidQuery)?;
            let metadata =
                serde_json::from_str(&metadata_json).map_err(|_| rusqlite::Error::InvalidQuery)?;

            Ok(WorkflowDefinition {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                nodes,
                edges,
                triggers,
                metadata,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Workflow not found: {}", e))?
    };

    drop(db); // Release lock before publishing

    let category_enum = WorkflowCategory::from_str(&category);
    let publisher = WorkflowPublisher::new(state.db.clone());

    let request = crate::workflows::publishing::PublishWorkflowRequest {
        workflow,
        publisher_id: user_id,
        publisher_name: user_name,
        category: category_enum,
        tags,
        estimated_time_saved,
        estimated_cost_saved,
        thumbnail_url,
    };

    publisher.publish_workflow(request)
}

/// Unpublish a workflow from the marketplace
#[tauri::command]
pub async fn unpublish_workflow(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let publisher = WorkflowPublisher::new(state.db.clone());
    publisher.unpublish_workflow(&workflow_id, &user_id)
}

/// Get featured workflows
#[tauri::command]
pub async fn get_featured_workflows(
    limit: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_featured_workflows(limit)
}

/// Get trending workflows
#[tauri::command]
pub async fn get_trending_workflows(
    limit: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_trending_workflows(limit)
}

/// Search workflows with filters
#[tauri::command]
pub async fn search_marketplace_workflows(
    search_query: Option<String>,
    category: Option<String>,
    min_rating: Option<f64>,
    tags: Vec<String>,
    verified_only: bool,
    sort_by: String,
    limit: usize,
    offset: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let category_enum = category.map(|c| WorkflowCategory::from_str(&c));

    let sort_option = match sort_by.as_str() {
        "most_cloned" => SortOption::MostCloned,
        "highest_rated" => SortOption::HighestRated,
        "newest" => SortOption::Newest,
        "most_viewed" => SortOption::MostViewed,
        "times_saved" => SortOption::TimesSaved,
        _ => SortOption::MostCloned,
    };

    let filters = WorkflowFilters {
        category: category_enum,
        min_rating,
        tags,
        verified_only,
        sort_by: sort_option,
        search_query,
    };

    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.search_workflows(filters, limit, offset)
}

/// Get workflow by share URL
#[tauri::command]
pub async fn get_workflow_by_share_url(
    share_url: String,
    state: State<'_, MarketplaceState>,
) -> Result<PublishedWorkflow, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let publisher = WorkflowPublisher::new(state.db.clone());

    // Increment view count
    let workflow = marketplace.get_workflow_by_share_url(&share_url)?;
    let _ = publisher.increment_view_count(&workflow.id);

    Ok(workflow)
}

/// Get workflows by creator
#[tauri::command]
pub async fn get_creator_workflows(
    creator_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_creator_workflows(&creator_id)
}

/// Get user's published workflows
#[tauri::command]
pub async fn get_my_published_workflows(
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let publisher = WorkflowPublisher::new(state.db.clone());
    publisher.get_user_published_workflows(&user_id)
}

/// Get workflows by category
#[tauri::command]
pub async fn get_workflows_by_category(
    category: String,
    limit: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let category_enum = WorkflowCategory::from_str(&category);
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_workflows_by_category(category_enum, limit)
}

/// Get category counts for navigation
#[tauri::command]
pub async fn get_category_counts(
    state: State<'_, MarketplaceState>,
) -> Result<Vec<(String, u64)>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let counts = marketplace.get_category_counts()?;

    // Convert enum to string
    Ok(counts
        .into_iter()
        .map(|(cat, count)| (cat.to_string(), count))
        .collect())
}

/// Get popular tags
#[tauri::command]
pub async fn get_popular_tags(
    limit: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<(String, u64)>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_popular_tags(limit)
}

/// Clone a workflow to user's workspace
#[tauri::command]
pub async fn clone_marketplace_workflow(
    workflow_id: String,
    user_id: String,
    user_name: String,
    state: State<'_, MarketplaceState>,
) -> Result<String, String> {
    let publisher = WorkflowPublisher::new(state.db.clone());
    publisher.clone_workflow(&workflow_id, &user_id, &user_name)
}

/// Fork a workflow (editable copy with link to original)
#[tauri::command]
pub async fn fork_marketplace_workflow(
    workflow_id: String,
    user_id: String,
    user_name: String,
    state: State<'_, MarketplaceState>,
) -> Result<String, String> {
    let publisher = WorkflowPublisher::new(state.db.clone());
    publisher.fork_workflow(&workflow_id, &user_id, &user_name)
}

/// Rate a workflow
#[tauri::command]
pub async fn rate_workflow(
    workflow_id: String,
    user_id: String,
    rating: u8,
    comment: Option<String>,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.rate_workflow(&workflow_id, &user_id, rating, comment)
}

/// Get user's rating for a workflow
#[tauri::command]
pub async fn get_user_workflow_rating(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Option<u8>, String> {
    let social = WorkflowSocial::new(state.db.clone());
    let rating = social.get_user_rating(&workflow_id, &user_id)?;
    Ok(rating.map(|r| r.rating))
}

/// Comment on a workflow
#[tauri::command]
pub async fn comment_on_workflow(
    workflow_id: String,
    user_id: String,
    user_name: String,
    comment: String,
    state: State<'_, MarketplaceState>,
) -> Result<String, String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.comment_on_workflow(&workflow_id, &user_id, &user_name, comment)
}

/// Get workflow comments
#[tauri::command]
pub async fn get_workflow_comments(
    workflow_id: String,
    limit: usize,
    offset: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<WorkflowComment>, String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.get_workflow_comments(&workflow_id, limit, offset)
}

/// Delete a comment
#[tauri::command]
pub async fn delete_workflow_comment(
    comment_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.delete_comment(&comment_id, &user_id)
}

/// Favorite a workflow
#[tauri::command]
pub async fn favorite_workflow(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.favorite_workflow(&workflow_id, &user_id)
}

/// Unfavorite a workflow
#[tauri::command]
pub async fn unfavorite_workflow(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.unfavorite_workflow(&workflow_id, &user_id)
}

/// Check if workflow is favorited
#[tauri::command]
pub async fn is_workflow_favorited(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<bool, String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.is_favorited(&workflow_id, &user_id)
}

/// Get user's favorited workflows
#[tauri::command]
pub async fn get_user_favorites(
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let social = WorkflowSocial::new(state.db.clone());
    let workflow_ids = social.get_user_favorites(&user_id)?;

    // Get full workflow details for each favorited workflow
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let mut workflows = Vec::new();

    for workflow_id in workflow_ids {
        if let Ok(workflow) = marketplace.get_workflow_by_id(&workflow_id) {
            workflows.push(workflow);
        }
    }

    Ok(workflows)
}

/// Get user's cloned workflows
#[tauri::command]
pub async fn get_user_clones(
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let mut stmt = db
        .prepare(
            "SELECT
            wc.id as clone_id,
            wc.workflow_id,
            pw.title as workflow_title,
            pw.description as workflow_description,
            pw.category,
            pw.creator_name,
            wc.cloned_at,
            pw.clone_count as original_clone_count,
            pw.avg_rating as original_avg_rating
         FROM workflow_clones wc
         JOIN published_workflows pw ON wc.workflow_id = pw.id
         WHERE wc.cloner_id = ?1
         ORDER BY wc.cloned_at DESC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let clones = stmt
        .query_map(rusqlite::params![&user_id], |row| {
            Ok(serde_json::json!({
                "clone_id": row.get::<_, String>(0)?,
                "workflow_id": row.get::<_, String>(1)?,
                "workflow_title": row.get::<_, String>(2)?,
                "workflow_description": row.get::<_, String>(3)?,
                "category": row.get::<_, String>(4)?,
                "creator_name": row.get::<_, String>(5)?,
                "cloned_at": row.get::<_, i64>(6)?,
                "original_clone_count": row.get::<_, i64>(7)?,
                "original_avg_rating": row.get::<_, f64>(8)?,
            }))
        })
        .map_err(|e| format!("Failed to query clones: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect results: {}", e))?;

    Ok(clones)
}

/// Generate share link for a workflow
#[tauri::command]
pub async fn share_workflow(
    workflow_id: String,
    platform: String,
    state: State<'_, MarketplaceState>,
) -> Result<String, String> {
    let platform_enum = match platform.as_str() {
        "twitter" => SharePlatform::Twitter,
        "linkedin" => SharePlatform::LinkedIn,
        "reddit" => SharePlatform::Reddit,
        "hackernews" => SharePlatform::HackerNews,
        "email" => SharePlatform::Email,
        _ => SharePlatform::DirectLink,
    };

    let social = WorkflowSocial::new(state.db.clone());
    social.share_workflow(&workflow_id, platform_enum)
}

/// Get workflow statistics
#[tauri::command]
pub async fn get_workflow_stats(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<WorkflowStats, String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.get_workflow_stats(&workflow_id)
}

/// Get all pre-built workflow templates
#[tauri::command]
pub async fn get_workflow_templates() -> Result<Vec<WorkflowTemplate>, String> {
    Ok(get_all_templates())
}

/// Get workflow templates by category
#[tauri::command]
pub async fn get_workflow_templates_by_category(
    category: String,
) -> Result<Vec<WorkflowTemplate>, String> {
    let category_enum = WorkflowCategory::from_str(&category);
    let all_templates = get_all_templates();

    Ok(all_templates
        .into_iter()
        .filter(|t| t.category == category_enum)
        .collect())
}

/// Search workflow templates by query
#[tauri::command]
pub async fn search_workflow_templates(query: String) -> Result<Vec<WorkflowTemplate>, String> {
    let all_templates = get_all_templates();
    let query_lower = query.to_lowercase();

    Ok(all_templates
        .into_iter()
        .filter(|t| {
            t.title.to_lowercase().contains(&query_lower)
                || t.description.to_lowercase().contains(&query_lower)
                || t.tags
                    .iter()
                    .any(|tag| tag.to_lowercase().contains(&query_lower))
        })
        .collect())
}
