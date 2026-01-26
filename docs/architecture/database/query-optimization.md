# Query Optimization Guide

Comprehensive guide to database performance optimization for AGI Workforce.

## Table of Contents

1. [Performance Goals](#performance-goals)
2. [Index Strategy](#index-strategy)
3. [Query Patterns](#query-patterns)
4. [Supabase PostgreSQL Optimization](#supabase-postgresql-optimization)
5. [SQLite Optimization](#sqlite-optimization)
6. [Monitoring and Profiling](#monitoring-and-profiling)
7. [Common Performance Issues](#common-performance-issues)
8. [Best Practices](#best-practices)

---

## Performance Goals

### Target Metrics

| Operation               | Target  | Acceptable | Unacceptable |
| ----------------------- | ------- | ---------- | ------------ |
| Simple SELECT by PK     | < 5ms   | < 20ms     | > 50ms       |
| Filtered SELECT         | < 20ms  | < 100ms    | > 500ms      |
| JOIN query (2-3 tables) | < 50ms  | < 200ms    | > 1s         |
| Complex aggregation     | < 100ms | < 500ms    | > 2s         |
| INSERT/UPDATE           | < 10ms  | < 50ms     | > 200ms      |
| Full-text search        | < 100ms | < 500ms    | > 2s         |

### Performance Checklist

Before optimizing:

- [ ] Query time < 100ms achieved
- [ ] Index usage > 95% maintained
- [ ] Cache hit rate > 90% optimized
- [ ] No full table scans on large tables
- [ ] N+1 query problems eliminated
- [ ] Connection pooling configured
- [ ] Query result caching implemented
- [ ] Monitoring and alerting active

---

## Index Strategy

### When to Create Indexes

**CREATE INDEX FOR**:

1. Foreign key columns (JOIN performance)
2. Columns in WHERE clauses
3. Columns in ORDER BY clauses
4. Columns in GROUP BY clauses
5. RLS policy predicates
6. Frequently filtered columns

**DON'T CREATE INDEX FOR**:

1. Small tables (< 1000 rows)
2. Columns with low cardinality (few distinct values)
3. Frequently updated columns (index maintenance overhead)
4. Columns never used in queries

### PostgreSQL Index Types

#### B-Tree Index (Default)

Most common, works for equality and range queries.

```sql
-- Standard B-tree index
CREATE INDEX idx_users_email ON users(email);

-- Composite index
CREATE INDEX idx_messages_conv_time ON messages(conversation_id, created_at);

-- Usage
SELECT * FROM users WHERE email = 'user@example.com';  -- Uses index
SELECT * FROM messages WHERE conversation_id = 123 ORDER BY created_at;  -- Uses index
```

**Best for**:

- Equality (=, IN)
- Range (<, >, <=, >=, BETWEEN)
- Pattern matching (LIKE 'prefix%')
- ORDER BY
- NULL checks (IS NULL, IS NOT NULL)

---

#### Hash Index

Fast equality lookups, no range support.

```sql
CREATE INDEX idx_users_id_hash ON users USING hash(id);

-- Usage
SELECT * FROM users WHERE id = 'uuid';  -- Fast
SELECT * FROM users WHERE id > 'uuid';  -- Cannot use hash index
```

**Use when**:

- Only equality lookups
- No sorting needed
- Space efficiency matters

---

#### GIN Index (Generalized Inverted Index)

For JSONB, arrays, full-text search.

```sql
-- JSONB index
CREATE INDEX idx_events_metadata ON events USING gin(metadata);

-- Usage
SELECT * FROM events WHERE metadata @> '{"status": "active"}';
SELECT * FROM events WHERE metadata ? 'user_id';

-- Array index
CREATE INDEX idx_tags_array ON posts USING gin(tags);

-- Usage
SELECT * FROM posts WHERE tags @> ARRAY['postgresql'];
SELECT * FROM posts WHERE 'optimization' = ANY(tags);
```

**Best for**:

- JSONB containment (@>, @?, ?&)
- Array operations
- Full-text search

---

#### GiST Index (Generalized Search Tree)

For geometric data, full-text search, custom types.

```sql
-- Full-text search
CREATE INDEX idx_documents_search ON documents USING gist(to_tsvector('english', content));

-- Usage
SELECT * FROM documents WHERE to_tsvector('english', content) @@ to_tsquery('database & optimization');
```

**Best for**:

- Full-text search
- Geometric queries (PostGIS)
- Range types

---

#### BRIN Index (Block Range Index)

Compact index for large, naturally ordered tables.

```sql
-- BRIN on time-series data
CREATE INDEX idx_logs_timestamp_brin ON logs USING brin(created_at);

-- Usage (good for time-based queries)
SELECT * FROM logs WHERE created_at > NOW() - INTERVAL '7 days';
```

**Best for**:

- Very large tables (millions of rows)
- Naturally ordered data (timestamps, sequences)
- Data warehouse / append-only tables

**Advantages**:

- Tiny index size (1000x smaller than B-tree)
- Fast index creation
- Low maintenance overhead

---

#### Partial Index

Index only rows matching a condition.

```sql
-- Index only active subscriptions
CREATE INDEX idx_subscriptions_active
ON subscriptions(user_id)
WHERE status = 'active';

-- Index only recent messages
CREATE INDEX idx_recent_messages
ON messages(conversation_id, created_at)
WHERE created_at > NOW() - INTERVAL '30 days';

-- Usage (must match WHERE condition)
SELECT * FROM subscriptions WHERE user_id = 'uuid' AND status = 'active';
```

**Advantages**:

- Smaller index size
- Faster updates (rows outside condition not indexed)
- Optimized for specific query patterns

---

#### Expression Index

Index computed values.

```sql
-- Case-insensitive email lookup
CREATE INDEX idx_users_email_lower ON users(LOWER(email));

-- Usage
SELECT * FROM users WHERE LOWER(email) = LOWER('USER@EXAMPLE.COM');

-- JSONB field extraction
CREATE INDEX idx_events_user_id ON events((metadata->>'user_id'));

-- Usage
SELECT * FROM events WHERE metadata->>'user_id' = 'user123';
```

---

#### Covering Index

Include extra columns in index to avoid table lookup.

```sql
-- Standard index
CREATE INDEX idx_users_email ON users(email);

-- Covering index (includes frequently selected columns)
CREATE INDEX idx_users_email_covering
ON users(email)
INCLUDE (name, created_at);

-- Query can be satisfied entirely from index (no table access)
SELECT email, name, created_at FROM users WHERE email = 'user@example.com';
```

**Advantages**:

- Index-only scans (faster)
- No table I/O needed

**Trade-offs**:

- Larger index size
- Slower updates

---

### Index Maintenance

#### Analyze Index Usage

```sql
-- Find unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Index size
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Index hit ratio (should be > 95%)
SELECT
  sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100 AS index_hit_ratio
FROM pg_statio_user_indexes;
```

#### Rebuild Indexes

```sql
-- Reindex single index (locks table)
REINDEX INDEX idx_users_email;

-- Reindex table (locks table)
REINDEX TABLE users;

-- Reindex without locking (PostgreSQL 12+)
REINDEX INDEX CONCURRENTLY idx_users_email;
```

#### Drop Unused Indexes

```sql
-- Safe to drop if idx_scan = 0 for months and index_size is large
DROP INDEX IF EXISTS idx_rarely_used;
```

---

## Query Patterns

### Pattern 1: SELECT by Primary Key

**Optimal**:

```sql
SELECT * FROM users WHERE id = 'uuid';
```

**Execution Plan**:

```
Index Scan using users_pkey on users (cost=0.29..8.30 rows=1)
  Index Cond: (id = 'uuid')
```

**Performance**: < 5ms
**Cache**: Highly cacheable

---

### Pattern 2: Filtered SELECT with Index

**Optimal**:

```sql
SELECT * FROM subscriptions WHERE user_id = 'uuid' AND status = 'active';

-- Requires composite index
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
```

**Execution Plan**:

```
Index Scan using idx_subscriptions_user_status on subscriptions (cost=0.29..8.31 rows=1)
  Index Cond: ((user_id = 'uuid') AND (status = 'active'))
```

---

### Pattern 3: JOIN with Foreign Keys

**Optimal**:

```sql
SELECT
  m.content,
  c.title
FROM messages m
JOIN conversations c ON m.conversation_id = c.id
WHERE m.user_id = 'uuid'
ORDER BY m.created_at DESC
LIMIT 20;

-- Requires indexes
CREATE INDEX idx_messages_user_id ON messages(user_id, created_at);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
```

**Execution Plan**:

```
Limit (cost=0.57..25.02 rows=20)
  -> Nested Loop (cost=0.57..1225.14 rows=1001)
    -> Index Scan Backward using idx_messages_user_id on messages m
      Index Cond: (user_id = 'uuid')
    -> Index Scan using conversations_pkey on conversations c
      Index Cond: (id = m.conversation_id)
```

---

### Pattern 4: Aggregation with GROUP BY

**Optimal**:

```sql
SELECT
  conversation_id,
  COUNT(*) as message_count,
  MAX(created_at) as last_message_at
FROM messages
WHERE user_id = 'uuid'
GROUP BY conversation_id;

-- Requires index
CREATE INDEX idx_messages_user_conv ON messages(user_id, conversation_id, created_at);
```

---

### Pattern 5: Full-Text Search

**PostgreSQL (Optimal)**:

```sql
-- Create GIN index
CREATE INDEX idx_messages_content_fts
ON messages
USING gin(to_tsvector('english', content));

-- Query
SELECT *
FROM messages
WHERE to_tsvector('english', content) @@ to_tsquery('database & optimization')
ORDER BY created_at DESC;
```

**SQLite (FTS5)**:

```sql
-- Create FTS table
CREATE VIRTUAL TABLE messages_fts USING fts5(
  message_id UNINDEXED,
  content,
  tokenize = 'porter unicode61'
);

-- Query
SELECT *
FROM messages m
JOIN messages_fts fts ON m.id = CAST(fts.message_id AS INTEGER)
WHERE messages_fts MATCH 'database optimization'
ORDER BY rank;
```

---

### Pattern 6: Pagination

**Efficient (Cursor-based)**:

```sql
-- First page
SELECT * FROM messages
WHERE user_id = 'uuid'
ORDER BY created_at DESC
LIMIT 20;

-- Next page (using last created_at as cursor)
SELECT * FROM messages
WHERE user_id = 'uuid'
  AND created_at < '2026-01-01T00:00:00Z'
ORDER BY created_at DESC
LIMIT 20;
```

**Inefficient (Offset-based)**:

```sql
-- Scans and discards first 1000 rows
SELECT * FROM messages
WHERE user_id = 'uuid'
ORDER BY created_at DESC
LIMIT 20 OFFSET 1000;
```

---

### Pattern 7: Bulk INSERT

**Efficient**:

```sql
-- Single multi-row insert
INSERT INTO logs (user_id, event, data)
VALUES
  ('uuid1', 'login', '{}'),
  ('uuid2', 'logout', '{}'),
  ('uuid3', 'action', '{}');

-- Or use COPY (PostgreSQL)
COPY logs (user_id, event, data) FROM stdin;
```

**Inefficient**:

```sql
-- Multiple single-row inserts
INSERT INTO logs (user_id, event, data) VALUES ('uuid1', 'login', '{}');
INSERT INTO logs (user_id, event, data) VALUES ('uuid2', 'logout', '{}');
INSERT INTO logs (user_id, event, data) VALUES ('uuid3', 'action', '{}');
```

---

## Supabase PostgreSQL Optimization

### Configuration

Supabase manages PostgreSQL configuration, but you can optimize queries.

### Query Best Practices

#### 1. Use Proper Indexes

```typescript
// Supabase client query
const { data } = await supabase
  .from('messages')
  .select('*')
  .eq('conversation_id', conversationId) // Uses idx_messages_conversation_id
  .order('created_at', { ascending: false })
  .limit(20);
```

#### 2. Select Only Needed Columns

```typescript
// Bad: Fetches all columns
const { data } = await supabase.from('users').select('*');

// Good: Fetches only needed columns
const { data } = await supabase.from('users').select('id, email, display_name');
```

#### 3. Use Joins Instead of Multiple Queries

```typescript
// Bad: N+1 queries
const { data: conversations } = await supabase.from('conversations').select('*');
for (const conv of conversations) {
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conv.id);
}

// Good: Single query with join
const { data } = await supabase.from('conversations').select(`
    *,
    messages (*)
  `);
```

#### 4. Use RPC for Complex Operations

```typescript
// Instead of multiple round trips
const { data: balance } = await supabase.rpc('get_credit_balance', { p_user_id: userId });

// RPC function does atomic operations server-side
```

#### 5. Enable Statement Timeout

```sql
-- Prevent long-running queries
SET statement_timeout = '30s';
```

---

## SQLite Optimization

### Configuration

Set pragmas on connection open:

```rust
// In lib.rs
conn.execute("PRAGMA busy_timeout = 5000", [])?;        // 5s lock wait
conn.execute("PRAGMA journal_mode = WAL", [])?;         // Write-Ahead Logging
conn.execute("PRAGMA synchronous = NORMAL", [])?;       // Balance safety/speed
conn.execute("PRAGMA foreign_keys = ON", [])?;          // Enforce FKs
conn.execute("PRAGMA cache_size = -64000", [])?;        // 64MB cache
conn.execute("PRAGMA temp_store = MEMORY", [])?;        // In-memory temp tables
```

### Query Best Practices

#### 1. Use Prepared Statements

```rust
// Bad: Vulnerable to SQL injection, no caching
let query = format!("SELECT * FROM users WHERE id = '{}'", user_id);
conn.execute(&query, [])?;

// Good: Safe, cached
let mut stmt = conn.prepare("SELECT * FROM users WHERE id = ?1")?;
let user = stmt.query_row([user_id], |row| {
    // ...
})?;
```

#### 2. Use Transactions

```rust
// Bad: Each insert is a transaction (slow)
for item in items {
    conn.execute("INSERT INTO table (data) VALUES (?1)", [item])?;
}

// Good: Single transaction
let tx = conn.transaction()?;
for item in items {
    tx.execute("INSERT INTO table (data) VALUES (?1)", [item])?;
}
tx.commit()?;
```

#### 3. Use FTS5 for Full-Text Search

```rust
// Slow: LIKE on large table
SELECT * FROM messages WHERE content LIKE '%search term%';

// Fast: FTS5 index
SELECT * FROM messages_fts WHERE messages_fts MATCH 'search term';
```

#### 4. Analyze Query Plans

```rust
let query = "SELECT * FROM messages WHERE conversation_id = ?1";
let plan = conn.prepare(&format!("EXPLAIN QUERY PLAN {}", query))?;

// Look for "SEARCH" (good) vs "SCAN" (bad)
```

---

## Monitoring and Profiling

### PostgreSQL (Supabase)

#### pg_stat_statements

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT
  query,
  calls,
  mean_exec_time,
  total_exec_time,
  rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Most frequently called queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;
```

#### EXPLAIN ANALYZE

```sql
-- Analyze query execution
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM messages
WHERE conversation_id = 'uuid'
ORDER BY created_at DESC
LIMIT 20;

-- Output shows:
-- - Execution time
-- - Rows processed
-- - Index usage
-- - Buffer hits/misses
```

**Reading EXPLAIN output**:

- **Seq Scan**: Full table scan (bad for large tables)
- **Index Scan**: Using index (good)
- **Index Only Scan**: Using covering index (best)
- **cost=X..Y**: Estimated cost (lower is better)
- **rows=N**: Estimated rows (should match actual)
- **actual time=X..Y**: Actual execution time

---

### SQLite

#### Query Plan

```sql
EXPLAIN QUERY PLAN
SELECT * FROM messages WHERE conversation_id = ?;

-- Output:
-- SEARCH messages USING INDEX idx_messages_conversation_id (conversation_id=?)
-- ^ Good: Using index

-- Or:
-- SCAN messages
-- ^ Bad: Full table scan
```

#### Profiling in Rust

```rust
use std::time::Instant;

let start = Instant::now();
let result = conn.execute(query, params)?;
let duration = start.elapsed();

if duration.as_millis() > 100 {
    eprintln!("Slow query ({}ms): {}", duration.as_millis(), query);
}
```

---

## Common Performance Issues

### Issue 1: N+1 Query Problem

**Problem**:

```typescript
// 1 query for conversations
const conversations = await supabase.from('conversations').select('*');

// N queries for messages (one per conversation)
for (const conv of conversations) {
  const messages = await supabase.from('messages').select('*').eq('conversation_id', conv.id);
}
```

**Solution**:

```typescript
// Single query with join
const data = await supabase.from('conversations').select(`
    *,
    messages (*)
  `);
```

---

### Issue 2: Missing Index

**Problem**:

```sql
-- Slow: Full table scan
SELECT * FROM messages WHERE user_id = 'uuid';

-- Execution plan shows Seq Scan
```

**Solution**:

```sql
CREATE INDEX idx_messages_user_id ON messages(user_id);
```

---

### Issue 3: Inefficient Sorting

**Problem**:

```sql
-- Sorts entire table in memory
SELECT * FROM large_table ORDER BY created_at DESC;
```

**Solution**:

```sql
-- Add index for sorting
CREATE INDEX idx_large_table_created_at ON large_table(created_at DESC);

-- Now uses index for ordering (no sort step)
```

---

### Issue 4: Large OFFSET

**Problem**:

```sql
-- Scans and discards 10,000 rows
SELECT * FROM posts ORDER BY created_at DESC LIMIT 10 OFFSET 10000;
```

**Solution**: Use cursor-based pagination

```sql
SELECT * FROM posts
WHERE created_at < '2026-01-01T00:00:00Z'  -- Last seen timestamp
ORDER BY created_at DESC
LIMIT 10;
```

---

### Issue 5: SELECT \*

**Problem**:

```sql
-- Fetches all columns, including large JSONB fields
SELECT * FROM events;
```

**Solution**:

```sql
-- Fetch only needed columns
SELECT id, user_id, event_type, created_at FROM events;
```

---

### Issue 6: LIKE '%pattern%'

**Problem**:

```sql
-- Cannot use index (leading wildcard)
SELECT * FROM users WHERE email LIKE '%@example.com';
```

**Solution**:

```sql
-- Use full-text search
CREATE INDEX idx_users_email_fts ON users USING gin(to_tsvector('simple', email));
SELECT * FROM users WHERE to_tsvector('simple', email) @@ to_tsquery('example.com');

-- Or use domain filtering
SELECT * FROM users WHERE email LIKE 'prefix%';  -- Can use index
```

---

## Best Practices

### 1. Index Strategy

- [ ] Foreign keys have indexes
- [ ] WHERE clause columns have indexes
- [ ] ORDER BY columns have indexes
- [ ] Composite indexes for common query patterns
- [ ] Partial indexes for filtered queries
- [ ] Remove unused indexes

### 2. Query Patterns

- [ ] SELECT only needed columns
- [ ] Use JOINs instead of multiple queries
- [ ] Use cursor-based pagination
- [ ] Batch INSERT operations
- [ ] Use transactions for bulk operations
- [ ] Cache frequently accessed data

### 3. Schema Design

- [ ] Normalize to reduce redundancy
- [ ] Denormalize for read performance (when needed)
- [ ] Use appropriate data types
- [ ] Store currency as integer cents
- [ ] Use JSONB for flexible schemas
- [ ] Partition large tables (PostgreSQL)

### 4. Application Layer

- [ ] Connection pooling configured
- [ ] Query result caching
- [ ] Avoid N+1 queries
- [ ] Use prepared statements
- [ ] Set statement timeouts
- [ ] Monitor slow queries

### 5. Monitoring

- [ ] Query performance metrics
- [ ] Index usage statistics
- [ ] Cache hit ratios
- [ ] Slow query logging
- [ ] Automated alerting
- [ ] Regular performance reviews

---

## Performance Optimization Workflow

1. **Identify Slow Queries**
   - Monitor logs
   - Use pg_stat_statements
   - Profile in application

2. **Analyze Execution Plan**
   - Run EXPLAIN ANALYZE
   - Identify bottlenecks
   - Check index usage

3. **Optimize**
   - Add/modify indexes
   - Rewrite query
   - Adjust schema
   - Add caching

4. **Test**
   - Verify performance improvement
   - Check resource usage
   - Test with production data volumes

5. **Monitor**
   - Track metrics
   - Set up alerts
   - Regular reviews

---

For more information, see:

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Schema reference
- [MIGRATIONS.md](./MIGRATIONS.md) - Adding indexes via migrations
- [RLS_POLICIES.md](./RLS_POLICIES.md) - Optimizing RLS performance
