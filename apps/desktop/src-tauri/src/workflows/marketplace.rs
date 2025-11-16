use crate::workflows::publishing::{PublishedWorkflow, WorkflowCategory};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

/// Workflow filters for search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowFilters {
    pub category: Option<WorkflowCategory>,
    pub min_rating: Option<f64>,
    pub tags: Vec<String>,
    pub verified_only: bool,
    pub sort_by: SortOption,
    pub search_query: Option<String>,
}

impl Default for WorkflowFilters {
    fn default() -> Self {
        Self {
            category: None,
            min_rating: None,
            tags: Vec::new(),
            verified_only: false,
            sort_by: SortOption::MostCloned,
            search_query: None,
        }
    }
}

/// Sort options for workflows
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortOption {
    MostCloned,
    HighestRated,
    Newest,
    MostViewed,
    TimesSaved,
}

impl std::fmt::Display for SortOption {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SortOption::MostCloned => write!(f, "clone_count DESC"),
            SortOption::HighestRated => write!(f, "avg_rating DESC, rating_count DESC"),
            SortOption::Newest => write!(f, "created_at DESC"),
            SortOption::MostViewed => write!(f, "view_count DESC"),
            SortOption::TimesSaved => write!(f, "estimated_time_saved DESC"),
        }
    }
}

/// Workflow marketplace for discovery
pub struct WorkflowMarketplace {
    db: Arc<Mutex<Connection>>,
}

impl WorkflowMarketplace {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        Self { db }
    }

    /// Get featured workflows (editor's picks and top-rated)
    pub fn get_featured_workflows(&self, limit: usize) -> Result<Vec<PublishedWorkflow>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows
             WHERE is_featured = 1 OR (avg_rating >= 4.5 AND rating_count >= 10)
             ORDER BY is_featured DESC, avg_rating DESC, clone_count DESC
             LIMIT ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflows = stmt
            .query_map(
                rusqlite::params![limit as i64],
                Self::row_to_published_workflow,
            )
            .map_err(|e| format!("Failed to query workflows: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect workflows: {}", e))?;

        Ok(workflows)
    }

    /// Get trending workflows (most cloned in last 7 days)
    pub fn get_trending_workflows(&self, limit: usize) -> Result<Vec<PublishedWorkflow>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let seven_days_ago = chrono::Utc::now().timestamp() - (7 * 24 * 60 * 60);

        let mut stmt = conn.prepare(
            "SELECT pw.id, pw.title, pw.description, pw.category, pw.creator_id, pw.creator_name,
                    pw.workflow_definition, pw.thumbnail_url, pw.share_url, pw.clone_count,
                    pw.view_count, pw.favorite_count, pw.avg_rating, pw.rating_count,
                    pw.tags, pw.estimated_time_saved, pw.estimated_cost_saved,
                    pw.is_verified, pw.is_featured, pw.created_at, pw.updated_at,
                    COUNT(wc.id) as recent_clones
             FROM published_workflows pw
             LEFT JOIN workflow_clones wc ON pw.id = wc.workflow_id AND wc.cloned_at > ?1
             GROUP BY pw.id
             ORDER BY recent_clones DESC, pw.clone_count DESC
             LIMIT ?2"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflows = stmt
            .query_map(rusqlite::params![seven_days_ago, limit as i64], |row| {
                Self::row_to_published_workflow(row)
            })
            .map_err(|e| format!("Failed to query workflows: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect workflows: {}", e))?;

        Ok(workflows)
    }

    /// Search workflows with filters
    pub fn search_workflows(
        &self,
        filters: WorkflowFilters,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<PublishedWorkflow>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        // Build dynamic query
        let mut query = String::from(
            "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows WHERE 1=1",
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        // Add filters
        if let Some(category) = &filters.category {
            query.push_str(" AND category = ?");
            params.push(Box::new(category.to_string()));
        }

        if let Some(min_rating) = filters.min_rating {
            query.push_str(" AND avg_rating >= ?");
            params.push(Box::new(min_rating));
        }

        if filters.verified_only {
            query.push_str(" AND is_verified = 1");
        }

        if let Some(search) = &filters.search_query {
            query.push_str(" AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)");
            let search_pattern = format!("%{}%", search);
            params.push(Box::new(search_pattern.clone()));
            params.push(Box::new(search_pattern.clone()));
            params.push(Box::new(search_pattern));
        }

        // Add tag filters
        for tag in &filters.tags {
            query.push_str(" AND tags LIKE ?");
            params.push(Box::new(format!("%\"{}\"% ", tag)));
        }

        // Add sorting
        query.push_str(&format!(" ORDER BY {}", filters.sort_by));

        // Add pagination
        query.push_str(" LIMIT ? OFFSET ?");
        params.push(Box::new(limit as i64));
        params.push(Box::new(offset as i64));

        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let workflows = stmt
            .query_map(&*param_refs, Self::row_to_published_workflow)
            .map_err(|e| format!("Failed to query workflows: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect workflows: {}", e))?;

        Ok(workflows)
    }

    /// Get workflow by share URL
    pub fn get_workflow_by_share_url(&self, share_url: &str) -> Result<PublishedWorkflow, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let workflow = conn
            .query_row(
                "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows WHERE share_url = ?1",
                rusqlite::params![share_url],
                Self::row_to_published_workflow,
            )
            .map_err(|e| format!("Workflow not found: {}", e))?;

        Ok(workflow)
    }

    /// Get workflow by id
    pub fn get_workflow_by_id(&self, workflow_id: &str) -> Result<PublishedWorkflow, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let workflow = conn
            .query_row(
                "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows WHERE id = ?1",
                rusqlite::params![workflow_id],
                Self::row_to_published_workflow,
            )
            .map_err(|e| format!("Workflow not found: {}", e))?;

        Ok(workflow)
    }

    /// Get workflows by creator
    pub fn get_creator_workflows(
        &self,
        creator_id: &str,
    ) -> Result<Vec<PublishedWorkflow>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows
             WHERE creator_id = ?1
             ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflows = stmt
            .query_map(
                rusqlite::params![creator_id],
                Self::row_to_published_workflow,
            )
            .map_err(|e| format!("Failed to query workflows: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect workflows: {}", e))?;

        Ok(workflows)
    }

    /// Get workflows by category
    pub fn get_workflows_by_category(
        &self,
        category: WorkflowCategory,
        limit: usize,
    ) -> Result<Vec<PublishedWorkflow>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, title, description, category, creator_id, creator_name,
                    workflow_definition, thumbnail_url, share_url, clone_count,
                    view_count, favorite_count, avg_rating, rating_count,
                    tags, estimated_time_saved, estimated_cost_saved,
                    is_verified, is_featured, created_at, updated_at
             FROM published_workflows
             WHERE category = ?1
             ORDER BY clone_count DESC, avg_rating DESC
             LIMIT ?2",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let workflows = stmt
            .query_map(
                rusqlite::params![category.to_string(), limit as i64],
                Self::row_to_published_workflow,
            )
            .map_err(|e| format!("Failed to query workflows: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect workflows: {}", e))?;

        Ok(workflows)
    }

    /// Get category counts for navigation
    pub fn get_category_counts(&self) -> Result<Vec<(WorkflowCategory, u64)>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT category, COUNT(*) as count FROM published_workflows GROUP BY category",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let counts = stmt
            .query_map([], |row| {
                let category_str: String = row.get(0)?;
                let count: i64 = row.get(1)?;
                Ok((WorkflowCategory::from_str(&category_str), count as u64))
            })
            .map_err(|e| format!("Failed to query counts: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect counts: {}", e))?;

        Ok(counts)
    }

    /// Get popular tags
    pub fn get_popular_tags(&self, limit: usize) -> Result<Vec<(String, u64)>, String> {
        let conn = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;

        // This is a simplified approach - in production, you'd want a separate tags table
        let mut stmt = conn
            .prepare("SELECT tags FROM published_workflows")
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let mut tag_counts: std::collections::HashMap<String, u64> =
            std::collections::HashMap::new();

        let rows = stmt
            .query_map([], |row| {
                let tags_json: String = row.get(0)?;
                Ok(tags_json)
            })
            .map_err(|e| format!("Failed to query tags: {}", e))?;

        for row_result in rows {
            let tags_json = row_result.map_err(|e| format!("Failed to get row: {}", e))?;
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_json) {
                for tag in tags {
                    *tag_counts.entry(tag).or_insert(0) += 1;
                }
            }
        }

        let mut tags_vec: Vec<(String, u64)> = tag_counts.into_iter().collect();
        tags_vec.sort_by(|a, b| b.1.cmp(&a.1));
        tags_vec.truncate(limit);

        Ok(tags_vec)
    }

    /// Helper to convert database row to PublishedWorkflow
    fn row_to_published_workflow(row: &rusqlite::Row) -> rusqlite::Result<PublishedWorkflow> {
        let category_str: String = row.get(3)?;
        let tags_json: String = row.get(14)?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

        Ok(PublishedWorkflow {
            id: row.get(0)?,
            title: row.get(1)?,
            description: row.get(2)?,
            category: WorkflowCategory::from_str(&category_str),
            creator_id: row.get(4)?,
            creator_name: row.get(5)?,
            creator_avatar: None,
            workflow_definition: row.get(6)?,
            thumbnail_url: row.get(7)?,
            share_url: row.get(8)?,
            clone_count: row.get::<_, i64>(9)? as u64,
            view_count: row.get::<_, i64>(10)? as u64,
            favorite_count: row.get::<_, i64>(11)? as u64,
            rating: row.get(12)?,
            rating_count: row.get::<_, i64>(13)? as u64,
            tags,
            estimated_time_saved: row.get::<_, i64>(15)? as u64,
            estimated_cost_saved: row.get(16)?,
            is_verified: row.get::<_, i64>(17)? != 0,
            is_featured: row.get::<_, i64>(18)? != 0,
            created_at: row.get(19)?,
            updated_at: row.get(20)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sort_option_display() {
        assert_eq!(SortOption::MostCloned.to_string(), "clone_count DESC");
        assert_eq!(
            SortOption::HighestRated.to_string(),
            "avg_rating DESC, rating_count DESC"
        );
    }

    #[test]
    fn test_default_filters() {
        let filters = WorkflowFilters::default();
        assert_eq!(filters.verified_only, false);
        assert!(filters.tags.is_empty());
    }
}
