import js from '@eslint/js';
import {defineConfig,globalIgnores} from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**','.next/**','.vinext/**','.wrangler/**','.sites-runtime/**','backups/**','work/cors-test.mjs','work/excel.mjs','work/package-source.mjs','work/serve-stage2-ui.mjs','work/worker-dry-run/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files:['**/*.{ts,tsx}'],
    languageOptions:{globals:globals.browser},
    plugins:{'react-hooks':reactHooks},
    rules:{...reactHooks.configs.recommended.rules},
  },
  {
    files:['**/*.mjs'],
    languageOptions:{globals:{...globals.node,...globals.browser}},
  },
  {
    files:['components/ui/**/*.{ts,tsx}','hooks/use-mobile.ts'],
    rules:{
      '@typescript-eslint/no-unused-vars':'off',
      'react-hooks/purity':'off',
      'react-hooks/set-state-in-effect':'off',
    },
  },
]);
