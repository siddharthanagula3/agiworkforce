/**
 * @fileoverview ESLint rule: no-cross-layer-import
 *
 * PROTOTYPE — Phase 8 enforcement preview. Not yet wired into eslint.config.mjs.
 *
 * Enforces the canonical layer-map declared in `apps/<surface>/src/README.md`:
 *
 *     entry / core / features / platform / integrations / data | storage / ui
 *
 * The rule classifies BOTH the importing file and the imported module as one
 * of those layers (based on path location) and then applies cross-layer
 * legality checks that `no-restricted-imports` patterns can't express on
 * their own — because the legality of an import depends on WHO is doing the
 * importing, not only on what is imported.
 *
 * Canonical rule statements (from the mobile pilot README):
 *
 *   1. `entry/` owns no domain logic. It wires features into routes via
 *      `core/`. → entry/ may NOT import directly from features/*.
 *   2. `features/`, `core/`, `platform/` do not import each other's siblings
 *      directly. → A file in features/X may NOT import from features/Y.
 *   3. `integrations/` is the only place network/IO/SDK calls happen. →
 *      features/* importing from `ui/*` and re-exporting it (UI is leaf,
 *      not transit) is illegal.
 *   4. `data/` (legacy: `storage/`) is the data boundary. → data/ may NOT
 *      import from ui/ or features/.
 *   5. `ui/` is presentation-only. → ui/ may NOT import from features/,
 *      integrations/, platform/, core/, data/, or entry/.
 *
 * The rule also detects "feature transit through UI": a file in features/X
 * imports a UI primitive and then re-exports it from the feature's barrel.
 * UI primitives must be imported by their consumers directly, not laundered
 * through a feature's public surface.
 *
 * @author phase8-enforcement-prototyper
 * @license PROPRIETARY
 */

/* global module, require */

'use strict';

const path = require('node:path');

/* -------------------------------------------------------------------------- */
/* Layer classification                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Canonical layer names. `data` is the new name; `storage` is the legacy
 * name still used by the mobile pilot README. Both classify to the same
 * "data" bucket internally so the rule keeps working through the rename.
 *
 * Exported (via `__internals`) so downstream tooling can discover the
 * canonical layer list without parsing this file.
 */
const _LAYERS = /** @type {const} */ ([
  'entry',
  'core',
  'features',
  'platform',
  'integrations',
  'data',
  'ui',
]);

/** Aliases that map to a canonical layer. */
const LAYER_ALIASES = {
  storage: 'data',
};

/**
 * Match an absolute or alias path against `apps/<surface>/src/<layer>/...`
 * and return the layer name (canonical, post-alias) or `null` if the path
 * is not inside any reorganized surface.
 *
 * Recognized shapes:
 *   apps/mobile/src/features/chat/foo.ts
 *   @/src/features/chat/foo                (TS path alias used by mobile)
 *   ../../src/integrations/api             (relative from a sibling layer)
 *
 * @param {string} sourcePath
 *   The literal import specifier (for resolving alias roots) OR an absolute
 *   filesystem path.
 * @returns {string | null}
 */
function classifyByPath(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') return null;

  // Normalize windows separators just in case.
  const p = sourcePath.replace(/\\/g, '/');

  // Pattern A: absolute filesystem path containing apps/<surface>/src/<layer>/
  let m = p.match(/(?:^|\/)apps\/[^/]+\/src\/([^/]+)(?:\/|$)/);
  if (m) return LAYER_ALIASES[m[1]] ?? m[1];

  // Pattern B: TS alias "@/src/<layer>/..."
  m = p.match(/^@\/src\/([^/]+)(?:\/|$)/);
  if (m) return LAYER_ALIASES[m[1]] ?? m[1];

  return null;
}

/**
 * Resolve an import specifier into the same shape we use for the importing
 * file so both can be classified the same way.
 *
 * For relative specifiers we resolve against the importing file's directory.
 * For alias / absolute / package specifiers we return them unchanged — the
 * pattern matcher handles them.
 *
 * @param {string} importer Absolute path of the file doing the import.
 * @param {string} specifier The import specifier as written.
 * @returns {string}
 */
function resolveSpecifier(importer, specifier) {
  if (specifier.startsWith('.')) {
    const dir = path.dirname(importer);
    return path.resolve(dir, specifier);
  }
  return specifier;
}

/* -------------------------------------------------------------------------- */
/* Legality matrix                                                            */
/* -------------------------------------------------------------------------- */

/**
 * For every (importer layer, target layer) pair, is the import legal?
 *
 * Rows = importer layer. Columns = target layer.
 *
 *                  entry  core  features  platform  integrations  data  ui
 *   entry            -     OK     NO        OK         OK         OK    OK
 *   core             -     OK     NO        OK         OK         OK    NO  (core is logic, not view)
 *   features         -     OK     NO*       OK         OK         OK    OK  (*sibling feature blocked)
 *   platform         -     OK     NO        OK         OK         OK    NO
 *   integrations     -     OK     NO        OK         OK         OK    NO
 *   data             -     NO     NO        NO         NO         OK    NO  (data is a leaf)
 *   ui               -     NO     NO        NO         NO         NO    OK  (ui is a leaf)
 *
 * The `features → features` case is conditional: the same feature can
 * import its own internal modules, but a DIFFERENT feature is blocked.
 * That conditional check is handled separately below.
 */
const LEGALITY = {
  entry: {
    entry: true,
    core: true,
    features: false,
    platform: true,
    integrations: true,
    data: true,
    ui: true,
  },
  core: {
    entry: false,
    core: true,
    features: false,
    platform: true,
    integrations: true,
    data: true,
    ui: false,
  },
  features: {
    entry: false,
    core: true,
    features: 'same-feature-only',
    platform: true,
    integrations: true,
    data: true,
    ui: true,
  },
  platform: {
    entry: false,
    core: true,
    features: false,
    platform: true,
    integrations: true,
    data: true,
    ui: false,
  },
  integrations: {
    entry: false,
    core: true,
    features: false,
    platform: true,
    integrations: true,
    data: true,
    ui: false,
  },
  data: {
    entry: false,
    core: false,
    features: false,
    platform: false,
    integrations: false,
    data: true,
    ui: false,
  },
  ui: {
    entry: false,
    core: false,
    features: false,
    platform: false,
    integrations: false,
    data: false,
    ui: true,
  },
};

/**
 * Extract the feature name (the segment after `features/`) from either an
 * importer path or a resolved import target. Returns `null` if the path
 * isn't inside features/.
 *
 * @param {string} p
 * @returns {string | null}
 */
function featureNameOf(p) {
  if (!p) return null;
  const normalized = p.replace(/\\/g, '/');
  let m = normalized.match(/apps\/[^/]+\/src\/features\/([^/]+)/);
  if (m) return m[1];
  m = normalized.match(/^@\/src\/features\/([^/]+)/);
  if (m) return m[1];
  return null;
}

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow imports that cross layer boundaries in the canonical ' +
        'apps/<surface>/src/{entry,core,features,platform,integrations,data,ui}/ layout.',
      recommended: false,
      url: 'reference-index/phase8-eslint-prototype/README.md',
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          // Allow consumers to scope the rule to a single surface. Default
          // is "any surface that uses the canonical layout".
          surface: { type: 'string' },
          // Allow specific feature-to-feature pairs to coordinate directly
          // (escape hatch, only for documented cross-feature deps).
          allowFeaturePairs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
              },
              required: ['from', 'to'],
            },
            default: [],
          },
        },
      },
    ],
    messages: {
      crossLayer:
        'Import from layer "{{targetLayer}}" is not allowed from layer ' +
        '"{{importerLayer}}". {{rationale}}',
      siblingFeature:
        'Feature "{{importerFeature}}" cannot import directly from sibling ' +
        'feature "{{targetFeature}}". Coordinate through core/ or expose a ' +
        "cross-feature contract; do not depend on a peer feature's internals.",
      uiTransit:
        'Feature "{{importerFeature}}" re-exports UI primitive "{{specifier}}". ' +
        'UI is a leaf layer — consumers must import UI primitives directly, ' +
        "not through a feature's public surface.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const importerLayer = classifyByPath(filename);

    // If the importing file isn't in a canonical layer, we have nothing to
    // say. The rule deliberately stays silent on legacy paths until they
    // are migrated.
    if (!importerLayer) return {};

    const opts = context.options[0] ?? {};
    const allowFeaturePairs = opts.allowFeaturePairs ?? [];

    /** @type {Map<string, import('eslint').AST.Node>} */
    const featureUIImports = new Map();
    /** @type {Set<string>} */
    const reExportedSpecifiers = new Set();

    return {
      ImportDeclaration(node) {
        const specifier = node.source.value;
        if (typeof specifier !== 'string') return;

        const resolved = resolveSpecifier(filename, specifier);
        const targetLayer = classifyByPath(resolved);
        if (!targetLayer) return; // Out-of-tree import — not our concern.

        // ----------------- Cross-layer matrix -----------------
        const legality = LEGALITY[importerLayer]?.[targetLayer];

        if (legality === false) {
          context.report({
            node: node.source,
            messageId: 'crossLayer',
            data: {
              importerLayer,
              targetLayer,
              rationale: rationaleFor(importerLayer, targetLayer),
            },
          });
          return;
        }

        if (legality === 'same-feature-only') {
          const importerFeature = featureNameOf(filename);
          const targetFeature = featureNameOf(resolved);
          if (importerFeature && targetFeature && importerFeature !== targetFeature) {
            const allowed = allowFeaturePairs.some(
              (p) => p.from === importerFeature && p.to === targetFeature,
            );
            if (!allowed) {
              context.report({
                node: node.source,
                messageId: 'siblingFeature',
                data: { importerFeature, targetFeature },
              });
              return;
            }
          }
        }

        // ----------------- UI transit detection -----------------
        // If a features/ file is importing from ui/, remember the specifier
        // so we can flag a re-export later.
        if (importerLayer === 'features' && targetLayer === 'ui') {
          for (const spec of node.specifiers) {
            if (spec.type === 'ImportSpecifier') {
              featureUIImports.set(spec.local.name, node);
            } else if (
              spec.type === 'ImportDefaultSpecifier' ||
              spec.type === 'ImportNamespaceSpecifier'
            ) {
              featureUIImports.set(spec.local.name, node);
            }
          }
        }
      },

      ExportNamedDeclaration(node) {
        // export { Foo } from '...'  — re-export via specifier list
        if (node.source) {
          // `export ... from '...'` form is the most direct UI-transit case.
          const targetLayer = classifyByPath(resolveSpecifier(filename, node.source.value));
          if (importerLayer === 'features' && targetLayer === 'ui') {
            context.report({
              node: node.source,
              messageId: 'uiTransit',
              data: {
                importerFeature: featureNameOf(filename) ?? '<unknown>',
                specifier: node.source.value,
              },
            });
          }
          return;
        }

        // export { Foo }; — re-export of an already-imported binding
        for (const spec of node.specifiers ?? []) {
          const local = spec.local?.name;
          if (local && featureUIImports.has(local)) {
            reExportedSpecifiers.add(local);
            const importNode = featureUIImports.get(local);
            context.report({
              node: spec,
              messageId: 'uiTransit',
              data: {
                importerFeature: featureNameOf(filename) ?? '<unknown>',
                specifier: importNode.source.value,
              },
            });
          }
        }
      },

      ExportAllDeclaration(node) {
        if (!node.source) return;
        const targetLayer = classifyByPath(resolveSpecifier(filename, node.source.value));
        if (importerLayer === 'features' && targetLayer === 'ui') {
          context.report({
            node: node.source,
            messageId: 'uiTransit',
            data: {
              importerFeature: featureNameOf(filename) ?? '<unknown>',
              specifier: node.source.value,
            },
          });
        }
      },
    };
  },
};

/**
 * Human-readable rationale for each blocked pair. Keeps the diagnostic
 * pointed at the design intent, not just the matrix.
 */
function rationaleFor(importerLayer, targetLayer) {
  // entry → features
  if (importerLayer === 'entry' && targetLayer === 'features') {
    return 'entry/ wires routes via core/. Route a feature through core/ orchestration instead of importing it directly.';
  }
  // anything → features (non-self)
  if (targetLayer === 'features') {
    return 'features/ is private to its feature. Reach it via a core/ orchestrator or a documented cross-feature contract.';
  }
  // data → not data
  if (importerLayer === 'data') {
    return 'data/ is a leaf — it must not depend on logic, features, UI, or platform code. Invert the dependency: have the caller pass in what it needs.';
  }
  // ui → not ui
  if (importerLayer === 'ui') {
    return 'ui/ is presentation-only. It cannot reach into logic, features, platform, integrations, or data. Move the call site out of ui/.';
  }
  // anything else → ui (and importer is not allowed to view UI)
  if (targetLayer === 'ui') {
    return `Files in ${importerLayer}/ should not import UI primitives directly. UI is consumed by entry/ and features/ only.`;
  }
  return 'See reference-index/phase8-eslint-prototype/README.md for the canonical layer-map.';
}

/* -------------------------------------------------------------------------- */
/* Plugin export (flat-config compatible)                                     */
/* -------------------------------------------------------------------------- */

module.exports = {
  meta: {
    name: 'eslint-plugin-agi-layers',
    version: '0.0.1-prototype',
  },
  rules: {
    'no-cross-layer-import': rule,
  },
  // Re-export the raw rule for direct consumption in tests where the
  // plugin wrapper isn't needed.
  __rule: rule,
  __internals: {
    classifyByPath,
    featureNameOf,
    LAYERS: _LAYERS,
    LEGALITY,
    resolveSpecifier,
  },
};
