import { DBLiveClient, DBLiveClientStatus } from "../client"

let dbLive: DBLiveClient

beforeEach(() => {
	dbLive = new DBLiveClient("+EzwYKZrXI7eKn/KRtlhURsGsjyP2e+1++vqTDQH")
})

afterEach(() => {
	dbLive.dispose()
})

describe("DBLiveClient", () => {
	describe("#connect", () => {
		it("successfully connects", async() => {
			await dbLive.connect()
			expect(dbLive.status).toEqual(DBLiveClientStatus.connected)
		})
		it("successfully connects and sends event message", async() => {
			await new Promise((resolve, reject) => {
				dbLive.on("connect", () => {
					try {
						expect(dbLive.status).toEqual(DBLiveClientStatus.connecting)
						resolve()
					}
					catch(err) {
						reject(err)
					}
				})

				void dbLive.connect()

				expect(dbLive.status).toEqual(DBLiveClientStatus.connecting)
			})
		})
	})
})