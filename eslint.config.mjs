// ESLint flat config for the whole workspace. Expo's rules (React, hooks, import) apply to app/ only.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import expoConfig from 'eslint-config-expo/flat.js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const APP_FILES = 'app/**/*.{js,jsx,ts,tsx,mjs,cjs}';

// Scope each block of the Expo config to app/ so React and RN globals don't leak into Node packages.
const expoForApp = expoConfig.map((block) => {
  const keys = Object.keys(block);
  if (keys.length === 1 && block.ignores) {
    return { ignores: block.ignores.map((p) => `app/${p}`) };
  }
  const files = block.files
    ? block.files.map((p) => `app/${p.startsWith('**/') ? p : `**/${p}`}`)
    : [APP_FILES];
  return { ...block, files };
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/web-build/**',
      'app/expo-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  ...expoForApp,
  prettier,
);
