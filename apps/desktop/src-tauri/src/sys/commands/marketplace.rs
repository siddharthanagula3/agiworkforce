use crate::core::orchestration::workflow_engine::WorkflowDefinition;
use crate::features::workflows::{
    get_all_templates, PublishedWorkflow, SharePlatform, SortOption, WorkflowCategory,
    WorkflowComment, WorkflowFilters, WorkflowMarketplace, WorkflowPublisher, WorkflowRating,
    WorkflowSocial, WorkflowStats, WorkflowTemplate,
};
use chrono::Utc;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct MarketplaceState {
    pub db: Arc<Mutex<Connection>>,
}

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
    let db = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let workflow: WorkflowDefinition = {
        let mut stmt = db.prepare(
            "SELECT id, user_id, name, description, nodes, edges, triggers, metadata, created_at, updated_a
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

    drop(db);

    let category_enum = WorkflowCategory::from_str(&category);
    let publisher = WorkflowPublisher::new(state.db.clone());

    let request = crate::features::workflows::publishing::PublishWorkflowRequest {
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

#[tauri::command]
pub async fn unpublish_workflow(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let publisher = WorkflowPublisher::new(state.db.clone());
    publisher.unpublish_workflow(&workflow_id, &user_id)
}

#[tauri::command]
pub async fn get_featured_workflows(
    limit: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_featured_workflows(limit)
}

#[tauri::command]
pub async fn get_trending_workflows(
    limit: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_trending_workflows(limit)
}

#[tauri::command]
pub async fn search_marketplace_workflows(
    search_query: Option<String>,
    category: Option<String>,
    min_rating: Option<f64>,
    tags: Vec<String>,
    verified_only: bool,
    featured_only: bool,
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
        featured_only,
        sort_by: sort_option,
        search_query,
    };

    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.search_workflows(filters, limit, offset)
}

#[tauri::command]
pub async fn get_workflow_by_share_url(
    share_url: String,
    state: State<'_, MarketplaceState>,
) -> Result<PublishedWorkflow, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let publisher = WorkflowPublisher::new(state.db.clone());

    let workflow = marketplace.get_workflow_by_share_url(&share_url)?;
    let _ = publisher.increment_view_count(&workflow.id);

    Ok(workflow)
}

#[tauri::command]
pub async fn get_creator_workflows(
    creator_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_creator_workflows(&creator_id)
}

#[tauri::command]
pub async fn get_my_published_workflows(
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let publisher = WorkflowPublisher::new(state.db.clone());
    publisher.get_user_published_workflows(&user_id)
}

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

#[tauri::command]
pub async fn get_category_counts(
    state: State<'_, MarketplaceState>,
) -> Result<Vec<(String, u64)>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let counts = marketplace.get_category_counts()?;

    Ok(counts
        .into_iter()
        .map(|(cat, count)| (cat.to_string(), count))
        .collect())
}

#[tauri::command]
pub async fn get_popular_tags(
    limit: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<(String, u64)>, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_popular_tags(limit)
}

#[tauri::command]
pub async fn clone_marketplace_workflow(
    workflow_id: String,
    user_id: String,
    user_name: String,
    _customize_title: Option<String>,
    state: State<'_, MarketplaceState>,
) -> Result<String, String> {
    let publisher = WorkflowPublisher::new(state.db.clone());
    publisher.clone_workflow(&workflow_id, &user_id, &user_name)
}

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

#[tauri::command]
pub async fn delete_workflow_comment(
    comment_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.delete_comment(&comment_id, &user_id)
}

#[tauri::command]
pub async fn favorite_workflow(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.favorite_workflow(&workflow_id, &user_id)
}

#[tauri::command]
pub async fn unfavorite_workflow(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.unfavorite_workflow(&workflow_id, &user_id)
}

#[tauri::command]
pub async fn is_workflow_favorited(
    workflow_id: String,
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<bool, String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.is_favorited(&workflow_id, &user_id)
}

#[tauri::command]
pub async fn get_user_favorites(
    user_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    let social = WorkflowSocial::new(state.db.clone());
    let workflow_ids = social.get_user_favorites(&user_id)?;

    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let mut workflows = Vec::new();

    for workflow_id in workflow_ids {
        if let Ok(workflow) = marketplace.get_workflow_by_id(&workflow_id) {
            workflows.push(workflow);
        }
    }

    Ok(workflows)
}

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

#[tauri::command]
pub async fn get_workflow_stats(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<WorkflowStats, String> {
    let social = WorkflowSocial::new(state.db.clone());
    social.get_workflow_stats(&workflow_id)
}

#[tauri::command]
pub async fn get_workflow_templates() -> Result<Vec<WorkflowTemplate>, String> {
    Ok(get_all_templates())
}

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

// Alias for search_marketplace_workflows to match frontend expectations
#[tauri::command]
pub async fn get_published_workflows(
    category: Option<String>,
    sort_by: String,
    limit: usize,
    offset: usize,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<PublishedWorkflow>, String> {
    search_marketplace_workflows(
        None,
        category,
        None,
        vec![],
        false,
        false,
        sort_by,
        limit,
        offset,
        state,
    )
    .await
}

// Get workflow by ID - wraps WorkflowMarketplace::get_workflow_by_id
#[tauri::command]
pub async fn get_workflow_by_id(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<PublishedWorkflow, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    marketplace.get_workflow_by_id(&workflow_id)
}

// Get workflow reviews (ratings with comments)
#[tauri::command]
pub async fn get_workflow_reviews(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<Vec<WorkflowRating>, String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let mut stmt = db
        .prepare(
            "SELECT workflow_id, user_id, rating, comment, created_at
             FROM workflow_ratings
             WHERE workflow_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let reviews = stmt
        .query_map(rusqlite::params![&workflow_id], |row| {
            Ok(WorkflowRating {
                workflow_id: row.get(0)?,
                user_id: row.get(1)?,
                rating: row.get(2)?,
                comment: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query reviews: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect results: {}", e))?;

    Ok(reviews)
}

// Workflow analytics structure
#[derive(serde::Serialize)]
pub struct WorkflowAnalytics {
    pub workflow_id: String,
    pub total_views: i64,
    pub total_clones: i64,
    pub total_favorites: i64,
    pub views_last_7_days: i64,
    pub clones_last_7_days: i64,
    pub conversion_rate: f64,
    pub avg_rating: f64,
    pub total_reviews: i64,
    pub trending_score: f64,
}

// Get workflow analytics
#[tauri::command]
pub async fn get_workflow_analytics(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<WorkflowAnalytics, String> {
    let social = WorkflowSocial::new(state.db.clone());
    let stats = social.get_workflow_stats(&workflow_id)?;

    // Calculate additional analytics
    let db = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    // Get views in last 7 days
    let views_last_7_days: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(view_count), 0) FROM workflow_views
             WHERE workflow_id = ?1 AND viewed_at > ?2",
            rusqlite::params![&workflow_id, Utc::now().timestamp() - 7 * 24 * 60 * 60],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Get clones in last 7 days
    let clones_last_7_days: i64 = db
        .query_row(
            "SELECT COALESCE(COUNT(*), 0) FROM workflow_clones
             WHERE workflow_id = ?1 AND cloned_at > ?2",
            rusqlite::params![&workflow_id, Utc::now().timestamp() - 7 * 24 * 60 * 60],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Get average rating and review count
    let (avg_rating, total_reviews): (f64, i64) = db
        .query_row(
            "SELECT COALESCE(AVG(rating), 0), COUNT(*) FROM workflow_ratings WHERE workflow_id = ?1",
            rusqlite::params![&workflow_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap_or((0.0, 0));

    // Calculate conversion rate
    let conversion_rate = if stats.view_count > 0 {
        (stats.clone_count as f64 / stats.view_count as f64) * 100.0
    } else {
        0.0
    };

    // Calculate trending score
    let trending_score = (stats.clone_count as f64 * 2.0
        + views_last_7_days as f64
        + clones_last_7_days as f64 * 3.0
        + avg_rating * 10.0)
        / 10.0;

    Ok(WorkflowAnalytics {
        workflow_id,
        total_views: stats.view_count as i64,
        total_clones: stats.clone_count as i64,
        total_favorites: stats.favorite_count as i64,
        views_last_7_days,
        clones_last_7_days,
        conversion_rate,
        avg_rating,
        total_reviews,
        trending_score,
    })
}

// Alias for publish_workflow_to_marketplace to match frontend expectations
#[tauri::command]
pub async fn publish_workflow(
    workflow_id: String,
    _title: String,
    _description: String,
    category: String,
    tags: Vec<String>,
    thumbnail_url: Option<String>,
    estimated_time_saved: u64,
    estimated_cost_saved: f64,
    _license: String,
    state: State<'_, MarketplaceState>,
) -> Result<PublishedWorkflow, String> {
    // Get user info from workflow - use block to ensure lock is released before await
    let (user_id, user_name) = {
        let db = state
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        db.query_row(
            "SELECT user_id, name FROM workflow_definitions WHERE id = ?1",
            rusqlite::params![&workflow_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Workflow not found: {}", e))?
    };

    publish_workflow_to_marketplace(
        workflow_id,
        category,
        tags,
        estimated_time_saved,
        estimated_cost_saved,
        thumbnail_url,
        user_id,
        user_name,
        state,
    )
    .await
}

// Get workflow share URL
#[tauri::command]
pub async fn get_workflow_share_url(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<String, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let workflow = marketplace.get_workflow_by_id(&workflow_id)?;

    // Return the share_url directly from the workflow
    Ok(workflow.share_url)
}

// Get workflow embed code
#[tauri::command]
pub async fn get_workflow_embed_code(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<String, String> {
    let marketplace = WorkflowMarketplace::new(state.db.clone());
    let workflow = marketplace.get_workflow_by_id(&workflow_id)?;

    let embed_code = format!(
        r#"<iframe src="{}" width="100%" height="600" frameborder="0"></iframe>"#,
        workflow.share_url
    );

    Ok(embed_code)
}

// Track workflow view
#[tauri::command]
pub async fn increment_workflow_view_count(
    workflow_id: String,
    state: State<'_, MarketplaceState>,
) -> Result<(), String> {
    let db = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let now = Utc::now().timestamp();

    db.execute(
        "INSERT INTO workflow_views (workflow_id, viewed_at) VALUES (?1, ?2)",
        rusqlite::params![&workflow_id, now],
    )
    .map_err(|e| format!("Failed to track view: {}", e))?;

    // Also increment the view count in published_workflows
    db.execute(
        "UPDATE published_workflows SET view_count = view_count + 1 WHERE id = ?1",
        rusqlite::params![&workflow_id],
    )
    .map_err(|e| format!("Failed to update view count: {}", e))?;

    Ok(())
}
