/* eslint-disable @typescript-eslint/no-var-requires */
const NodeEnvironment = require("jest-environment-node")

class TestNodeEnvironment extends NodeEnvironment
{
	async setup() {
		await super.setup()

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		this.global.fetch = require("node-fetch")
	}
}

module.exports = TestNodeEnvironment