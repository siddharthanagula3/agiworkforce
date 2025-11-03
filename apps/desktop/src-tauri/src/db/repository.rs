use chrono::{DateTime, Duration, TimeZone, Utc};
use rusqlite::{params, Connection, Result, Row};

use super::models::{
    AutomationHistory, Conversation, ConversationCostBreakdown, CostTimeseriesPoint, Message,
    MessageRole, OverlayEvent, OverlayEventType, ProviderCostBreakdown, Setting, TaskType,
};

// ============================================================================
// Conversation Repository
// ============================================================================

pub fn create_conversation(conn: &Connection, title: String) -> Result<i64> {
    conn.execute(
        "INSERT INTO conversations (title) VALUES (?1)",
        params![title],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_conversation(conn: &Connection, id: i64) -> Result<Conversation> {
    conn.query_row(
        "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?1",
        params![id],
        map_conversation,
    )
}

pub fn list_conversations(conn: &Connection, limit: i64, offset: i64) -> Result<Vec<Conversation>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, created_at, updated_at
         FROM conversations
         ORDER BY updated_at DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let conversations = stmt
        .query_map(params![limit, offset], map_conversation)?
        .collect::<Result<Vec<_>>>()?;

    Ok(conversations)
}

pub fn update_conversation_title(conn: &Connection, id: i64, title: String) -> Result<()> {
    conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![title, id],
    )?;
    Ok(())
}

pub fn delete_conversation(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
    Ok(())
}

fn map_conversation(row: &Row) -> Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: parse_datetime(&row.get::<_, String>(2)?),
        updated_at: parse_datetime(&row.get::<_, String>(3)?),
    })
}

// ============================================================================
// Message Repository
// ============================================================================

pub fn create_message(conn: &Connection, message: &Message) -> Result<i64> {
    // Update conversation's updated_at timestamp
    conn.execute(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![message.conversation_id],
    )?;

    conn.execute(
        "INSERT INTO messages (conversation_id, role, content, tokens, cost, provider, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            message.conversation_id,
            message.role.as_str(),
            message.content,
            message.tokens,
            message.cost,
            message.provider,
            message.model,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_message(conn: &Connection, id: i64) -> Result<Message> {
    conn.query_row(
        "SELECT id, conversation_id, role, content, tokens, cost, provider, model, created_at
         FROM messages
         WHERE id = ?1",
        params![id],
        map_message,
    )
}

pub fn list_messages(conn: &Connection, conversation_id: i64) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, tokens, cost, provider, model, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY created_at ASC",
    )?;

    let messages = stmt
        .query_map(params![conversation_id], map_message)?
        .collect::<Result<Vec<_>>>()?;

    Ok(messages)
}

pub fn delete_message(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn update_message_content(conn: &Connection, id: i64, content: String) -> Result<Message> {
    conn.execute(
        "UPDATE messages SET content = ?1 WHERE id = ?2",
        params![content, id],
    )?;

    get_message(conn, id)
}

fn map_message(row: &Row) -> Result<Message> {
    let role_str: String = row.get(2)?;
    let role = MessageRole::from_str(&role_str).ok_or_else(|| rusqlite::Error::InvalidQuery)?;

    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role,
        content: row.get(3)?,
        tokens: row.get(4)?,
        cost: row.get(5)?,
        provider: row.get(6)?,
        model: row.get(7)?,
        created_at: parse_datetime(&row.get::<_, String>(8)?),
    })
}

// ============================================================================
// Cost analytics
// ============================================================================

pub fn sum_cost_since(conn: &Connection, since: DateTime<Utc>) -> Result<f64> {
    conn.query_row(
        "SELECT COALESCE(SUM(cost), 0.0)
         FROM messages
         WHERE role = 'assistant'
           AND cost IS NOT NULL
           AND created_at >= ?1",
        params![to_sqlite_timestamp(since)],
        |row| row.get(0),
    )
}

pub fn list_cost_timeseries(
    conn: &Connection,
    days: i64,
    provider: Option<&str>,
    model: Option<&str>,
) -> Result<Vec<CostTimeseriesPoint>> {
    let span = days.max(1) - 1;
    let cutoff = start_of_day(Utc::now() - Duration::days(span));

    let mut sql = String::from(
        "SELECT DATE(created_at) AS bucket,
                COALESCE(SUM(cost), 0.0) AS total_cost
         FROM messages
         WHERE role = 'assistant'
           AND cost IS NOT NULL
           AND created_at >= ?1",
    );

    let mut params: Vec<String> = vec![to_sqlite_timestamp(cutoff)];

    if let Some(provider_value) = provider {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND provider = ?{}", placeholder));
        params.push(provider_value.to_string());
    }

    if let Some(model_value) = model {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND model = ?{}", placeholder));
        params.push(model_value.to_string());
    }

    sql.push_str(" GROUP BY bucket ORDER BY bucket ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(CostTimeseriesPoint {
            date: row.get(0)?,
            total_cost: row.get(1)?,
        })
    })?;

    rows.collect::<Result<Vec<_>>>()
}

pub fn list_cost_by_provider(
    conn: &Connection,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    provider: Option<&str>,
    model: Option<&str>,
) -> Result<Vec<ProviderCostBreakdown>> {
    let mut sql = String::from(
        "SELECT COALESCE(provider, 'unknown') AS provider,
                       COALESCE(SUM(cost), 0.0) AS total_cost
                FROM messages
                WHERE role = 'assistant'
                  AND cost IS NOT NULL",
    );

    let mut params: Vec<String> = Vec::new();

    if let Some(start_dt) = start {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND created_at >= ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(start_dt)));
    }

    if let Some(end_dt) = end {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND created_at < ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(
            end_dt + Duration::days(1),
        )));
    }

    if let Some(provider_value) = provider {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND provider = ?{}", placeholder));
        params.push(provider_value.to_string());
    }

    if let Some(model_value) = model {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND model = ?{}", placeholder));
        params.push(model_value.to_string());
    }

    sql.push_str(" GROUP BY provider ORDER BY total_cost DESC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(ProviderCostBreakdown {
            provider: row.get(0)?,
            total_cost: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>>>()
}

pub fn list_top_conversations_by_cost(
    conn: &Connection,
    limit: usize,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> Result<Vec<ConversationCostBreakdown>> {
    list_top_conversations_by_cost_filtered(conn, limit, start, end, None, None)
}

pub fn list_top_conversations_by_cost_filtered(
    conn: &Connection,
    limit: usize,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    provider: Option<&str>,
    model: Option<&str>,
) -> Result<Vec<ConversationCostBreakdown>> {
    let base = "SELECT m.conversation_id,
                       c.title,
                       COALESCE(SUM(m.cost), 0.0) AS total_cost
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                WHERE m.role = 'assistant'
                  AND m.cost IS NOT NULL";

    let mut sql = String::from(base);
    let mut params: Vec<String> = Vec::new();

    if let Some(start_dt) = start {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.created_at >= ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(start_dt)));
    }

    if let Some(end_dt) = end {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.created_at < ?{}", placeholder));
        params.push(to_sqlite_timestamp(start_of_day(
            end_dt + Duration::days(1),
        )));
    }

    if let Some(provider_value) = provider {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.provider = ?{}", placeholder));
        params.push(provider_value.to_string());
    }

    if let Some(model_value) = model {
        let placeholder = params.len() + 1;
        sql.push_str(&format!(" AND m.model = ?{}", placeholder));
        params.push(model_value.to_string());
    }

    sql.push_str(" GROUP BY m.conversation_id, c.title ORDER BY total_cost DESC");
    sql.push_str(&format!(" LIMIT {}", limit));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(ConversationCostBreakdown {
            conversation_id: row.get(0)?,
            title: row.get(1)?,
            total_cost: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>>>()
}

// ============================================================================
// Settings Repository
// ============================================================================

pub fn set_setting(conn: &Connection, key: String, value: String, encrypted: bool) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, encrypted) VALUES (?1, ?2, ?3)",
        params![key, value, encrypted as i32],
    )?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Setting> {
    conn.query_row(
        "SELECT key, value, encrypted FROM settings WHERE key = ?1",
        params![key],
        map_setting,
    )
}

pub fn list_settings(conn: &Connection) -> Result<Vec<Setting>> {
    let mut stmt = conn.prepare("SELECT key, value, encrypted FROM settings ORDER BY key")?;

    let settings = stmt
        .query_map([], map_setting)?
        .collect::<Result<Vec<_>>>()?;

    Ok(settings)
}

pub fn delete_setting(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

fn map_setting(row: &Row) -> Result<Setting> {
    Ok(Setting {
        key: row.get(0)?,
        value: row.get(1)?,
        encrypted: row.get::<_, i32>(2)? != 0,
    })
}

// ============================================================================
// Automation History Repository
// ============================================================================

pub fn create_automation_history(conn: &Connection, history: &AutomationHistory) -> Result<i64> {
    conn.execute(
        "INSERT INTO automation_history (task_type, success, error, duration_ms, cost)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            history.task_type.as_str(),
            history.success as i32,
            history.error,
            history.duration_ms,
            history.cost,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_automation_history(conn: &Connection, id: i64) -> Result<AutomationHistory> {
    conn.query_row(
        "SELECT id, task_type, success, error, duration_ms, cost, created_at
         FROM automation_history
         WHERE id = ?1",
        params![id],
        map_automation_history,
    )
}

pub fn list_automation_history(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<AutomationHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_type, success, error, duration_ms, cost, created_at
         FROM automation_history
         ORDER BY created_at DESC
         LIMIT ?1 OFFSET ?2",
    )?;

    let history = stmt
        .query_map(params![limit, offset], map_automation_history)?
        .collect::<Result<Vec<_>>>()?;

    Ok(history)
}

pub fn get_automation_stats(conn: &Connection) -> Result<(i64, i64, f64, f64)> {
    conn.query_row(
        "SELECT
            COUNT(*) as total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
            AVG(duration_ms) as avg_duration,
            SUM(COALESCE(cost, 0)) as total_cost
         FROM automation_history",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
}

fn map_automation_history(row: &Row) -> Result<AutomationHistory> {
    let task_type_str: String = row.get(1)?;
    let task_type =
        TaskType::from_str(&task_type_str).ok_or_else(|| rusqlite::Error::InvalidQuery)?;

    Ok(AutomationHistory {
        id: row.get(0)?,
        task_type,
        success: row.get::<_, i32>(2)? != 0,
        error: row.get(3)?,
        duration_ms: row.get(4)?,
        cost: row.get(5)?,
        created_at: parse_datetime(&row.get::<_, String>(6)?),
    })
}

// ============================================================================
// Overlay Events Repository
// ============================================================================

pub fn create_overlay_event(conn: &Connection, event: &OverlayEvent) -> Result<i64> {
    conn.execute(
        "INSERT INTO overlay_events (event_type, x, y, data) VALUES (?1, ?2, ?3, ?4)",
        params![event.event_type.as_str(), event.x, event.y, event.data],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_overlay_event(conn: &Connection, id: i64) -> Result<OverlayEvent> {
    conn.query_row(
        "SELECT id, event_type, x, y, data, timestamp FROM overlay_events WHERE id = ?1",
        params![id],
        map_overlay_event,
    )
}

pub fn list_overlay_events(
    conn: &Connection,
    start_time: Option<DateTime<Utc>>,
    end_time: Option<DateTime<Utc>>,
) -> Result<Vec<OverlayEvent>> {
    let query = match (start_time, end_time) {
        (Some(_), Some(_)) => {
            "SELECT id, event_type, x, y, data, timestamp
             FROM overlay_events
             WHERE timestamp >= ?1 AND timestamp <= ?2
             ORDER BY timestamp ASC"
        }
        (Some(_), None) => {
            "SELECT id, event_type, x, y, data, timestamp
             FROM overlay_events
             WHERE timestamp >= ?1
             ORDER BY timestamp ASC"
        }
        _ => {
            "SELECT id, event_type, x, y, data, timestamp
             FROM overlay_events
             ORDER BY timestamp ASC"
        }
    };

    let mut stmt = conn.prepare(query)?;

    let events = match (start_time, end_time) {
        (Some(start), Some(end)) => stmt.query_map(
            params![start.to_rfc3339(), end.to_rfc3339()],
            map_overlay_event,
        )?,
        (Some(start), None) => stmt.query_map(params![start.to_rfc3339()], map_overlay_event)?,
        _ => stmt.query_map([], map_overlay_event)?,
    }
    .collect::<Result<Vec<_>>>()?;

    Ok(events)
}

pub fn delete_overlay_events_before(conn: &Connection, before: DateTime<Utc>) -> Result<usize> {
    Ok(conn.execute(
        "DELETE FROM overlay_events WHERE timestamp < ?1",
        params![before.to_rfc3339()],
    )?)
}

fn map_overlay_event(row: &Row) -> Result<OverlayEvent> {
    let event_type_str: String = row.get(1)?;
    let event_type =
        OverlayEventType::from_str(&event_type_str).ok_or_else(|| rusqlite::Error::InvalidQuery)?;

    Ok(OverlayEvent {
        id: row.get(0)?,
        event_type,
        x: row.get(2)?,
        y: row.get(3)?,
        data: row.get(4)?,
        timestamp: parse_datetime(&row.get::<_, String>(5)?),
    })
}

// ============================================================================
// Utilities
// ============================================================================

fn parse_datetime(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| {
            // Fallback for SQLite's CURRENT_TIMESTAMP format
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
                .map(|dt| dt.and_utc())
                .unwrap_or_else(|_| Utc::now())
        })
}

fn to_sqlite_timestamp(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn start_of_day(dt: DateTime<Utc>) -> DateTime<Utc> {
    let date = dt.date_naive();
    let naive = date
        .and_hms_opt(0, 0, 0)
        .expect("00:00:00 should be a valid time");
    Utc.from_utc_datetime(&naive)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use chrono::Utc;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_conversation_crud() {
        let conn = setup_test_db();

        // Create
        let id = create_conversation(&conn, "Test Conversation".to_string()).unwrap();
        assert!(id > 0);

        // Read
        let conv = get_conversation(&conn, id).unwrap();
        assert_eq!(conv.title, "Test Conversation");

        // Update
        update_conversation_title(&conn, id, "Updated Title".to_string()).unwrap();
        let conv = get_conversation(&conn, id).unwrap();
        assert_eq!(conv.title, "Updated Title");

        // List
        let convs = list_conversations(&conn, 10, 0).unwrap();
        assert_eq!(convs.len(), 1);

        // Delete
        delete_conversation(&conn, id).unwrap();
        assert!(get_conversation(&conn, id).is_err());
    }

    #[test]
    fn test_message_crud() {
        let conn = setup_test_db();

        let conv_id = create_conversation(&conn, "Test".to_string()).unwrap();
        let msg = Message::new(conv_id, MessageRole::User, "Hello".to_string());

        // Create
        let id = create_message(&conn, &msg).unwrap();
        assert!(id > 0);

        // Read
        let retrieved = get_message(&conn, id).unwrap();
        assert_eq!(retrieved.content, "Hello");
        assert_eq!(retrieved.role, MessageRole::User);

        // List
        let messages = list_messages(&conn, conv_id).unwrap();
        assert_eq!(messages.len(), 1);
    }

    #[test]
    fn test_settings_crud() {
        let conn = setup_test_db();

        // Set
        set_setting(&conn, "theme".to_string(), "dark".to_string(), false).unwrap();

        // Get
        let setting = get_setting(&conn, "theme").unwrap();
        assert_eq!(setting.value, "dark");
        assert!(!setting.encrypted);

        // List
        let settings = list_settings(&conn).unwrap();
        assert!(settings.iter().any(|s| s.key == "theme"));

        // Delete
        delete_setting(&conn, "theme").unwrap();
        assert!(get_setting(&conn, "theme").is_err());
    }

    #[test]
    fn test_cost_analytics_empty() {
        let conn = setup_test_db();

        let total = sum_cost_since(&conn, Utc::now()).unwrap();
        assert_eq!(total, 0.0);

        let timeseries = list_cost_timeseries(&conn, 7, None, None).unwrap();
        assert!(timeseries.is_empty());

        let providers = list_cost_by_provider(&conn, None, None, None, None).unwrap();
        assert!(providers.is_empty());

        let top = list_top_conversations_by_cost(&conn, 5, None, None).unwrap();
        assert!(top.is_empty());
    }

    #[test]
    fn test_cost_analytics_filters() {
        let conn = setup_test_db();

        let conv_a = create_conversation(&conn, "Conversation A".to_string()).unwrap();
        let conv_b = create_conversation(&conn, "Conversation B".to_string()).unwrap();

        let mut message_a = Message::new(conv_a, MessageRole::Assistant, "Response A".to_string())
            .with_metrics(100, 0.5);
        message_a.provider = Some("openai".to_string());
        message_a.model = Some("gpt-4o".to_string());
        create_message(&conn, &message_a).unwrap();

        let mut message_b = Message::new(conv_b, MessageRole::Assistant, "Response B".to_string())
            .with_metrics(80, 0.2);
        message_b.provider = Some("google".to_string());
        message_b.model = Some("gemini-1.5-flash".to_string());
        create_message(&conn, &message_b).unwrap();

        let all_timeseries = list_cost_timeseries(&conn, 7, None, None).unwrap();
        assert_eq!(all_timeseries.len(), 1);
        assert!((all_timeseries[0].total_cost - 0.7).abs() < f64::EPSILON);

        let openai_timeseries = list_cost_timeseries(&conn, 7, Some("openai"), None).unwrap();
        assert_eq!(openai_timeseries.len(), 1);
        assert!((openai_timeseries[0].total_cost - 0.5).abs() < f64::EPSILON);

        let providers = list_cost_by_provider(&conn, None, None, None, None).unwrap();
        assert_eq!(providers.len(), 2);
        assert!(providers
            .iter()
            .any(|p| p.provider == "openai" && (p.total_cost - 0.5).abs() < f64::EPSILON));

        let google_only = list_cost_by_provider(&conn, None, None, Some("google"), None).unwrap();
        assert_eq!(google_only.len(), 1);
        assert_eq!(google_only[0].provider, "google");

        let top_openai =
            list_top_conversations_by_cost_filtered(&conn, 5, None, None, Some("openai"), None)
                .unwrap();
        assert_eq!(top_openai.len(), 1);
        assert_eq!(top_openai[0].conversation_id, conv_a);
    }
}
