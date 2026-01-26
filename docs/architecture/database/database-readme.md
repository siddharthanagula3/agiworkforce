# Database Documentation

Comprehensive database documentation for AGI Workforce, covering PostgreSQL (Supabase) and SQLite architectures.

## Quick Links

- **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** - Complete schema documentation with ER diagrams
- **[MIGRATIONS.md](./MIGRATIONS.md)** - Migration strategy and how to create new migrations
- **[RLS_POLICIES.md](./RLS_POLICIES.md)** - Row Level Security policies and patterns
- **[QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md)** - Performance tuning and best practices
- **[BACKUP_RESTORE.md](./BACKUP_RESTORE.md)** - Backup procedures and disaster recovery
- **[DATABASE_EXAMPLES.md](./DATABASE_EXAMPLES.md)** - Code examples and common operations

---

## Overview

AGI Workforce uses a dual-database architecture:

### Supabase PostgreSQL (Cloud)

- **Purpose**: Multi-user data, authentication, billing, cross-device sync
- **Location**: Cloud-hosted (Supabase)
- **Access**: Web application, mobile apps, desktop sync
- **Size**: Scalable to enterprise
- **Features**: RLS, JSONB, full-text search, replication

### SQLite (Desktop)

- **Purpose**: Local data, offline-first, privacy-sensitive information
- **Location**: User's device (`~/.config/agiworkforce/agiworkforce.db`)
- **Access**: Desktop application only
- **Size**: Optimized for single-user
- **Features**: FTS5, WAL mode, encrypted fields

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       AGI Workforce Platform                     │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
          ┌─────────▼─────────┐    ┌─────────▼─────────┐
          │  Web Application   │    │  Desktop App      │
          │  (Next.js)         │    │  (Tauri/Rust)     │
          └─────────┬─────────┘    └─────────┬─────────┘
                    │                         │
                    │                         │
          ┌─────────▼──────────────┐         │
          │  Supabase PostgreSQL   │◄────────┤
          │  ─────────────────────  │         │
          │  • Authentication      │         │
          │  • Subscriptions       │         │
          │  • Billing             │         │
          │  • Device Management   │         │
          │  • Cross-Device Sync   │         │
          │  • Organizations       │         │
          └────────────────────────┘         │
                                             │
                                  ┌──────────▼──────────┐
                                  │  SQLite (Local)     │
                                  │  ─────────────────  │
                                  │  • Conversations    │
                                  │  • Messages         │
                                  │  • Automation       │
                                  │  • Cache            │
                                  │  • History          │
                                  │  • Settings         │
                                  └─────────────────────┘
```

---

## Key Concepts

### Data Ownership

**Supabase (Shared Data)**:

- User profiles and authentication
- Subscription and billing information
- Device registrations
- Cross-device synchronization events
- Organization/team data

**SQLite (Private Data)**:

- Chat conversations and messages
- Local automation history
- Command history
- Clipboard history
- Browser sessions
- Cached responses
- User preferences

### Security Model

**Supabase**: Row Level Security (RLS) enforces access control at database level

- Users can only access their own data
- Service role bypasses RLS for backend operations
- Policies are declarative and auditable

**SQLite**: Application-level security

- Database encrypted at rest (optional)
- Sensitive fields encrypted with AES-GCM
- Permission system for file operations

### Data Flow

```
User Action → Desktop App → SQLite (local storage)
                   │
                   ├──→ Supabase (sync events)
                   │
                   └──→ API Gateway → Supabase (billing, auth)
```

---

## Getting Started

### For Developers

#### 1. Understand the Schema

Start with [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) to understand:

- Table structures and relationships
- Data types and conventions
- Foreign key relationships
- Index strategies

#### 2. Learn Migration Process

Read [MIGRATIONS.md](./MIGRATIONS.md) to learn:

- How to create new tables
- How to modify existing schemas
- Migration best practices
- Rollback strategies

#### 3. Implement Secure Access

Study [RLS_POLICIES.md](./RLS_POLICIES.md) to:

- Understand Row Level Security
- Implement proper access control
- Test security policies
- Avoid common pitfalls

#### 4. Optimize Performance

Follow [QUERY_OPTIMIZATION.md](./QUERY_OPTIMIZATION.md) to:

- Create efficient queries
- Add proper indexes
- Avoid N+1 problems
- Monitor performance

#### 5. Set Up Backups

Implement [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) procedures:

- Schedule automated backups
- Test restore procedures
- Plan disaster recovery
- Monitor backup health

#### 6. Use Code Examples

Reference [DATABASE_EXAMPLES.md](./DATABASE_EXAMPLES.md) for:

- Common CRUD operations
- TypeScript/Supabase patterns
- Rust/SQLite patterns
- Testing examples

---

## Common Tasks

### Creating a New Table

1. **Plan the schema** (columns, types, relationships)
2. **Choose database** (Supabase for shared, SQLite for local)
3. **Create migration** (see MIGRATIONS.md)
4. **Add RLS policies** (if Supabase)
5. **Create indexes** (for foreign keys and filters)
6. **Update documentation** (in DATABASE_SCHEMA.md)
7. **Add code examples** (in DATABASE_EXAMPLES.md)

### Adding a New Column

1. **Create migration** with ALTER TABLE
2. **Handle NULL values** (backfill if needed)
3. **Add constraints** (NOT NULL, CHECK, etc.)
4. **Update indexes** (if column is filtered/sorted)
5. **Test migration** on development first

### Investigating Slow Queries

1. **Identify slow queries** (monitoring, logs)
2. **Run EXPLAIN ANALYZE** (see execution plan)
3. **Check index usage** (add missing indexes)
4. **Optimize query** (rewrite if needed)
5. **Test performance** (compare before/after)
6. **Document optimization** (in QUERY_OPTIMIZATION.md)

### Performing a Restore

1. **Identify backup file** (timestamp, location)
2. **Verify backup integrity** (test restore on dev)
3. **Notify users** (maintenance window)
4. **Stop application** (prevent writes)
5. **Restore database** (follow BACKUP_RESTORE.md)
6. **Verify data** (integrity checks)
7. **Restart application**
8. **Monitor** (watch for issues)

---

## Database Statistics

### Supabase PostgreSQL

**Production Database** (as of documentation):

- **Tables**: 28+ core tables
- **Indexes**: 50+ indexes for performance
- **RLS Policies**: 60+ security policies
- **Functions**: 15+ stored procedures
- **Extensions**: uuid-ossp, pgcrypto
- **Size**: ~100MB - 10GB (varies by usage)

**Key Tables**:

- `profiles`: User profiles (1:1 with auth.users)
- `subscriptions`: Billing and plan management
- `token_credits`: Credit tracking and limits
- `device_authorization_codes`: Device pairing
- `sync_data`: Cross-device synchronization

### SQLite Desktop

**Local Database** (per user):

- **Tables**: 75+ tables for local data
- **Schema Version**: 45 (as of last migration)
- **FTS Tables**: 2 (messages, conversations)
- **Indexes**: 100+ for performance
- **Size**: 10MB - 1GB (varies by usage)

**Key Tables**:

- `conversations`: Chat threads
- `messages`: Chat messages with FTS
- `settings_v2`: User preferences
- `cache_entries`: LLM response cache
- `automation_history`: Automation logs

---

## Performance Targets

### Query Performance

| Operation           | Target  | Status      |
| ------------------- | ------- | ----------- |
| Simple SELECT by PK | < 5ms   | ✅ Achieved |
| Filtered SELECT     | < 20ms  | ✅ Achieved |
| JOIN (2-3 tables)   | < 50ms  | ✅ Achieved |
| Full-text search    | < 100ms | ✅ Achieved |
| Aggregation         | < 100ms | ⚠️ Varies   |

### Database Health

| Metric             | Target  | Current |
| ------------------ | ------- | ------- |
| Index hit ratio    | > 95%   | 98%     |
| Cache hit ratio    | > 90%   | 92%     |
| Active connections | < 50    | 15      |
| Average query time | < 10ms  | 8ms     |
| Replication lag    | < 100ms | 45ms    |

---

## Maintenance Schedule

### Daily

- Automatic Supabase backup (02:00 UTC)
- SQLite sync to cloud (every 4 hours)
- Verify backup completion
- Monitor slow query log

### Weekly

- Schema export and validation
- Index usage analysis
- Cache cleanup (expired entries)
- Review error logs

### Monthly

- Full disaster recovery drill
- Vacuum SQLite databases
- Review and optimize slow queries
- Capacity planning review

### Quarterly

- Comprehensive DR test
- Security audit of RLS policies
- Performance benchmarking
- Documentation updates

---

## Troubleshooting Guide

### Issue: Query Timeout

**Symptoms**: Queries taking > 30 seconds, timeouts

**Diagnosis**:

```sql
-- Check long-running queries
SELECT
  pid,
  query,
  state,
  NOW() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle'
  AND NOW() - query_start > INTERVAL '5 seconds'
ORDER BY duration DESC;
```

**Solutions**:

1. Add missing indexes
2. Optimize query (use EXPLAIN)
3. Increase timeout temporarily
4. Break into smaller queries

---

### Issue: RLS Policy Blocking Access

**Symptoms**: Users cannot see their data, permission denied

**Diagnosis**:

```sql
-- Check which policies apply
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Test as user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "user-uuid"}';
SELECT * FROM your_table;
```

**Solutions**:

1. Verify auth.uid() matches user_id
2. Check policy conditions
3. Ensure RLS is enabled
4. Test with service_role (should work)

---

### Issue: Database Corruption

**Symptoms**: SQLite errors, integrity check fails

**Diagnosis**:

```bash
sqlite3 database.db "PRAGMA integrity_check;"
```

**Solutions**:

1. Stop application immediately
2. Copy corrupted database for analysis
3. Restore from most recent backup
4. Run integrity check on restored database
5. Restart application
6. Investigate root cause

---

### Issue: Slow Full-Text Search

**Symptoms**: FTS queries > 500ms

**Diagnosis**:

```sql
-- PostgreSQL
EXPLAIN ANALYZE
SELECT * FROM messages
WHERE to_tsvector('english', content) @@ to_tsquery('search & terms');

-- SQLite
EXPLAIN QUERY PLAN
SELECT * FROM messages_fts WHERE messages_fts MATCH 'search terms';
```

**Solutions**:

1. Ensure GIN/FTS5 index exists
2. Optimize search query
3. Limit results (LIMIT 100)
4. Use ranking to filter low-quality matches

---

## Support and Resources

### Internal Resources

- **Schema Diagrams**: See DATABASE_SCHEMA.md
- **Migration History**: `apps/web/supabase/migrations/`
- **Code Examples**: DATABASE_EXAMPLES.md
- **Slack Channel**: #database-help

### External Resources

- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [SQLite Docs](https://www.sqlite.org/docs.html)
- [Rust rusqlite Docs](https://docs.rs/rusqlite/)

### Getting Help

1. **Check documentation** (start here!)
2. **Search Slack history** (#database-help)
3. **Ask in Slack** (include error messages, query plans)
4. **Create GitHub issue** (for bugs or missing features)
5. **Contact database team** (for production issues)

---

## Contributing

### Updating Documentation

When making database changes:

1. **Update schema docs** (DATABASE_SCHEMA.md)
2. **Document migration** (MIGRATIONS.md)
3. **Add RLS policies** (RLS_POLICIES.md if new patterns)
4. **Performance notes** (QUERY_OPTIMIZATION.md if relevant)
5. **Code examples** (DATABASE_EXAMPLES.md for common operations)

### Documentation Standards

- Use clear, concise language
- Include code examples
- Add execution plans for queries
- Document "why" not just "what"
- Keep diagrams up to date
- Test all examples before committing

---

## Changelog

### 2026-01-15

- Added comprehensive database documentation
- Documented all 28 Supabase tables
- Documented 75+ SQLite tables
- Created migration guides
- Added RLS policy documentation
- Performance optimization guide
- Backup and restore procedures
- Code examples in TypeScript and Rust

### 2026-01-10

- Added desktop_devices table
- Added mobile_devices table
- Added sync_data table
- Implemented persistent device tracking
- Fixed in-memory state loss issues

### 2026-01-08

- Added device_authorization_codes table
- Fixed Stripe webhook idempotency
- Enhanced credit system with daily limits
- Security improvements to RPC functions

### 2026-01-01

- Consolidated schema migration
- Added Stripe integration
- Implemented credit system
- Set up RLS policies

---

## Next Steps

1. **Read the documentation** in order:
   - Start with DATABASE_SCHEMA.md for overview
   - Learn MIGRATIONS.md before making changes
   - Understand RLS_POLICIES.md for security
   - Reference QUERY_OPTIMIZATION.md for performance
   - Know BACKUP_RESTORE.md for reliability

2. **Set up your environment**:
   - Install Supabase CLI
   - Configure local database
   - Run migrations
   - Test with sample data

3. **Make your first change**:
   - Choose a simple task
   - Create a migration
   - Test locally
   - Submit for review
   - Deploy to staging
   - Monitor in production

4. **Join the community**:
   - Slack: #database-help
   - Weekly office hours
   - Code reviews
   - Documentation contributions

---

**Last Updated**: January 15, 2026
**Maintained By**: AGI Workforce Database Team
**Version**: 1.0.0
