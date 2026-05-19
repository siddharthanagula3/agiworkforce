import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Global ignores
  {
    ignores: [
      'dist/**',
      '**/dist/**',
      'build/**',
      '**/build/**',
      'out/**',
      '**/out/**',
      '.next/**',
      '**/.next/**',
      'node_modules/**',
      '**/node_modules/**',
      '**/src-tauri/**',
      'target/**',
      '**/target/**',
      'examples/**',
      'apps/_future_mobile/**',
      '**/next-env.d.ts',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      '**/e2e/**',
      '**/playwright/**',
      'scripts/**',
      'coverage/**',
      '**/coverage/**',
      '**/.expo/**',
      '.claude/worktrees/**',
      '**/.claude/worktrees/**',
      '.worktrees/**',
      '**/.worktrees/**',
      // Root-level utility/test scripts
      'create-account.js',
      'test-*.js',
      // Web app maintenance/migration scripts (Node.js CJS, not app source)
      'apps/web/scripts/**',
      // VS Code extension utility scripts (Node.js CJS, not app source)
      'apps/extension-vscode/scripts/**',
      // Workspace stub for react-native-worklets (CJS, no linting needed)
      'packages/react-native-worklets/**',
      // AI coding tool config directories (not app source)
      '.opencode/**',
      '.codex/**',
      '.cursor/**',
      '**/.vercel/**',
      // Build artifacts (Vite SPA output served as static files)
      '**/public/chat/**',
      '**/dist-web/**',
      // Rust crate vendored JS files (not app source)
      'crates/**',
      '**/crates/**',
    ],
  },

  // Base JS config
  js.configs.recommended,

  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // React global (JSX transform)
        React: 'readonly',
        JSX: 'readonly',
        // Node.js namespace
        NodeJS: 'readonly',
        // Browser globals
        window: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        HeadersInit: 'readonly',
        RequestInit: 'readonly',
        ResponseInit: 'readonly',
        BodyInit: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
        TransformStream: 'readonly',
        crypto: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        EventTarget: 'readonly',
        ErrorEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        PointerEvent: 'readonly',
        TouchEvent: 'readonly',
        FocusEvent: 'readonly',
        DragEvent: 'readonly',
        ClipboardEvent: 'readonly',
        WheelEvent: 'readonly',
        UIEvent: 'readonly',
        ProgressEvent: 'readonly',
        MessageEvent: 'readonly',
        PromiseRejectionEvent: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        Element: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLVideoElement: 'readonly',
        HTMLAudioElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLParagraphElement: 'readonly',
        HTMLHeadingElement: 'readonly',
        HTMLSpanElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        HTMLLIElement: 'readonly',
        HTMLUListElement: 'readonly',
        HTMLOListElement: 'readonly',
        HTMLTableElement: 'readonly',
        HTMLTableRowElement: 'readonly',
        HTMLTableCellElement: 'readonly',
        HTMLTableSectionElement: 'readonly',
        HTMLTableCaptionElement: 'readonly',
        HTMLIFrameElement: 'readonly',
        HTMLLabelElement: 'readonly',
        HTMLPreElement: 'readonly',
        SVGElement: 'readonly',
        SVGSVGElement: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        DocumentFragment: 'readonly',
        Range: 'readonly',
        Selection: 'readonly',
        DOMRect: 'readonly',
        DOMRectReadOnly: 'readonly',
        CSSStyleDeclaration: 'readonly',
        XMLSerializer: 'readonly',
        DOMParser: 'readonly',
        XPathResult: 'readonly',
        ClipboardItem: 'readonly',
        Clipboard: 'readonly',
        MediaQueryList: 'readonly',
        MediaQueryListEvent: 'readonly',
        getComputedStyle: 'readonly',
        matchMedia: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        queueMicrotask: 'readonly',
        Image: 'readonly',
        Audio: 'readonly',
        MediaStream: 'readonly',
        MediaRecorder: 'readonly',
        WebSocket: 'readonly',
        Worker: 'readonly',
        SharedWorker: 'readonly',
        ServiceWorker: 'readonly',
        Notification: 'readonly',
        Performance: 'readonly',
        performance: 'readonly',
        PerformanceObserver: 'readonly',
        PerformanceEntry: 'readonly',
        PerformanceNavigationTiming: 'readonly',
        PerformanceMark: 'readonly',
        PerformanceMeasure: 'readonly',
        PerformanceResourceTiming: 'readonly',
        Storage: 'readonly',
        // WebRTC globals
        RTCPeerConnection: 'readonly',
        RTCDataChannel: 'readonly',
        RTCSessionDescription: 'readonly',
        RTCSessionDescriptionInit: 'readonly',
        RTCIceCandidate: 'readonly',
        RTCIceCandidateInit: 'readonly',
        RTCIceServer: 'readonly',
        RTCConfiguration: 'readonly',
        RTCOfferOptions: 'readonly',
        RTCAnswerOptions: 'readonly',
        RTCDataChannelInit: 'readonly',
        MediaStreamTrack: 'readonly',
        location: 'readonly',
        history: 'readonly',
        screen: 'readonly',
        speechSynthesis: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBTransaction: 'readonly',
        IDBRequest: 'readonly',
        Proxy: 'readonly',
        Reflect: 'readonly',
        Symbol: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Promise: 'readonly',
        ArrayBuffer: 'readonly',
        Uint8Array: 'readonly',
        Int8Array: 'readonly',
        Uint16Array: 'readonly',
        Int16Array: 'readonly',
        Uint32Array: 'readonly',
        Int32Array: 'readonly',
        Float32Array: 'readonly',
        Float64Array: 'readonly',
        DataView: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        RegExp: 'readonly',
        Error: 'readonly',
        TypeError: 'readonly',
        SyntaxError: 'readonly',
        ReferenceError: 'readonly',
        RangeError: 'readonly',
        // Node.js globals for config files and tests
        process: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        // Test globals
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: {
          project: [
            './tsconfig.base.json',
            './apps/desktop/tsconfig.json',
            './apps/web/tsconfig.json',
          ],
        },
      },
    },
    rules: {
      // TypeScript rules
      ...tsPlugin.configs.recommended.rules,
      // `no-undef` is not TypeScript-aware and produces false positives in TS files.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'off',

      // React rules
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import rules
      'import/no-named-as-default': 'off',
      'import/no-duplicates': 'off',
      'import/default': 'off',
      'import/no-named-as-default-member': 'off',

      // General rules
      'no-unused-vars': 'off',
      'no-useless-catch': 'off',
      'prefer-const': 'warn',
      // Prevent console.log in production — use toast or structured logging instead.
      // console.warn and console.error are allowed for error reporting.
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
    },
  },

  // ---------------------------------------------------------------------------
  // PREVENTION LAYER — Wave 1.5 (per docs/plans/UNIFIED_LAUNCH_PLAN.md §1.5).
  //
  // Two recurring bug classes earned dedicated AST gates after the
  // 2026-05-05 audit (CLI ghost-model `claude-opus-4-6-mini`, the
  // `FAST_STATUS_MODEL = "gpt-5.4"` const, and 56 web routes reusing the
  // service-role key for downstream DB ops on user-scoped data):
  //
  //   1. Hardcoded model IDs anywhere except `models.json`, the catalog
  //      itself, tests, and explicitly-marked marketing copy. The locked
  //      rule (CLAUDE.md §"Critical rules") is "never hardcode model IDs;
  //      read from models.json" — this rule keeps regressions out at lint
  //      time instead of catching them in QA.
  //   2. `createClient(url, SUPABASE_SERVICE_ROLE_KEY, …)` outside the
  //      sanctioned `lib/supabase*.ts` helpers. Service-role clients
  //      bypass RLS and must only flow through `getServiceClient()` /
  //      `getUserClient(jwt)` so reviewers can see every privileged
  //      construction in one place.
  //
  // Both rules use `no-restricted-syntax` with AST selectors so they fire
  // before TypeScript checks. Known-violating sites get a baseline
  // override (below) tagged with `// FIXME: P1-XX` so `main` stays green
  // while the migration lands.
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      // The catalog SSOT itself — model IDs are LITERALLY the data here.
      'packages/types/src/models.json',
      'packages/types/src/model-catalog.ts',
      // Sanctioned Supabase client constructors — these are where
      // `getServiceClient()` / `getUserClient(jwt)` are DEFINED, so the
      // service-role-key gate would self-report here.
      '**/lib/supabase.ts',
      '**/lib/supabase-server.ts',
      '**/lib/supabaseClients.ts',
      // Tests can — and should — assert against literal model IDs to
      // pin the catalog SSOT. The harm is in production code paths.
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/__mocks__/**',
      // MARKETING constants files explicitly carry model IDs as ad copy.
      // Convention: any file under a `marketing/` directory or whose
      // name ends with `Marketing.ts(x)` is allowed to hold literals.
      '**/marketing/**',
      '**/*Marketing.ts',
      '**/*Marketing.tsx',
      // Generated TypeScript declaration files — mirror upstream APIs.
      '**/*.d.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Hardcoded model IDs — the catalog (models.json) is the SSOT.
          // The selector matches string literals that look like a real
          // model ID, not generic prefix tokens. The regex requires a
          // digit (or canonical model-family word) immediately after
          // the provider prefix so substring tests like
          // `model.includes('claude-')` and tool-name strings like
          // `'claude-code'` are NOT flagged. Matches: `'gpt-5.4'`,
          // `"gpt-5.4-mini"`, `'claude-opus-4-7'`, `'claude-sonnet-4.6'`,
          // `'gemini-3.1-flash-lite'`, `'grok-4.3'`, `'o1-mini'`.
          // Misses: `'claude-'`, `'gpt-'`, `'claude-code'` (tool name),
          // `'claude-cookbook'` (doc reference).
          selector:
            'Literal[value=/^(gpt-[0-9]|claude-(?:opus|sonnet|haiku|[1-9])|gemini-[0-9]|grok-[0-9]|o[1-9]-[a-z])/]',
          message:
            'Hardcoded model ID detected. Read from models.json via packages/types model-catalog helpers (getDefaultModelFor, resolveAutoModeModel, getRoutingSlotModel) — NEVER inline a literal. See CLAUDE.md "Critical rules". To opt out (tests, marketing copy), add `// eslint-disable-next-line no-restricted-syntax` with a `// FIXME: P1-XX` if migration is pending.',
        },
        {
          // Service-role-key Supabase clients outside `lib/supabase*.ts`.
          // Matches any reference to the env var inside a `createClient(`
          // call subtree — covers `process.env.SUPABASE_SERVICE_ROLE_KEY`
          // (MemberExpression) and `SUPABASE_SERVICE_ROLE_KEY` re-exports
          // (Identifier).
          selector:
            "CallExpression[callee.name='createClient'] :matches(Identifier[name='SUPABASE_SERVICE_ROLE_KEY'], MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY'])",
          message:
            'Service-role Supabase clients must flow through getServiceClient() in lib/supabase-server.ts (web) or lib/supabaseClients.ts (api-gateway) so RLS-bypass usage is auditable. Use getUserClient(userJwt) for user-scoped operations. See docs/plans/UNIFIED_LAUNCH_PLAN.md §1.',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // V3 surface guardrails — narrow-scope rules that lock the new desktop chat
  // shell to the design-spec brand + IA decisions.
  //
  // These rules apply ONLY to `apps/desktop/src/components/v3/**` (and the
  // matching e2e specs). Existing surfaces are not retroactively affected;
  // the scope can be widened in a follow-up PR once each legacy site is
  // either fixed or annotated.
  // ---------------------------------------------------------------------------
  {
    files: [
      'apps/desktop/src/components/v3/**/*.ts',
      'apps/desktop/src/components/v3/**/*.tsx',
      'apps/desktop/e2e/v3-*.spec.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Brand string — user-facing copy must be "AGI", not "AGI Workforce",
          // per docs/design/design-spec-2026-05-15.md. Catches both bare
          // string literals (toast titles, alt text) and JSX text children.
          selector: ':matches(Literal[value=/^AGI Workforce/], JSXText[value=/AGI Workforce/])',
          message:
            'User-facing brand string must be "AGI" per docs/design/design-spec-2026-05-15.md. Use a BRAND_NAME constant or `t("brand.name")` for i18n. To opt out (legal copy, audit logs), add `// eslint-disable-next-line no-restricted-syntax` with a justification.',
        },
      ],
      // Block re-introducing the deleted ModeSelectionDialog component.
      // Mode selection lives in OnboardingWizard.tsx per CLAUDE.md.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ModeSelectionDialog', '**/ModeSelectionDialog/*'],
              message:
                'ModeSelectionDialog was removed in 2026-05; mode picker lives in OnboardingWizard.tsx. Do not reintroduce.',
            },
          ],
        },
      ],
    },
  },

  // JavaScript files
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // VS Code extension build scripts (CommonJS Node.js)
  {
    files: ['apps/extension-vscode/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },

  // Browser extension files
  {
    files: ['apps/extension/**/*.js', 'apps/extension/**/*.ts', 'apps/extension/**/*.tsx'],
    languageOptions: {
      globals: {
        chrome: 'readonly',
        CSS: 'readonly',
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        HTMLElement: 'readonly',
        MutationObserver: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
  },

  // Node.js services
  {
    files: ['services/**/*.ts', 'services/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },

  // Test files
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/test/**/*.ts',
      '**/test/**/*.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
    ],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Web app: `any` is used extensively for web port compatibility (desktop-to-web stubs,
  // Tauri API shims, and Zustand store adapters). The web app has its own
  // eslint.config.mjs (eslint-config-next) for full per-workspace linting.
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Web app stubs: intentionally use `any` for desktop-parity stub implementations.
  // These files provide no-op shims for Tauri/desktop-only modules so the web app compiles.
  {
    files: [
      // Unified store stubs (desktop Zustand stores shimmed for web)
      'apps/web/stores/unified/**/*.ts',
      'apps/web/stores/unified/**/*.tsx',
      // API stubs (desktop Tauri API wrappers)
      'apps/web/api/**/*.ts',
      // Utility stubs (desktop-only utilities)
      'apps/web/utils/autoCorrection.ts',
      'apps/web/utils/captureTransforms.ts',
      'apps/web/utils/clipboard.ts',
      'apps/web/utils/commandHistory.ts',
      'apps/web/utils/credits.ts',
      'apps/web/utils/ipc.ts',
      'apps/web/utils/navigation.ts',
      'apps/web/utils/security.ts',
      'apps/web/utils/subscriptionGate.ts',
      'apps/web/utils/tokenCount.ts',
      // Handler stubs
      'apps/web/handlers/slashCommandHandlers.ts',
      // Service stubs
      'apps/web/services/supabaseAuth.ts',
      // Store stubs
      'apps/web/stores/artifactStore.ts',
      'apps/web/stores/memoryStore.ts',
      'apps/web/stores/schedulerStore.ts',
      // Constant stubs
      'apps/web/constants/errorMessages.ts',
      'apps/web/constants/event-names.ts',
      'apps/web/constants/planModels.ts',
      // Component stubs (desktop-only UI components shimmed for web)
      'apps/web/components/Browser/BrowserVisualization.tsx',
      'apps/web/components/Canvas.tsx',
      'apps/web/components/Editor/MonacoEditor.tsx',
      'apps/web/components/ErrorBoundary.tsx',
      'apps/web/components/Execution/TerminalPanel.tsx',
      'apps/web/components/Execution/TimeoutWarningDialog.tsx',
      'apps/web/components/MemoryPanel.tsx',
      'apps/web/components/ROIDashboard/roiStore.tsx',
      'apps/web/components/ScreenCapture/ScreenCaptureButton.tsx',
      'apps/web/components/Subscription.tsx',
      'apps/web/components/UnifiedAgenticChat/Sidecar/DiffViewer.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // intentional stub files
    },
  },

  // Desktop app: `any` is now enforced (warn from base config applies)
  // (apps/desktop has its own tsconfig with stricter settings for local development)

  // Mobile app: `any` is now enforced (warn from base config applies)
  {
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // PREVENTION-LAYER BASELINE — Wave 1.5
  //
  // The two prevention rules above (no-restricted-syntax for hardcoded
  // model IDs + service-role-key Supabase clients) ship in Wave 1.5
  // BEFORE any caller migration. The files listed below contain known
  // violations that pre-date the rule; each is tagged with a FIXME
  // pointing at the wave/task that will migrate it. Tests, the catalog
  // SSOT, and marketing copy are exempted in the rule itself (above).
  //
  // Migration tickets:
  //   FIXME: P1-MODEL-CATALOG-MIGRATION — replace hardcoded literals with
  //     getRoutingSlotModel() / getDefaultModelFor() / resolveAutoModeModel()
  //     reads from packages/types model-catalog. Tracked across:
  //       - Wave 1   P0-G/I  → services/api-gateway routes (4 files)
  //       - Wave 1   P0-J/K/L → packages/{routing,llm-normalize}
  //       - Wave 2   model-id sweep → desktop / cli / mobile / web
  //   FIXME: P1-RLS-CLIENT-MIGRATION — route handler uses createClient(...,
  //     SERVICE_ROLE_KEY, ...) directly instead of getServiceClient() /
  //     getUserClient(jwt). Tracked under Wave 1 P0-G (api-gateway) and
  //     P0-C (web — Stripe webhook + downgrades + RLS sweep).
  //
  // Once a wave migrates a file, remove its entry from the lists below
  // so the rule starts enforcing on it again.
  // ---------------------------------------------------------------------------
  {
    files: [
      // Web — production code paths still on hardcoded model IDs.
      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 1 P0-C / Wave 2 sweep)
      'apps/web/lib/marketing-constants.ts',
      'apps/web/lib/assert-quota.ts',
      'apps/web/lib/llm-providers/context-management.ts',
      'apps/web/lib/llm-providers/google.ts',
      'apps/web/shared/config/supported-models.ts',
      'apps/web/shared/stores/chat-store.ts',
      'apps/web/shared/stores/multi-agent-chat-store.ts',
      'apps/web/tests/fixtures/test-data-factory.ts',
      'apps/web/app/api/admin/directory-sync/route.ts',
      'apps/web/app/api/admin/security/route.ts',
      'apps/web/app/api/admin/sso/route.ts',
      'apps/web/app/api/agents/execute/route.ts',
      'apps/web/app/api/auth/sso-check/route.ts',
      'apps/web/app/api/completion/route.ts',
      'apps/web/app/api/github/webhook/route.ts',
      'apps/web/app/api/mission/route.ts',
      'apps/web/app/api/stripe-webhook/route.ts',
      'apps/web/app/api/webhooks/directory-sync/route.ts',
      'apps/web/app/chat-multi/page.tsx',
      'apps/web/components/CommandPalette/CommandPalette.tsx',
      'apps/web/core/ai/llm/providers/anthropic-claude.ts',
      'apps/web/core/ai/llm/providers/google-gemini.ts',
      'apps/web/core/ai/llm/providers/grok-ai.ts',
      'apps/web/core/ai/llm/unified-language-model.ts',
      'apps/web/core/ai/llm/user-ai-preferences.ts',
      'apps/web/core/ai/orchestration/model-router.ts',
      'apps/web/core/ai/tools/tool-invocation-handler.ts',
      'apps/web/core/security/api-abuse-prevention.ts',
      'apps/web/features/analytics/pages/AnalyticsDashboard.tsx',
      'apps/web/features/chat/hooks/use-ai-preferences.ts',
      'apps/web/features/pages/legal/BusinessLegalPage.tsx',
      'apps/web/features/schedules/types/index.ts',
      'apps/web/features/settings/hooks/use-settings-queries.ts',
      'apps/web/features/settings/services/user-preferences.ts',

      // Desktop — production code paths.
      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 2 desktop+cli sweep)
      'apps/desktop/src/components/Settings/ComputerUseSettings.tsx',
      'apps/desktop/src/components/Workflows/AutomationBuilder.tsx',
      'apps/desktop/src/features/experimental/ModelComparisonView.tsx',
      'apps/desktop/src/lib/modelRouter.ts',
      'apps/desktop/src/lib/tauri-mock.ts',
      'apps/desktop/src/runtime/WebRuntime.ts',
      'apps/desktop/src/stores/voiceModeStore.ts',
      'apps/desktop/src/test/msw-setup.ts',

      // Mobile + VS Code extension surfaces.
      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 2 mobile+vscode sweep)
      'apps/extension-vscode/src/services/modelConstants.ts',
      'apps/mobile/lib/models.ts',

      // Shared packages.
      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 1 P0-J/K/L)
      'packages/llm-normalize/src/openai-reasoning-effort.ts',
      'packages/providers/google/src/catalog.ts',
      'packages/routing/src/classify.ts',
      'packages/api/src/memoryImport.ts',

      // Services — api-gateway routes.
      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 1 P0-G/I)
      // llm.ts migrated in Wave 1 task #10 (P0-I) — entry removed.
      'services/api-gateway/src/routes/cloudChat.ts',
      'services/api-gateway/src/routes/dotfile.ts',
      'services/api-gateway/src/routes/models.ts',
    ],
    rules: {
      // Baseline — these files violate the prevention layer; migration is
      // tracked above. Remove the entry once migrated.
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: [
      // Service-role key construction outside lib/supabase*.ts.
      // FIXME: P1-RLS-CLIENT-MIGRATION (Wave 1 P0-C web RLS sweep)
      'apps/web/lib/security-audit.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // Prettier config (must be last to override other formatting rules)
  prettierConfig,
];
