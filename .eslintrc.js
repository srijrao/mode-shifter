import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
	{
		ignores: [
			'node_modules/',
			'main.js',
			'esbuild.config.mjs',
			'version-bump.mjs',
			'*.config.js',
			'dist/'
		]
	},
	{
		files: ['**/*.ts', '**/*.js'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module'
			},
			globals: {
				browser: true,
				node: true,
				es6: true
			}
		},
		plugins: {
			'@typescript-eslint': typescriptEslint
		},
		rules: {
			...js.configs.recommended.rules,
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'no-console': 'warn'
		}
	}
];
