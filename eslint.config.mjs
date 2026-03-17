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

  // Prettier config (must be last to override other formatting rules)
  prettierConfig,
];
