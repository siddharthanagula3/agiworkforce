import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import { readFileSync } from 'node:fs';

const RETIRED_MODEL_CATALOG = JSON.parse(
  readFileSync(
    new URL('./packages/ai/model-registry/catalog/retired-models.json', import.meta.url),
    'utf8',
  ),
);
const RETIRED_MODEL_LITERAL_PATTERN = [
  ...(RETIRED_MODEL_CATALOG.retiredModelIds ?? []),
  ...(RETIRED_MODEL_CATALOG.guardedNonCanonicalModelIds ?? []),
]
  .map((id) =>
    String(id)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replaceAll('/', '\\/'),
  )
  .join('|');

const PREVENTION_LAYER_RESTRICTED_SYNTAX = [
  {
    selector:
      'Literal[value=/^(gpt-[0-9]|claude-(?:opus|sonnet|haiku|[1-9])|gemini-[0-9]|grok-[0-9]|o[1-9]-[a-z])/]',
    message:
      'Hardcoded model ID detected. Read from models.json via packages/contracts/types model-catalog helpers (getDefaultModelFor, resolveAutoModeModel, getRoutingSlotModel), NEVER inline a literal. See CLAUDE.md "Critical rules". To opt out (tests, marketing copy), add `// eslint-disable-next-line no-restricted-syntax` with a `// FIXME: P1-XX` if migration is pending.',
  },
  {
    // retired-model registry keeps the fast ESLint feedback without creating
    selector: `Literal[value=/^(?:${RETIRED_MODEL_LITERAL_PATTERN})$/]`,
    message:
      'Deprecated model alias literal detected. Never hardcode model IDs: resolve the current catalog route through @agiworkforce/types helpers.',
  },
  {
    selector:
      "CallExpression[callee.name='fetch']:has(TemplateLiteral Identifier[name=/^(WEB_APP_URL|API_BASE_URL)$/])",
    message:
      'Raw fetch() to an our-cloud URL (WEB_APP_URL/API_BASE_URL) bypasses the egress chokepoint and can leak a Local/BYOK session to our cloud. Use guardedFetch from @/lib/egressGuard so non-managed sessions fail closed. See apps/desktop/src/lib/egressGuard.ts.',
  },
];

export default [
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
      'packages/contracts/types/src/generated/**',
      '**/src-tauri/**',
      'target/**',
      '**/target/**',
      'examples/**',
      'apps/_future_mobile/**',
      '**/next-env.d.ts',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      'apps/desktop/**/e2e/**',
      'apps/extension/e2e/**',
      'apps/web/e2e/*',
      'apps/web/e2e/**/*',
      '!apps/web/e2e/authenticated-flows.spec.ts',
      '!apps/web/e2e/checkout.spec.ts',
      '!apps/web/e2e/marketing-mobile-nav.spec.ts',
      '!apps/web/e2e/marketing-stage-contrast.spec.ts',
      '!apps/web/e2e/public-auth-clean.spec.ts',
      '!apps/web/e2e/variant-pager.spec.ts',
      '**/playwright/**',
      'scripts/**',
      'coverage/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/.vscode-test/**',
      '.claude/worktrees/**',
      '**/.claude/worktrees/**',
      '.claude/workflows/**',
      '**/.claude/workflows/**',
      '.worktrees/**',
      '**/.worktrees/**',
      '.remember/**',
      '**/.remember/**',
      'create-account.js',
      'test-*.js',
      'apps/web/scripts/**',
      'apps/mobile/scripts/**',
      'apps/cli/scripts/**',
      'apps/extension-vscode/scripts/**',
      'packages/react-native-worklets/**',
      'docs/archive/**',
      '.opencode/**',
      '.codex/**',
      '.cursor/**',
      '**/.vercel/**',
      '**/public/chat/**',
      '**/dist-web/**',
      'crates/**',
      '**/crates/**',
    ],
  },

  js.configs.recommended,

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
        React: 'readonly',
        JSX: 'readonly',
        NodeJS: 'readonly',
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
      ...tsPlugin.configs.recommended.rules,
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

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'import/no-named-as-default': 'off',
      'import/no-duplicates': 'off',
      'import/default': 'off',
      'import/no-named-as-default-member': 'off',

      'no-unused-vars': 'off',
      'no-useless-catch': 'off',
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
    },
  },

  // override (below) tagged with `// FIXME: P1-XX` so `main` stays green
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      'packages/contracts/types/src/models.json',
      'packages/contracts/types/src/model-catalog.ts',
      'packages/platform/local-llm/src/catalog.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/marketing/**',
      '**/*Marketing.ts',
      '**/*Marketing.tsx',
      '**/*.d.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...PREVENTION_LAYER_RESTRICTED_SYNTAX],
    },
  },

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
          selector: ':matches(Literal[value=/^AGI Workforce/], JSXText[value=/AGI Workforce/])',
          message:
            'User-facing brand string must be "AGI" per docs/design/design-spec-2026-05-15.md. Use a BRAND_NAME constant or `t("brand.name")` for i18n. To opt out (legal copy, audit logs), add `// eslint-disable-next-line no-restricted-syntax` with a justification.',
        },
      ],
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

  {
    files: ['apps/cli/npm/**/*.js', 'apps/cli/npm/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },

  {
    files: ['**/__mocks__/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        jest: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
  },

  {
    files: ['apps/mobile/native/**/*.cjs', 'apps/mobile/lib/polyfills/**/*.cjs'],
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
      },
    },
  },

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
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@agiworkforce/utils',
              message:
                'Chrome must import a browser-safe @agiworkforce/utils subpath; the root barrel also exports Node-only path containment code.',
            },
          ],
        },
      ],
    },
  },

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

  {
    files: ['apps/desktop/wdio/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // eslint.config.mjs (eslint-config-next) for full per-workspace linting.
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: [
      'apps/web/stores/unified/**/*.ts',
      'apps/web/stores/unified/**/*.tsx',
      'apps/web/api/**/*.ts',
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
      'apps/web/stores/artifactStore.ts',
      'apps/web/stores/memoryStore.ts',
      'apps/web/stores/schedulerStore.ts',
      'apps/web/constants/errorMessages.ts',
      'apps/web/constants/event-names.ts',
      'apps/web/constants/planModels.ts',
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

  {
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: [
      'apps/mobile/src/features/**/*.ts',
      'apps/mobile/src/features/**/*.tsx',
      'apps/mobile/src/shared/**/*.ts',
      'apps/mobile/src/shared/**/*.tsx',
    ],
    ignores: [
      'apps/mobile/src/**/*.test.ts',
      'apps/mobile/src/**/*.test.tsx',
      'apps/mobile/src/**/__tests__/**',
      'apps/mobile/src/**/__mocks__/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...PREVENTION_LAYER_RESTRICTED_SYNTAX,
        {
          selector:
            ':matches(Literal[value=/rgba\\(\\s*255\\s*,\\s*255\\s*,\\s*255|rgba\\(\\s*0\\s*,\\s*0\\s*,\\s*0/], TemplateElement[value.raw=/rgba\\(\\s*255\\s*,\\s*255\\s*,\\s*255|rgba\\(\\s*0\\s*,\\s*0\\s*,\\s*0/])',
          message:
            'Literal rgba white/black bypasses the theme. `white` is aliased to var(--agi-fg) and every shade here has a token, use useThemeColors(): border/borderLight, neutralSurface, inputSurface, progressTrack, scrim, cameraOverlay* (apps/mobile/src/ui/theme/tokens.ts). Literal monochrome is only correct over the camera preview or the voice sheet, which have their own cameraOverlay*/voice* tokens.',
        },
      ],
    },
  },

  {
    files: [
      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 1 P0-C / Wave 2 sweep)
      'apps/web/lib/marketing-constants.ts',
      'apps/web/lib/assert-quota.ts',
      'apps/web/lib/llm-providers/context-management.ts',
      'apps/web/lib/llm-providers/google.ts',
      'apps/web/shared/config/supported-models.ts',
      'apps/web/shared/stores/chat-store.ts',
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
      'apps/web/components/CommandPalette/CommandPalette.tsx',
      'apps/web/core/ai/llm/providers/anthropic-claude.ts',
      'apps/web/core/ai/llm/providers/google-gemini.ts',
      'apps/web/core/ai/llm/unified-language-model.ts',
      'apps/web/core/ai/llm/user-ai-preferences.ts',
      'apps/web/core/security/api-abuse-prevention.ts',
      'apps/web/features/analytics/pages/AnalyticsDashboard.tsx',
      'apps/web/src/features/analytics/pages/AnalyticsDashboard.tsx', // Phase 5 web reorg mirror
      'apps/web/features/chat/hooks/use-ai-preferences.ts',
      'apps/web/features/pages/legal/BusinessLegalPage.tsx',
      'apps/web/features/schedules/types/index.ts',
      'apps/web/src/features/schedules/types/index.ts', // Phase 5 web reorg mirror
      'apps/web/features/settings/hooks/use-settings-queries.ts',
      'apps/web/features/settings/services/user-preferences.ts',

      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 2 desktop+cli sweep)
      'apps/desktop/src/components/Settings/ComputerUseSettings.tsx',
      'apps/desktop/src/components/Workflows/AutomationBuilder.tsx',
      'apps/desktop/src/features/experimental/ModelComparisonView.tsx',
      'apps/desktop/src/lib/tauri-mock.ts',
      'apps/desktop/src/runtime/WebRuntime.ts',
      'apps/desktop/src/stores/voiceModeStore.ts',
      'apps/desktop/src/test/msw-setup.ts',

      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 2 mobile+vscode sweep)
      'apps/extension-vscode/src/features/model-picker/modelConstants.ts',
      'apps/mobile/lib/models.ts',

      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 1 P0-J/K/L)
      'packages/ai/providers/google/src/catalog.ts',
      'packages/ai/routing/src/classify.ts',
      'packages/client/desktop-command-client/src/memoryImport.ts',

      // FIXME: P1-MODEL-CATALOG-MIGRATION (Wave 1 P0-G/I)
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: [
      // FIXME: P1-DATA-CLIENT-MIGRATION (Wave 1 P0-C web data sweep)
      'apps/web/lib/security-audit.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  prettierConfig,
];
