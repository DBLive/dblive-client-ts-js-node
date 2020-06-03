module.exports = {
	globalSetup: "<rootDir>/__tests__/setup/setup.ts",
	globalTeardown: "<rootDir>/__tests__/setup/teardown.ts",
	preset: "ts-jest",
	rootDir: "src",
	testEnvironment: "<rootDir>/__tests__/setup/environments/env.jsdom.test.js",
	testPathIgnorePatterns: [
		"/node_modules/",
		"helpers",
		"setup",
	],
}