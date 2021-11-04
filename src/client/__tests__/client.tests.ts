import { v1 as uuidv1 } from "uuid"
import { DBLiveClient, DBLiveClientStatus } from "../client"

let dbLive: DBLiveClient

beforeEach(() => {
	dbLive = new DBLiveClient("RGvQkjiSrmsBRLuiKJmYgghNO/Xsn7ONH1M5ZO/N")
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
		it("returns undefined for a bad key", async() => {
			const value = await dbLive.get("bad-key")
			expect(value).toBeUndefined()
		})
	})
	describe("#getJson", () => {
		it("returns undefined for a bad key", async() => {
			const value = await dbLive.getJson("bad-key")
			expect(value).toBeUndefined()
		})
	})
	describe("#set", () => {
		it("sets a value that can be retrieved via #get", async() => {
			const key = `test/ts/set1-${uuidv1()}`,
				expectedValue = uuidv1(),
				success = await dbLive.set(key, expectedValue)

			expect(success).toBeTruthy()

			const cachedValue = await dbLive.get(key)
			expect(cachedValue).toEqual(expectedValue)

			const serverValue = await dbLive.get(key, { bypassCache: true })
			expect(serverValue).toEqual(expectedValue)
		})
		it("is able to set a json value that can be retrieved via #getJson", async() => {
			const key = `test/ts/set1-${uuidv1()}`,
				expectedValue = {
					hello: "world",
				},
				success = await dbLive.set(key, expectedValue)

			expect(success).toBeTruthy()

			const value = await dbLive.getJson<{ hello: string }>(key)
			expect(value).not.toBeUndefined()
			expect(value.hello).toEqual("world")
		})
	})
	describe("#getAndListen", () => {
		it("immediately returns a value", async() => {
			const key = `test/ts/getAndListen1-${uuidv1()}`,
				expectedValue = uuidv1()
			
			await dbLive.set(key, expectedValue)

			return new Promise<void>(resolve => {
				dbLive.getAndListen(key, args => {
					expect(args.value).toEqual(expectedValue)
					resolve()
				})
			})
		})
		it("listens to a value and gets called when value changes", done => {
			const key = `test/ts/getAndListen2-${uuidv1()}`,
				expectedValue = uuidv1()

			let call = 0
			
			dbLive.getAndListen(key, args => {
				call++

				if (call === 1) {
					expect(args.value).toBeUndefined()
					void dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(args.value).toEqual(expectedValue)
					done()
				}
				else {
					fail(new Error("#getAndListen handler shouldn't be called this many times"))
				}
			})
		})
		it("passes customArgs when supplied", done => {
			const key = `test/ts/getAndListen3-${uuidv1()}`,
				expectedValue = uuidv1()

			let call = 0
			
			dbLive.getAndListen(key, async(args) => {
				call++

				if (call === 1) {
					expect(args.value).toBeUndefined()
					expect(args.customArgs).toBeUndefined()
					await dbLive.set(key, expectedValue, {
						customArgs: {
							hello: "world",
						},
					})
				}
				else if (call === 2) {
					expect(args.value).toEqual(expectedValue)
					expect(args.customArgs).not.toBeUndefined()
					expect((args.customArgs as { hello: string }).hello).toEqual("world")
					done()
				}
				else {
					fail(new Error("#getAndListen handler shouldn't be called this many times"))
				}
			})
		})
		it("stops listening when .listening is set to false", done => {
			const key = `test/ts/getAndListen4-${uuidv1()}`,
				expectedValue = uuidv1()

			let call = 0
		
			const listener = dbLive.getAndListen(key, async(args) => {
				call++

				if (call === 1) {
					expect(args.value).toBeUndefined()
					await dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(args.value).toEqual(expectedValue)
					listener.listening = false
					await dbLive.set(key, "new-value")
					setTimeout(() => { done() }, 100)
				}
				else {
					fail(new Error("#getAndListen handler shouldn't be called after .listening is set to false"))
				}
			})
		})
	})
	describe("#getJsonAndListen", () => {
		it("immediately returns a json value", async() => {
			const key = `test/ts/getJsonAndListen1-${uuidv1()}`,
				expectedValue = {
					hello: "world",
				}
			
			await dbLive.set(key, expectedValue)

			return new Promise<void>(resolve => {
				dbLive.getJsonAndListen(key, args => {
					expect(args.value).not.toBeUndefined()
					expect((args.value as { hello: string }).hello).toEqual("world")
					resolve()
				})
			})
		})
		it("listens to a json value and gets called when value changes", done => {
			const key = `test/ts/getJsonAndListen2-${uuidv1()}`,
				expectedValue = {
					hello: "world",
				}

			let call = 0
			
			dbLive.getJsonAndListen(key, args => {
				call++

				if (call === 1) {
					expect(args.value).toBeUndefined()
					void dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(args.value).not.toBeUndefined()
					expect((args.value as { hello: string }).hello).toEqual("world")
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
			
			const listener = dbLive.getJsonAndListen(key, async(args) => {
				call++

				if (call === 1) {
					expect(args.value).toBeUndefined()
					await dbLive.set(key, expectedValue)
				}
				else if (call === 2) {
					expect(args.value).not.toBeUndefined()
					expect((args.value as { hello: string }).hello).toEqual("world")
					listener.listening = false
					await dbLive.set(key, {
						hello2: "world2",
					})
					setTimeout(() => { done() }, 100)
				}
				else {
					fail(new Error("#getJsonAndListen handler shouldn't be called after .listening is set to false"))
				}
			})
		})
	})
	describe("#lock", () => {
		it("locks a value until unlocked", async() => {
			const key = `test/ts/lock-${uuidv1()}`
			const expectedValueBeforeUnlock = "hello"
			const expectedValueAfterUnlocked = "world"

			const setResult = await dbLive.set(key, expectedValueBeforeUnlock)
			expect(setResult).toBeTruthy()

			const lock = await dbLive.lock(key, {
				timeout: 5000,
			})
			expect(lock).not.toBeUndefined()
			expect(lock.lockId).not.toBeUndefined()

			void dbLive.set(key, expectedValueAfterUnlocked)

			await new Promise<void>(resolve => setTimeout(() => resolve(), 500))

			const getWhileLockedResult = await dbLive.get(key, {
				bypassCache: true,
			})

			expect(getWhileLockedResult).toEqual(expectedValueBeforeUnlock)

			const unlockResult = await lock.unlock()
			expect(unlockResult).toBeTruthy()

			await new Promise<void>(resolve => setTimeout(() => resolve(), 500))

			const getAfterUnlockedResult = await dbLive.get(key, {
				bypassCache: true,
			})

			expect(getAfterUnlockedResult).toEqual(expectedValueAfterUnlocked)
		})
	})
	describe("#lockAndSet", () => {
		it("appropriately sets a value", async() => {
			const key = `test/ts/lockAndSet-${uuidv1()}`
			const expectedValue = "hello"

			const result = await dbLive.lockAndSet<string>(
				key,
				(currentValue: string|undefined): string => {
					expect(currentValue).toBeUndefined()
					return expectedValue
				},
			)

			expect(result).toBeTruthy()

			const actual = await dbLive.get(key)

			expect(actual).toEqual(expectedValue)
		})
	})
})