import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import reactPlugin from 'eslint-plugin-react';

const disabledReactRules = Object.fromEntries(
  Object.keys(reactPlugin.rules ?? {}).map((ruleName) => [`react/${ruleName}`, 'off']),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'dist-web/**',
    'public/chat/**',
    // CJS helper scripts (use require, __dirname, console)
    'scripts/**',
  ]),
  // Global: allow _-prefixed unused vars (standard convention for intentionally unused params)
  {
    rules: {
      // eslint-plugin-react 7.x calls removed ESLint 10 rule-context APIs from several rules.
      // Keep Next, React Hooks, TypeScript, and build-time component validation active.
      ...disabledReactRules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  // Relax strict rules for desktop-ported stubs and components.
  // These files use `any` intentionally for mock/stub interfaces and contain
  // ported desktop code that doesn't run in the web app.
  {
    files: [
      'app/**',
      'components/**',
      'features/**',
      'shared/**',
      'hooks/**',
      'lib/**',
      'stores/**',
      'types/**',
      'utils/**',
      'handlers/**',
      'constants/**',
      'services/**',
      'providers/**',
      'api/**',
      'test/**',
      '__tests__/**',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Stub components use intentional _-prefixed parameters for interface compatibility
      '@typescript-eslint/no-unused-vars': 'off',
      // Existing route error boundaries intentionally use plain anchors for hard reload recovery.
      '@next/next/no-html-link-for-pages': 'off',
      // Dynamic/user-generated image URLs cannot use next/image (no known domain at build time)
      '@next/next/no-img-element': 'off',
      // React Compiler rules — ported desktop components trigger these
      // because they use patterns incompatible with the React Compiler
      // (setState in effects, ref access during render, etc.)
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
  // WEB-37 (audit 2026-05-19): forbid `dangerouslySetInnerHTML` in
  // llm-guardrail-allow: this block IS the ban on the sink, not a use of it
  // dynamic-content surfaces (features/**, components/**). JSON-LD in
  // server-component layouts (app/**/layout.tsx and app/**/page.tsx) is
  // exempt because the content is developer-authored at build time.
  // The 5 legitimate dynamic sites (DOMPurify-sanitized artifact / mermaid
  // / katex render, and static-const marketing showcase) carry per-line
  // eslint-disable comments with WEB-37 justification.
  {
    files: ['features/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    ignores: ['shared/utils/html-sanitizer.ts', '**/*.{test,spec}.{ts,tsx}', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // llm-guardrail-allow: rule selector/message naming the banned sink
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            // llm-guardrail-allow: rule message naming the banned sink
            'dangerouslySetInnerHTML can introduce XSS. Sanitize via DOMPurify (@shared/utils/html-sanitizer) and add a per-line eslint-disable with WEB-37 justification, or render via JSX.',
        },
      ],
    },
  },
  // WEB-18 (audit 2026-05-19): forbid `auth.getSession()` in server-component
  // auth gates. getSession() returns unverified cached cookie data; auth gates
  // must use auth.getUser() which re-validates the JWT signature with the
  // auth server. Scope is narrow on purpose — client-side files that
  // legitimately read the access token (for outbound API Authorization
  // headers) are not flagged. After PR-2's getSession sweep, this rule is
  // expected to fire zero times; the rule's job is regression-prevention.
  {
    files: ['app/**/layout.tsx', 'app/**/page.tsx'],
    ignores: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='getSession'][callee.object.property.name='auth']",
          message:
            'Page/layout auth gates must use auth.getUser() (re-validates the JWT) not auth.getSession() (only reads cookies) — WEB-18.',
        },
      ],
    },
  },
  // WEB-13 (audit 2026-05-19): forbid Math.random in security-sensitive paths.
  // CSPRNG quality is required for tokens, filenames, IDs, and rollout
  // bucketing in these directories. Use @/lib/secure-random helpers instead.
  // The remaining non-security uses (cosmetic loading messages, retry jitter,
  // local-only client queue IDs) carry per-line eslint-disable comments with
  // WEB-13 justification.
  {
    files: [
      'features/chat/services/**/*.{ts,tsx}',
      'features/chat/hooks/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'app/api/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**', 'lib/secure-random.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'Use secureToken() / secureRandomFloat() / secureFilenameSegment() from @/lib/secure-random — Math.random is not cryptographically secure (WEB-13).',
        },
      ],
    },
  },
  // AUDIT-FIX: TEXT/HTML-BLOB — forbid `new Blob([...], { type: 'text/html' })`.
  // Downloads of attacker-controlled HTML via the `download` attribute are an XSS
  // vector (rendered by the browser when opened locally). Use 'text/plain' or
  // 'application/octet-stream' instead.
  {
    files: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'features/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'shared/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'NewExpression[callee.name="Blob"] ObjectExpression Property[key.name="type"][value.value=/text\\/html/]',
          message:
            "Use 'text/plain' or 'application/octet-stream' for Blob; text/html in a Blob allows XSS via download attribute.",
        },
      ],
    },
  },
]);

export default eslintConfig;
