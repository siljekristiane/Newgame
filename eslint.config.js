import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-single', 'test-results', 'playwright-report', 'measurements'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.worker } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // three.js objects are mutated on purpose inside useFrame (refs, materials, scene graph).
      'react-hooks/immutability': 'off',
    },
  },
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.{ts,js,mjs}', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
