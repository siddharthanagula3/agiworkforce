export interface InspirationCard {
  id: string;
  title: string;
  language: string;
  description: string;
  type: 'html' | 'react' | 'svg' | 'mermaid' | 'code' | 'document';
  content: string;
}

export const INSPIRATION: readonly InspirationCard[] = [
  {
    id: 'animated-gradient-button',
    title: 'Animated gradient button',
    language: 'html',
    type: 'html',
    description: 'A self-contained HTML snippet with CSS keyframe animation.',
    content: `<style>
  body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #171813; }
  .btn {
    padding: 14px 32px;
    font-size: 15px;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #a98248, #d1b27a, #a98248);
    background-size: 200% 200%;
    color: #24231e;
    cursor: pointer;
    animation: shift 3s ease infinite;
    font-family: system-ui, sans-serif;
  }
  @keyframes shift { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
</style>
<button class="btn">Get started</button>`,
  },
  {
    id: 'ci-pipeline-flow-chart',
    title: 'Flow chart: CI pipeline',
    language: 'mermaid',
    type: 'mermaid',
    description: 'Mermaid diagram showing a typical CI/CD pipeline.',
    content: `graph TD
  A[Push to branch] --> B{Lint + typecheck}
  B -->|Pass| C[Unit tests]
  B -->|Fail| Z[Block PR]
  C -->|Pass| D[Build]
  D --> E[Preview deploy]
  E --> F{Review}
  F -->|Approved| G[Merge to main]
  G --> H[Production deploy]`,
  },
  {
    id: 'svg-logo-placeholder',
    title: 'SVG logo placeholder',
    language: 'svg',
    type: 'svg',
    description: 'A clean SVG wordmark built without any assets.',
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
  <rect width="200" height="60" rx="8" fill="#1a1b17"/>
  <text x="20" y="38" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#b9985c">AGI</text>
  <text x="72" y="38" font-family="Georgia, serif" font-size="26" font-weight="400" fill="#e7e0d2"> Workforce</text>
</svg>`,
  },
  {
    id: 'python-data-pipeline',
    title: 'Python data pipeline',
    language: 'python',
    type: 'code',
    description: 'Skeleton for an async data ingestion pipeline.',
    content: `import asyncio
from dataclasses import dataclass, field
from typing import AsyncIterator

@dataclass
class Record:
    id: str
    payload: dict
    tags: list[str] = field(default_factory=list)

async def fetch_records(source: str) -> AsyncIterator[Record]:
    """Yield records from source -- replace with real I/O."""
    for i in range(5):
        await asyncio.sleep(0.1)
        yield Record(id=f"{source}-{i}", payload={"index": i})

async def process(records: AsyncIterator[Record]) -> list[Record]:
    out = []
    async for r in records:
        r.tags.append("processed")
        out.append(r)
    return out

async def main():
    records = fetch_records("demo")
    result = await process(records)
    print(f"Processed {len(result)} records")

asyncio.run(main())`,
  },
  {
    id: 'responsive-card-grid',
    title: 'Responsive card grid (HTML)',
    language: 'html',
    type: 'html',
    description: 'Auto-filling card grid with CSS Grid and media queries.',
    content: `<style>
  body { margin: 0; padding: 24px; background: #171813; font-family: system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
  .card {
    background: #1a1b17;
    border: 1px solid rgba(226,220,207,0.12);
    border-radius: 12px;
    padding: 20px 16px;
    color: #e7e0d2;
    font-size: 13px;
  }
  .card h3 { margin: 0 0 6px; font-size: 15px; color: #b9985c; }
  .card p  { margin: 0; color: #c8c0b2; line-height: 1.5; }
</style>
<div class="grid">
  <div class="card"><h3>Speed</h3><p>Sub-100 ms first token on most models.</p></div>
  <div class="card"><h3>Routing</h3><p>Auto-selects the best provider per task.</p></div>
  <div class="card"><h3>Privacy</h3><p>Local mode keeps data on your device.</p></div>
  <div class="card"><h3>Open</h3><p>BYOK or use your own Ollama instance.</p></div>
</div>`,
  },
  {
    id: 'sql-user-accounts-schema',
    title: 'SQL schema: user accounts',
    language: 'sql',
    type: 'code',
    description: 'Postgres DDL for a simple multi-tenant accounts table.',
    content: `-- user_accounts.sql
CREATE TABLE accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  tier        TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','basic','pro','max','enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_email ON accounts (email);

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();`,
  },
];

export function findInspiration(id: string): InspirationCard | null {
  return INSPIRATION.find((card) => card.id === id) ?? null;
}

export function inspirationPath(id: string): string {
  return `/gallery/${encodeURIComponent(id)}`;
}
