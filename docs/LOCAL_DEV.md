# Local Development Guide

This document explains how to run the AGI Workforce local development stack, including the PostgreSQL database that mirrors the production Supabase schema.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose v2)
- [pnpm](https://pnpm.io/) — install via `npm i -g pnpm`
- [Rust toolchain](https://rustup.rs/) — required for the desktop Tauri build

---

## Database Setup (PostgreSQL via Docker)

The `docker-compose.yml` at the repository root provides a PostgreSQL 16 instance that mirrors the production Supabase PostgreSQL schema, plus a pgAdmin GUI for convenience.

### Start only the database

```bash
docker compose up -d postgres
```

This starts PostgreSQL on port `5432` and automatically applies all SQL migration files from `apps/web/supabase/migrations/` on first initialization.

### Start all local services (PostgreSQL + pgAdmin)

```bash
docker compose up -d
```

### Stop all services

```bash
docker compose down
```

### Destroy all services and wipe data volumes

```bash
docker compose down -v
```

---

## Connection Details

| Parameter | Value              |
| --------- | ------------------ |
| Host      | `localhost`        |
| Port      | `5432`             |
| Database  | `agiworkforce_dev` |
| User      | `postgres`         |
| Password  | `postgres`         |

### Connection string format

```
postgresql://postgres:postgres@localhost:5432/agiworkforce_dev
```

Use this format when configuring any tool or service that needs a direct PostgreSQL connection (e.g., a locally-run Next.js API that bypasses Supabase, database migration tooling, or ORMs in integration tests).

For the **web app** (`apps/web`) in local development, set the following in `apps/web/.env.local`:

```bash
# Point to local Supabase OR use the direct postgres URL for migration tools
NEXT_PUBLIC_SUPABASE_URL=http://localhost:5432   # only if running local Supabase CLI
SUPABASE_URL=http://localhost:5432               # only if running local Supabase CLI

# --- OR --- connect tools directly to the Docker postgres instance:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agiworkforce_dev
```

> Note: The desktop app (`apps/desktop`) uses a **separate SQLite** database stored locally on-device (managed by the Rust/Tauri backend). The Docker PostgreSQL instance is only needed for the web app and backend services.

---

## Connect via psql

Run an interactive psql session inside the running container:

```bash
docker exec -it agiworkforce-postgres-1 psql -U postgres agiworkforce_dev
```

Or, if you have `psql` installed locally:

```bash
psql postgresql://postgres:postgres@localhost:5432/agiworkforce_dev
```

---

## pgAdmin (Web GUI)

pgAdmin is available at **http://localhost:5050** once the stack is running.

| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@local.dev` |
| Password | `admin`           |

To add the local PostgreSQL server in pgAdmin:

1. Right-click **Servers** → **Register** → **Server**
2. **General** tab — Name: `agiworkforce-local`
3. **Connection** tab:
   - Host: `postgres` (the Docker service name, resolvable within the Docker network)
   - Port: `5432`
   - Database: `agiworkforce_dev`
   - Username: `postgres`
   - Password: `postgres`

---

## Health Check

Verify the database is ready:

```bash
docker compose ps
```

The `postgres` service should show `healthy` in the `Status` column.

Or run the health check directly:

```bash
docker exec agiworkforce-postgres-1 pg_isready -U postgres
```

Expected output: `localhost:5432 - accepting connections`

---

## Running Migrations Manually

All migration files in `apps/web/supabase/migrations/` are mounted into the container and run automatically on first start. To re-run or apply new migrations manually:

```bash
# Apply a specific migration
docker exec -i agiworkforce-postgres-1 \
  psql -U postgres agiworkforce_dev \
  < apps/web/supabase/migrations/20260224000001_add_scim_fields.sql
```

Or use the Supabase CLI against the local database:

```bash
supabase db push --db-url postgresql://postgres:postgres@localhost:5432/agiworkforce_dev
```

---

## Full Local Development Workflow

```bash
# 1. Start the database
docker compose up -d postgres

# 2. Install dependencies
pnpm install

# 3. Configure environment (copy and fill in values)
cp apps/desktop/.env.example apps/desktop/.env.local
# Edit apps/web/.env.local with your Supabase keys (or local postgres URL)

# 4. Run the web app
cd apps/web && pnpm dev

# 5. Run the desktop app (separate terminal)
pnpm dev:desktop
```
