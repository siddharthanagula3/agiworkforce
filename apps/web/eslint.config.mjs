// llm-guardrail-allow: this block IS the ban on the sink, not a use of it
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
    'app/.well-known/workflow/**',
    'scripts/**',
  ]),
  {
    rules: {
      // eslint-plugin-react 7.x calls removed ESLint 10 rule-context APIs from several rules.
      ...disabledReactRules,
      // On in the root config (via eslint:recommended) and absent from Next's,
      // so the same file linted from the repo root and from this package
      // disagreed: lint-staged demanded a disable directive that `pnpm lint`
      // then failed as unused. Enabled here so both runs agree.
      'no-control-regex': 'error',
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
  {
    files: [
      'app/**',
      'components/**',
      'features/**',
      'shared/**',
      'hooks/**',
      'lib/**',
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
      '@typescript-eslint/no-unused-vars': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-img-element': 'off',
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
  // local-only client queue IDs) carry per-line eslint-disable comments with
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
