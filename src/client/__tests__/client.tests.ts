import { v1 as uuidv1 } from "uuid"
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
		it("successfully connects and sends event message", done => {
			dbLive.on("connect", () => {
				expect(dbLive.status).toEqual(DBLiveClientStatus.connected)
				done()
			})
			
			void dbLive.connect()
			
			expect(dbLive.status).toEqual(DBLiveClientStatus.connecting)
		})
	})
	describe("#get", () => {
		it("returns undefined for a bad key", done => {
			dbLive.get("bad-key", value => {
				expect(value).toBeUndefined()
				done()
			})
		})
	})
	describe("#set", () => {
		it("sets a value that can be retrieved via #get", async(done) => {
			const key = `test/ts/set1-${uuidv1()}`,
				expectedValue = uuidv1(),
				success = await dbLive.set(key, expectedValue)

			expect(success).toBeTruthy()

			dbLive.get(key, value => {
				expect(value).toEqual(expectedValue)
				done()
			})
		})
	})
	describe("#getAndListen", () => {
		it("immediately returns a value", async(done) => {
			const key = `test/ts/getAndListen1-${uuidv1()}`,
				expectedValue = uuidv1()
			
			await dbLive.set(key, expectedValue)

			dbLive.getAndListen(key, value => {
				expect(value).toEqual(expectedValue)
				done()
			})
		})
		it("listens to a value and gets called when value changes", async(done) => {
			await dbLive.connect()
			
			const key = `test/ts/getAndListen2-${uuidv1()}`,
				expectedValue = uuidv1()

			let call = 0
			
			dbLive.getAndListen(key, value => {
				call++

				if (call === 1) {
					expect(value).toBeUndefined()
					void dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(value).toEqual(expectedValue)
				}
				else if (call === 3) {
					expect(value).toEqual(expectedValue)
					done()
				}
				else {
					fail(new Error("#getAndListen handler shouldn't be called this many times"))
				}
			})
		})
	})
})