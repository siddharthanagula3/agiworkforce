import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  declaredTools,
  offerableToolNames,
  registryFailures,
  toolNameConstants,
  toolNameList,
  UNDECLARED_BASELINE,
} from './check-tool-registry.mjs';

const METADATA = 'apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts';

function metadataSource(entries) {
  const body = entries
    .map(
      (entry) =>
        `  ${entry.name}: {\n` +
        (entry.omit === 'actionClass' ? '' : `    actionClass: 'read',\n`) +
        `    reversible: true,\n` +
        (entry.omit === 'acceptsUntrustedContent' ? '' : `    acceptsUntrustedContent: false,\n`) +
        `    createsEgressPath: false,\n` +
        `    declared: true,\n` +
        `  },`,
    )
    .join('\n');
  return `export const PLATFORM_TOOL_METADATA = Object.freeze({\n${body}\n});\n`;
}

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-registry-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

test('reads the declared tools out of the metadata table', () => {
  const declared = declaredTools(metadataSource([{ name: 'web_search' }, { name: 'read_file' }]));
  assert.deepEqual([...declared.keys()], ['web_search', 'read_file']);
});

test('reads a tool name from an exported constant and from a list constant', () => {
  assert.deepEqual(toolNameConstants(`export const WEB_SEARCH_TOOL = 'web_search';`), [
    'web_search',
  ]);
  assert.deepEqual(toolNameConstants(`export const WEB_SEARCH_TOOL_PROMPT_ID = 'tool.web';`), []);
  assert.deepEqual(
    toolNameList(
      `export const DEVICE_STEP_TOOLS = ['device_click', 'device_type'] as const;`,
      'DEVICE_STEP_TOOLS',
    ),
    ['device_click', 'device_type'],
  );
});

test('a tool that can be offered with no declaration fails', () => {
  const root = fixture({
    [METADATA]: metadataSource([{ name: 'web_search' }]),
    'apps/web/lib/web-search/web-search-tool.ts': `export const WEB_SEARCH_TOOL = 'web_search';`,
    'apps/web/lib/services/shipping-tool.ts': `export const SHIP_ORDER_TOOL = 'ship_order';`,
  });
  const { failures } = registryFailures(root, new Map());
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /"ship_order" can be offered to the model but has no PLATFORM_TOOL_METADATA entry/u,
  );
});

test('a baselined tool passes, and stops passing once it is declared', () => {
  const files = {
    [METADATA]: metadataSource([{ name: 'web_search' }]),
    'apps/web/lib/web-search/web-search-tool.ts': `export const WEB_SEARCH_TOOL = 'web_search';`,
    'apps/web/lib/services/shipping-tool.ts': `export const SHIP_ORDER_TOOL = 'ship_order';`,
  };
  const baseline = new Map([['ship_order', 'not declared yet']]);
  assert.deepEqual(registryFailures(fixture(files), baseline).failures, []);

  const declaredRoot = fixture({
    ...files,
    [METADATA]: metadataSource([{ name: 'web_search' }, { name: 'ship_order' }]),
  });
  const { failures } = registryFailures(declaredRoot, baseline);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /remove it from UNDECLARED_BASELINE/u);
});

test('a baseline entry for a tool nothing offers any more fails', () => {
  const root = fixture({
    [METADATA]: metadataSource([{ name: 'web_search' }]),
    'apps/web/lib/web-search/web-search-tool.ts': `export const WEB_SEARCH_TOOL = 'web_search';`,
  });
  const { failures } = registryFailures(root, new Map([['ship_order', 'gone']]));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /nothing offers it any more/u);
});

test('a declaration missing a facet fails', () => {
  const root = fixture({
    [METADATA]: metadataSource([{ name: 'web_search', omit: 'acceptsUntrustedContent' }]),
    'apps/web/lib/web-search/web-search-tool.ts': `export const WEB_SEARCH_TOOL = 'web_search';`,
  });
  const { failures } = registryFailures(root, new Map());
  assert.equal(failures.length, 1);
  assert.match(failures[0], /declares no acceptsUntrustedContent/u);
});

test('the repository itself passes, and every baseline entry carries a reason', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const { failures, offered, declared } = registryFailures(root);
  assert.deepEqual(failures, []);
  assert.ok(offered > declared, 'the walk must see more offerable names than declared ones');
  assert.ok(offerableToolNames(root).has('web_search'));
  for (const [name, reason] of UNDECLARED_BASELINE) {
    assert.ok(typeof reason === 'string' && reason.length > 20, `${name} has no reason`);
  }
});
