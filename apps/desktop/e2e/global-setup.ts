import type { FullConfig } from '@playwright/test';

async function globalSetup(_config: FullConfig): Promise<void> {
  // Enforce deterministic defaults for E2E runs.
  process.env['TZ'] = process.env['TZ'] || 'UTC';
  process.env['E2E_MOCK_SUPABASE'] = process.env['E2E_MOCK_SUPABASE'] || '1';
  process.env['E2E_MOCK_LLM'] = process.env['E2E_MOCK_LLM'] || '1';

  console.log(
    '[Playwright global-setup] TZ=%s E2E_MOCK_SUPABASE=%s E2E_MOCK_LLM=%s',
    process.env['TZ'],
    process.env['E2E_MOCK_SUPABASE'],
    process.env['E2E_MOCK_LLM'],
  );
}

export default globalSetup;
