// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require("./jest.config.js")

module.exports = {
	...config,
	testEnvironment: "<rootDir>/__tests__/setup/environments/env.node.test.js",
}