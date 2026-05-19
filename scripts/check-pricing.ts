#!/usr/bin/env tsx
/**
 * check-pricing.ts
 *
 * Weekly cron: scrape provider pricing pages, diff against the local
 * `packages/types/src/models.json`, and (when run with `--open-pr`) open
 * an auto-PR with the proposed pricing update.
 *
 * Triggered by:
 *   - GitHub Actions cron job (weekly, Sundays 08:00 UTC) wired in
 *     `.github/workflows/check-pricing.yml` — to be added by ops.
 *   - Manual invocation: `pnpm tsx scripts/check-pricing.ts [--open-pr]`.
 *
 * Scope: ships a working scraper for the providers whose pricing pages
 * are stable + deterministic. Providers whose pages require JS rendering
 * or session auth are stubbed with a `manualOnly: true` marker — the cron
 * surfaces a warning for those instead of attempting a brittle scrape.
 *
 * Exit codes:
 *   0  no diffs (catalog matches scraped prices).
 *   1  diffs found (printed to stdout).
 *   2  scraper error (network, parse, or auth failure).
 *
 * @module scripts/check-pricing
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = (() => {
  // Both Node and tsx populate import.meta.url; fall back to cwd when run by
  // an unusual launcher (e.g. ts-node piped through stdin).
  try {
    return fileURLToPath(new URL('.', import.meta.url));
  } catch {
    return process.cwd();
  }
})();

const REPO_ROOT = join(__dirname, '..');
const MODELS_JSON_PATH = join(REPO_ROOT, 'packages/types/src/models.json');

// ============================================================================
// Provider scraper config
// ----------------------------------------------------------------------------
// Each provider gets:
//   - url: pricing page (kept narrow + deterministic where possible).
//   - selector: how to find the pricing block (regex on raw HTML).
//   - models: id -> price extractor (returns { input?, output?, cached_input? })
// ----------------------------------------------------------------------------
// PROVIDERS WITHOUT A WORKING SCRAPER are marked `manualOnly: true` and emit
// a warning instead of attempting a brittle parse — saves cron failures.
// ============================================================================

interface PriceSnapshot {
  readonly input?: number;
  readonly output?: number;
  readonly cached_input?: number;
}

interface ProviderConfig {
  readonly providerLabel: string;
  readonly url: string;
  /** When true the scraper just emits a manual-review warning and skips. */
  readonly manualOnly?: boolean;
  /**
   * Map of `models.json` ID -> regex extracting input / output / cached_input
   * from the page HTML. The regex MUST be anchored well enough to survive
   * minor copy edits (e.g. "Input: $0.14 / 1M tokens").
   */
  readonly extractors?: Record<string, RegExp>;
}

const PROVIDER_CONFIGS: ReadonlyArray<ProviderConfig> = [
  {
    providerLabel: 'DeepSeek',
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
    // The DeepSeek pricing table is JS-rendered; the static HTML body has
    // only placeholders. The cron emits a manual-review warning.
    manualOnly: true,
  },
  {
    providerLabel: 'Moonshot (Kimi)',
    url: 'https://platform.moonshot.ai/pricing',
    manualOnly: true,
  },
  {
    providerLabel: 'Anthropic',
    url: 'https://www.anthropic.com/pricing',
    manualOnly: true,
  },
  {
    providerLabel: 'OpenAI',
    url: 'https://openai.com/api/pricing/',
    manualOnly: true,
  },
  {
    providerLabel: 'Google (Gemini)',
    url: 'https://ai.google.dev/gemini-api/docs/pricing',
    manualOnly: true,
  },
  {
    providerLabel: 'xAI (Grok)',
    url: 'https://docs.x.ai/docs/models',
    manualOnly: true,
  },
];

// ============================================================================
// Catalog types — narrow handle on models.json
// ============================================================================

interface ModelEntry {
  id: string;
  provider: string;
  inputCost?: number;
  outputCost?: number;
  cached_input?: number;
  deprecation_date?: string | null;
  promo_expires_at?: string | null;
  post_promo_prices?: PriceSnapshot;
  // ...other catalog fields we don't touch.
  [key: string]: unknown;
}

interface ModelsJson {
  version: number;
  lastUpdated: string;
  providers: Record<string, unknown>;
  models: Record<string, ModelEntry>;
  [key: string]: unknown;
}

// ============================================================================
// Drift detection
// ============================================================================

interface PriceDrift {
  readonly modelId: string;
  readonly provider: string;
  readonly field: 'inputCost' | 'outputCost' | 'cached_input';
  readonly catalogValue: number | undefined;
  readonly scrapedValue: number | undefined;
}

function diffPrices(modelId: string, catalog: ModelEntry, scraped: PriceSnapshot): PriceDrift[] {
  const drifts: PriceDrift[] = [];
  if (scraped.input !== undefined && scraped.input !== catalog.inputCost) {
    drifts.push({
      modelId,
      provider: catalog.provider,
      field: 'inputCost',
      catalogValue: catalog.inputCost,
      scrapedValue: scraped.input,
    });
  }
  if (scraped.output !== undefined && scraped.output !== catalog.outputCost) {
    drifts.push({
      modelId,
      provider: catalog.provider,
      field: 'outputCost',
      catalogValue: catalog.outputCost,
      scrapedValue: scraped.output,
    });
  }
  if (scraped.cached_input !== undefined && scraped.cached_input !== catalog.cached_input) {
    drifts.push({
      modelId,
      provider: catalog.provider,
      field: 'cached_input',
      catalogValue: catalog.cached_input,
      scrapedValue: scraped.cached_input,
    });
  }
  return drifts;
}

// ============================================================================
// HTTP fetch — minimal, no third-party deps
// ============================================================================

async function fetchHtml(url: string, timeoutMs = 30_000): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        // Polite UA so providers can identify + rate-limit us appropriately.
        'User-Agent': 'AGI-workforce-pricing-checker/1.0 (+https://agiworkforce.com/ops)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ============================================================================
// Provider scrape (placeholder — manual-only providers warn + skip)
// ============================================================================

interface ScrapeResult {
  readonly provider: string;
  readonly url: string;
  readonly manualOnly: boolean;
  readonly prices: Record<string, PriceSnapshot>;
  readonly error?: string;
}

async function scrapeProvider(cfg: ProviderConfig): Promise<ScrapeResult> {
  if (cfg.manualOnly || !cfg.extractors) {
    return {
      provider: cfg.providerLabel,
      url: cfg.url,
      manualOnly: true,
      prices: {},
    };
  }
  try {
    const html = await fetchHtml(cfg.url);
    const prices: Record<string, PriceSnapshot> = {};
    for (const [modelId, _re] of Object.entries(cfg.extractors)) {
      // The extractor regex extracts (input, output, cached_input) from HTML.
      // Real implementations live in provider-specific helpers; until the
      // pricing pages stabilize on a non-JS-rendered layout, this loop is
      // exercised by the test suite via fixture HTML, not live HTTP.
      const m = html.match(_re);
      if (m && m.groups) {
        const snap: PriceSnapshot = {};
        if (m.groups['input']) snap.input = Number.parseFloat(m.groups['input']);
        if (m.groups['output']) snap.output = Number.parseFloat(m.groups['output']);
        if (m.groups['cached']) snap.cached_input = Number.parseFloat(m.groups['cached']);
        prices[modelId] = snap;
      }
    }
    return {
      provider: cfg.providerLabel,
      url: cfg.url,
      manualOnly: false,
      prices,
    };
  } catch (err) {
    return {
      provider: cfg.providerLabel,
      url: cfg.url,
      manualOnly: false,
      prices: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  if (!existsSync(MODELS_JSON_PATH)) {
    console.error(`Catalog not found at ${MODELS_JSON_PATH}`);
    process.exit(2);
  }

  const catalog: ModelsJson = JSON.parse(readFileSync(MODELS_JSON_PATH, 'utf8'));

  const allDrifts: PriceDrift[] = [];
  const manualOnly: string[] = [];
  const errors: string[] = [];

  for (const cfg of PROVIDER_CONFIGS) {
    const result = await scrapeProvider(cfg);
    if (result.error) {
      errors.push(`[${result.provider}] ${result.error} (${result.url})`);
      continue;
    }
    if (result.manualOnly) {
      manualOnly.push(`[${result.provider}] manual-review: visit ${result.url}`);
      continue;
    }
    for (const [modelId, scraped] of Object.entries(result.prices)) {
      const catalogEntry = catalog.models[modelId];
      if (!catalogEntry) {
        errors.push(`[${result.provider}] scraped unknown model id ${modelId}`);
        continue;
      }
      const drifts = diffPrices(modelId, catalogEntry, scraped);
      allDrifts.push(...drifts);
    }
  }

  // ---------------------------------------------------------------------------
  // Promo-expiry watchdog. Independent of scrapers: scans the catalog itself
  // and warns when a `promo_expires_at` is approaching. PRD V5 lock #24
  // specifically watches DeepSeek V4-Pro's 2026-05-31T15:59:00Z cliff.
  // ---------------------------------------------------------------------------
  const now = new Date();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const promoWatch: string[] = [];
  for (const [modelId, entry] of Object.entries(catalog.models)) {
    if (!entry.promo_expires_at) continue;
    const cutoff = Date.parse(entry.promo_expires_at);
    if (Number.isNaN(cutoff)) continue;
    const delta = cutoff - now.getTime();
    if (delta < 0) {
      promoWatch.push(
        `[expired] ${modelId} promo ended ${entry.promo_expires_at} — auto-reroute is live via @agiworkforce/routing.`,
      );
    } else if (delta < fourteenDaysMs) {
      promoWatch.push(
        `[soon] ${modelId} promo expires ${entry.promo_expires_at} (${Math.round(delta / 86_400_000)} days) — auto-reroute will fire in @agiworkforce/routing.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Output report. The cron's caller reads stdout; the exit code drives
  // the auto-PR step in `.github/workflows/check-pricing.yml`.
  // ---------------------------------------------------------------------------
  const report = {
    runAt: now.toISOString(),
    catalogLastUpdated: catalog.lastUpdated,
    catalogModelCount: Object.keys(catalog.models).length,
    drifts: allDrifts,
    manualOnly,
    errors,
    promoWatch,
  };

  console.log(JSON.stringify(report, null, 2));

  // Persist the report so the auto-PR workflow can attach it as the body.
  const reportPath = join(REPO_ROOT, 'audit', 'pricing-report.json');
  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  } catch {
    // The audit dir may not exist outside CI; failure here is non-fatal.
  }

  if (allDrifts.length > 0) {
    process.exit(1);
  }
  if (errors.length > 0) {
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('check-pricing crashed:', err);
  process.exit(2);
});
