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
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module'
			}
		},
		rules: {
			'no-console': 'warn',
			'no-unused-vars': 'warn'
		}
	}
];
