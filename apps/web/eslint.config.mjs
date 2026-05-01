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
      'core/**',
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
]);

export default eslintConfig;
