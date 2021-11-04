import { v1 as uuidv1 } from "uuid"
import { DBLiveAPI } from "../api/api"
import { isErrorResult } from "../common/error.result"
import { Disposable } from "../common/interfaces/disposable"
import { using } from "../common/using"
import { DBLiveContent, DBLiveContentType } from "../content/content"
import { DBLiveKey } from "../key/key"
import { DBLiveKeyEventListener } from "../key/key.eventlistener"
import { DBLiveSocket } from "../socket/socket"
import { DBLiveCallback } from "../types/dblive.callback"
import { DBLiveLogger } from "../util/logger"
import { DBLiveEventHandler } from "./eventhandler"

export enum DBLiveClientStatus {
	notConnected,
	connecting,
	connected,
}

export class DBLiveClient implements Disposable
{
	public readonly clientId = uuidv1()
	public status = DBLiveClientStatus.notConnected
	
	private api?: DBLiveAPI
	private content?: DBLiveContent
	private handlers: DBLiveEventHandler<{ [key: string]: unknown }>[] = []
	private readonly keys: { [key: string]: DBLiveKey } = {}
	private readonly lib = new DBLiveClientInternalLibrary(
		async(): Promise<DBLiveContent> => {
			if (!this.content) {
				await this.connect()
			}

			return this.content
		},
		async(): Promise<DBLiveSocket> => {
			if (!this.socket) {
				await this.connect()
			}

			return this.socket
		},
	)
	private readonly logger = new DBLiveLogger("DBLiveClient")
	private socket?: DBLiveSocket

	constructor(
		private readonly appKey: string,
	) { }

	async connect(): Promise<boolean> {
		if (this.status !== DBLiveClientStatus.notConnected) {
			if (this.status === DBLiveClientStatus.connecting) {
				await new Promise<boolean>(resolve => this.once("connect", () => resolve(true)))
			}
			else if (this.status === DBLiveClientStatus.connected) {
				// Nothing to do
			}
			else {
				this.logger.error("Unhandled status:", this.status)
				return false
			}

			return true
		}

		this.status = DBLiveClientStatus.connecting

		this.logger.debug("Connecting to API")

		this.api = new DBLiveAPI(this.appKey)

		const initResult = await this.api.init()

		if (!initResult || isErrorResult(initResult) || !initResult.contentDomain) {
			this.status = DBLiveClientStatus.notConnected
			this.handleEvent("error", {
				error: new Error("DBLive Connection Error"),
			})

			return
		}

		this.connectSocket(`https://${initResult.socketDomain}/`, initResult.cookie)
		this.content = new DBLiveContent(
			this.appKey,
			`https://${initResult.contentDomain}/`,
			this.api,
			this.socket,
			initResult.setEnv,
		)

		return await new Promise<boolean>(resolve => {
			// todo: handle socket connecion errors
			this.once("socket-connected", () => {
				this.status = DBLiveClientStatus.connected
				setTimeout(() => this.handleEvent("connect"), 1)
				resolve(true)
			})
		})
	}

	dispose(): void {
		if (this.socket) {
			this.socket.dispose()
		}

		for (const key in this.keys) {
			this.keys[key].dispose()
			delete this.keys[key]
		}

		this.socket = undefined
		this.api = undefined
		this.content = undefined
		this.status = DBLiveClientStatus.notConnected
	}

	async get(key: string, options: DBLiveClientGetOptions = {}): Promise<string|undefined> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		this.logger.debug(`get(${key})`)

		if (!options.bypassCache) {
			const cachedValue = this.content.getFromCache<string>(key)

			if (cachedValue) {
				if (cachedValue.contentType === DBLiveContentType.string) {
					this.logger.debug("Key exists in cache")
					return cachedValue.value
				}
				else {
					this.logger.warn(`Tried to get key '${key}' from cache as string, but content-type is '${cachedValue.contentType}'.`)
				}
			}
		}

		try {
			const result = await this.content.get<string>(key)

			if (result) {
				if (result.contentType === DBLiveContentType.string) {
					return result.value
				}

				this.logger.warn(`Tried to get key '${key}' from server as string, but content-type is '${result.contentType}'.`)
			}
		}
		catch(err) {
			this.logger.error(`Error while getting '${key}':`, err)
		}

		return undefined
	}

	getAndListen(key: string, handler: (args: DBLiveClientGetAndListenHandlerArgs) => unknown): DBLiveKeyEventListener {
		this.logger.debug(`getAndListen(${key})`)

		void this.get(key).then(value => handler({ value }))

		return this.key(key).onChanged(handler)
	}

	async getJson<T>(key: string, options: DBLiveClientGetOptions = {}): Promise<T|undefined> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		this.logger.debug(`getJson(${key})`)

		if (!options.bypassCache) {
			const cachedValue = this.content.getFromCache<T>(key)

			if (cachedValue) {
				if (cachedValue.contentType === DBLiveContentType.json) {
					this.logger.debug("Key exists in cache")
					return cachedValue.value as T
				}

				this.logger.warn(`Tried to get key '${key}' from cache as json, but content-type is '${cachedValue.contentType}'.`)
			}
		}

		try {
			const result = await this.content.get(key)

			if (result) {
				if (result.contentType === DBLiveContentType.json) {
					return result.value as T
				}

				this.logger.warn(`Tried to get key '${key}' from server as json, but content-type is '${result.contentType}'.`)
			}
		}
		catch(err) {
			this.logger.error(`Error while getting '${key}':`, err)
		}

		return undefined
	}

	getJsonAndListen<T>(key: string, handler: (args: DBLiveClientGetJsonAndListenHandlerArgs<T>) => unknown): DBLiveKeyEventListener {
		this.logger.debug(`getJsonAndListen(${key})`)

		void this.getJson<T>(key).then(value => handler({ value }))

		return this.key(key).onChanged(args => {
			try {
				const jsonValue = args.value && JSON.parse(args.value) as T
				handler({
					customArgs: args.customArgs,
					value: jsonValue,
				})
			}
			catch(err) {
				this.logger.error(`Could not json parse key '${key}' with value '${args.value}':`, err)
				handler({
					customArgs: args.customArgs,
					value: undefined,
				})
			}
		})
	}

	async lock(key: string, options: DBLiveClientLockOptions = {}): Promise<DBLiveClientLock> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		this.logger.debug(`lock(${key})`)

		const lockResult = await this.socket.lock(key, {
			timeout: options.timeout,
		})

		if (!lockResult.lockId) {
			this.logger.error(`Could not lock '${key}', server didn't return lockId`)
			throw new Error(`Could not successfully lock '${key}.'`)
		}

		return new DBLiveClientLock(
			lockResult.lockId,
			async(lockId: string): Promise<boolean> => await this.unlock(key, lockId),
		)
	}

	async lockAndSet<T>(key: string, handler: (currentValue: T|string|undefined) => Promise<T|string>|T|string, options: DBLiveClientLockAndSetOptions = {}): Promise<boolean> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		this.logger.debug(`lockAndSet(${key})`)

		return await using(await this.lock(key), async(lock: DBLiveClientLock) => {
			const current = await this.content.get<T>(key)
			const newValue = await handler(current && current.value)
	
			if (!newValue) {
				this.logger.warn(`Can't set '${key}' within a lock to an undefined value`)
				return false
			}

			await this.set<T>(key, newValue, {
				customArgs: options.customArgs,
				lock,
			})

			return true
		})
	}

	handleEvent(event: string, data: { [key: string]: unknown } = {}): this {
		this.logger.debug(`handleEvent - ${event} -`, data)

		for (const eventHandler of this.handlers.filter(h => h.isActive && h.event === event)) {
			if (eventHandler.once)
				eventHandler.isActive = false

			eventHandler.handler(data)
		}

		return this
	}

	key(key: string): DBLiveKey {
		// We don't need to await connection, we simply need to make sure content and socket are defined.
		// void this.connect()

		return this.keys[key] = this.keys[key] || new DBLiveKey(key, this, this.lib)
	}

	off(id: string): this {
		this.logger.debug(`Removing handler ${id}`)

		this.handlers = this.handlers.filter(h => h.id !== id)

		return this
	}

	on(event: string, handler: DBLiveCallback<{ [key: string]: unknown }>): string {
		const eventHandler = new DBLiveEventHandler(
			event,
			false,
			(item: { [key: string]: unknown }) => handler(item),
		)

		this.handlers.push(eventHandler)

		return eventHandler.id
	}

	once(event: string, handler: DBLiveCallback<{ [key: string]: unknown }>): string {
		const eventHandler = new DBLiveEventHandler(
			event,
			true,
			(item: { [key: string]: unknown }) => handler(item),
		)

		this.handlers.push(eventHandler)

		return eventHandler.id
	}

	async reset(): Promise<void> {
		this.logger.debug("reset")

		this.dispose()

		await this.connect()
	}

	async set<T>(key: string, value: string|T, options: DBLiveClientSetOptions = {}): Promise<boolean> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		let contentType = DBLiveContentType.string

		if (typeof(value) !== "string") {
			value = JSON.stringify(value)
			contentType = DBLiveContentType.json
		}

		this.logger.debug(`set ${key}='${value}'`)

		const currentValue = this.content.getValueFromCache(key)
		
		if (value === currentValue) {
			this.logger.debug(`set '${key}' - value hasn't changed`)
			return true
		}

		this.handleEvent(`key:${key}`, {
			action: "changed",
			contentType,
			customArgs: options.customArgs,
			key,
			oldValue: currentValue,
			value,
		})

		return await this.content.set(
			key,
			value,
			contentType,
			{
				customArgs: {
					...options.customArgs,
					clientId: this.clientId,
				},
				lockId: options.lock && options.lock.lockId,
			},
		)
	}

	private connectSocket(url: string, cookie: string|undefined) {
		this.logger.debug("Connecting to Socket")

		this.socket = new DBLiveSocket(url, this.appKey, this, cookie)
	}

	private async unlock(key: string, lockId: string): Promise<boolean> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		this.logger.debug(`unlock(${key})`)

		const unlockResult = await this.socket.unlock(key, lockId)

		return unlockResult.success
	}

}

export type DBLiveClientGetAndListenHandlerArgs = {
	value: string|undefined
	customArgs?: { [key: string]: string|number }
}

export type DBLiveClientGetJsonAndListenHandlerArgs<T> = {
	value: T|undefined
	customArgs?: { [key: string]: string|number }
}

export type DBLiveClientGetOptions = {
	bypassCache?: boolean
}

export class DBLiveClientInternalLibrary
{
	constructor(
		public content: () => Promise<DBLiveContent>,
		public socket: () => Promise<DBLiveSocket>,
	) { }
}

export class DBLiveClientLock implements Disposable
{
	isLocked = true

	constructor(
		public readonly lockId: string,
		private readonly clientUnlock: (lockId: string) => Promise<boolean>,
	) { }

	async dispose() {
		await this.unlock()
	}

	async unlock(): Promise<boolean> {
		if (!this.isLocked)
			return true

		if (await this.clientUnlock(this.lockId)) {
			this.isLocked = false
			return true
		}

		return false
	}
}

export type DBLiveClientLockOptions = {
	timeout?: number
}

export type DBLiveClientLockAndSetHandlerParams = {
	contentType?: string
	value?: string
}

export type DBLiveClientLockAndSetOptions = {
	customArgs?: { [key: string]: string|number }
	timeout?: number
}

export type DBLiveClientSetOptions = {
	customArgs?: { [key: string]: string|number }
	lock?: DBLiveClientLock
}