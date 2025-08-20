const tsParser = require('@typescript-eslint/parser');

module.exports = [
	{
		ignores: [
			'node_modules/**',
			'main.js',
			'esbuild.config.mjs',
			'version-bump.mjs',
			'*.config.js',
			'dist/**'
		]
	},
		{
			files: ['**/*.ts', '**/*.js'],
			languageOptions: {
				parser: tsParser,
				parserOptions: {
					ecmaVersion: 'latest',
					sourceType: 'module'
				}
			},
			plugins: {
				'@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
			},
			rules: {
				// Clean CI noise: allow console statements for plugin runtime and tests
				'no-console': 'off',
				// Delegate unused checks to TS or disable to avoid noise in tests/mocks
				'no-unused-vars': 'off',
				'@typescript-eslint/no-unused-vars': 'off'
			}
		}
];
