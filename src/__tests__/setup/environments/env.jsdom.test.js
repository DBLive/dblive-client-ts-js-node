/* eslint-disable @typescript-eslint/no-var-requires */
const JsDomEnvironment = require("jest-environment-jsdom")

class TestJsDomEnvironment extends JsDomEnvironment
{
	async setup() {
		await super.setup()

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		this.global.fetch = require("node-fetch")
	}
}

module.exports = TestJsDomEnvironment