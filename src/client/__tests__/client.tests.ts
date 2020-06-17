import { v1 as uuidv1 } from "uuid"
import { DBLiveClient } from "../client"

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
			expect(dbLive.status).toEqual("connected")
		})
		it("successfully connects and sends event message", done => {
			dbLive.on("connect", () => {
				expect(dbLive.status).toEqual("connected")
				done()
			})
			
			void dbLive.connect()
			
			expect(dbLive.status).toEqual("connecting")
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
	describe("#getJson", () => {
		it("returns undefined for a bad key", done => {
			dbLive.getJson("bad-key", value => {
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
		it("is able to set a json value that can be retrieved via #getJson", async(done) => {
			const key = `test/ts/set1-${uuidv1()}`,
				expectedValue = {
					hello: "world",
				},
				success = await dbLive.set(key, expectedValue)

			expect(success).toBeTruthy()

			dbLive.getJson(key, value => {
				expect(value).not.toBeUndefined()
				expect((value as { hello: string }).hello).toEqual("world")
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
		it("listens to a value and gets called when value changes", done => {
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
		it("stops listening when .listening is set to false", done => {
			const key = `test/ts/getAndListen3-${uuidv1()}`,
				expectedValue = uuidv1()

			let call = 0
		
			const listener = dbLive.getAndListen(key, async(value) => {
				call++

				if (call === 1) {
					expect(value).toBeUndefined()
					await dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(value).toEqual(expectedValue)
				}
				else if (call === 3) {
					expect(value).toEqual(expectedValue)
					listener.listening = false
					await dbLive.set(key, "new-value")
					setTimeout(() => void done(), 100)
				}
				else {
					fail(new Error("#getAndListen handler shouldn't be called after .listening is set to false"))
				}
			})
		})
	})
	describe("#getJsonAndListen", () => {
		it("immediately returns a json value", async(done) => {
			const key = `test/ts/getJsonAndListen1-${uuidv1()}`,
				expectedValue = {
					hello: "world",
				}
			
			await dbLive.set(key, expectedValue)

			dbLive.getJsonAndListen(key, value => {
				expect(value).not.toBeUndefined()
				expect((value as { hello: string }).hello).toEqual("world")
				done()
			})
		})
		it("listens to a json value and gets called when value changes", done => {
			const key = `test/ts/getJsonAndListen2-${uuidv1()}`,
				expectedValue = {
					hello: "world",
				}

			let call = 0
			
			dbLive.getJsonAndListen(key, value => {
				call++

				if (call === 1) {
					expect(value).toBeUndefined()
					void dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(value).not.toBeUndefined()
					expect((value as { hello: string }).hello).toEqual("world")
				}
				else if (call === 3) {
					expect(value).not.toBeUndefined()
					expect((value as { hello: string }).hello).toEqual("world")
					done()
				}
				else {
					fail(new Error("#getJsonAndListen handler shouldn't be called this many times"))
				}
			})
		})
		it("stops listening when .listening is set to false", done => {
			const key = `test/ts/getJsonAndListen3-${uuidv1()}`,
				expectedValue = {
					hello: "world",
				}

			let call = 0
			
			const listener = dbLive.getJsonAndListen(key, async(value) => {
				call++

				if (call === 1) {
					expect(value).toBeUndefined()
					await dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(value).not.toBeUndefined()
					expect((value as { hello: string }).hello).toEqual("world")
				}
				else if (call === 3) {
					expect(value).not.toBeUndefined()
					expect((value as { hello: string }).hello).toEqual("world")
					listener.listening = false
					await dbLive.set(key, {
						hello2: "world2",
					})
					setTimeout(() => void done(), 100)
				}
				else {
					fail(new Error("#getJsonAndListen handler shouldn't be called after .listening is set to false"))
				}
			})
		})
	})
})