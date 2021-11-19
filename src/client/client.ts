import { v1 as uuidv1 } from "uuid"
import { DBLiveAPI } from "../api/api"
import { isErrorResult } from "../common/error.result"
import { Disposable } from "../common/interfaces/disposable"
import { using } from "../common/using"
import { DBLiveContent } from "../content/content"
import { DBLiveKey } from "../key/key"
import { DBLiveKeyEventHandlerArgs, DBLiveKeyEventListener } from "../key/key.eventlistener"
import { DBLiveSocketManager } from "../socket/socket.manager"
import { isSocketErrorResult } from "../socket/socket.types"
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
	private readonly keys: { [key: string]: DBLiveKey<unknown> } = {}
	private readonly lib = new DBLiveClientInternalLibrary(
		async(): Promise<DBLiveContent> => {
			if (!this.content) {
				await this.connect()
			}

			return this.content
		},
		async(): Promise<DBLiveSocketManager> => {
			if (!this.sockets) {
				await this.connect()
			}

			return this.sockets
		},
	)
	private readonly logger = new DBLiveLogger("DBLiveClient")
	private sockets?: DBLiveSocketManager

	constructor(
		private readonly appKey: string,
	) { }

	async connect(): Promise<boolean> {
		if (this.status !== DBLiveClientStatus.notConnected) {
			if (this.status === DBLiveClientStatus.connecting) {
				return await new Promise<boolean>(resolve => this.once("connect", () => resolve(true)))
			}
			
			if (this.status === DBLiveClientStatus.connected) {
				// Nothing to do
				return true
			}

			this.logger.error("Unhandled status:", this.status)
			
			return false
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
		
		this.sockets = new DBLiveSocketManager(initResult.socketDomains, this.appKey, this, initResult.cookie)

		this.once("socket-connected", () => {
			this.status = DBLiveClientStatus.connected
			this.handleEvent("connect")
		})

		this.content = new DBLiveContent(
			this.appKey,
			`https://${initResult.contentDomain}/`,
			this.api,
			this.sockets,
			initResult.setEnv,
		)

		return await this.connect()
	}

	dispose(): void {
		if (this.sockets) {
			this.sockets.dispose()
		}

		for (const key in this.keys) {
			this.keys[key].dispose()
			delete this.keys[key]
		}

		this.sockets = undefined
		this.api = undefined
		this.content = undefined
		this.status = DBLiveClientStatus.notConnected
	}

	async get(key: string, options: DBLiveClientGetOptions = {}): Promise<string|undefined> {
		this.logger.debug(`get(${key})`)

		if (this.status !== DBLiveClientStatus.connected) {
			this.logger.debug(`get(${key}): waiting for connection`)
			await this.connect()
		}

		return await this.key<string>(key).get(options)
	}

	getAndListen(key: string, handler: (args: DBLiveClientGetAndListenHandlerArgs) => unknown): DBLiveKeyEventListener<string> {
		this.logger.debug(`getAndListen(${key})`)

		void this.get(key).then(value => handler({ value }))

		return this.key<string>(key).onChanged((args: DBLiveKeyEventHandlerArgs<string>) => handler(args))
	}

	async getJson<T>(key: string, options: DBLiveClientGetOptions = {}): Promise<T|undefined> {
		this.logger.debug(`getJson(${key})`)

		if (this.status !== DBLiveClientStatus.connected) {
			this.logger.debug(`getJson(${key}): waiting for connection`)
			await this.connect()
		}

		return await this.key<T>(key).get(options)
	}

	getJsonAndListen<T>(key: string, handler: (args: DBLiveClientGetJsonAndListenHandlerArgs<T>) => unknown): DBLiveKeyEventListener<T> {
		this.logger.debug(`getJsonAndListen(${key})`)

		void this.getJson<T>(key).then(value => handler({ value }))

		return this.key<T>(key).onChanged((args: DBLiveKeyEventHandlerArgs<T>) => {
			handler({
				customArgs: args.customArgs,
				value: args.value,
			})
		})
	}

	async lock(key: string, options: DBLiveClientLockOptions = {}): Promise<DBLiveClientLock> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		this.logger.debug(`lock(${key})`)

		const lockResult = await this.sockets.lock(key, {
			timeout: options.timeout,
		})

		if (isSocketErrorResult(lockResult) || !lockResult.lockId) {
			this.logger.error(`Could not lock '${key}', server didn't return lockId. lockResult:`, lockResult)
			throw new Error(`Could not successfully lock '${key}.'`)
		}

		return new DBLiveClientLock(
			lockResult.lockId,
			async(lockId: string): Promise<boolean> => await this.unlock(key, lockId),
		)
	}

	async lockAndSet<T>(key: string, handler: (currentValue: T|undefined) => Promise<T>|T, options: DBLiveClientLockAndSetOptions = {}): Promise<boolean> {
		this.logger.debug(`lockAndSet('${key}')`)

		if (this.status !== DBLiveClientStatus.connected) {
			this.logger.debug(`lockAndSet('${key}') - waiting for connection`)
			await this.connect()
		}

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

	handleEvent<T>(event: string, data: T|undefined = undefined): this {
		this.logger.debug(`handleEvent('${event}') -`, data)

		for (const eventHandler of this.handlers.filter(h => h.isActive && h.event === event)) {
			if (eventHandler.once)
				eventHandler.isActive = false

			eventHandler.handler(data || {})
		}

		return this
	}

	key<T>(key: string): DBLiveKey<T> {
		return (this.keys[key] = this.keys[key] || new DBLiveKey<T>(key, this, this.lib)) as DBLiveKey<T>
	}

	off(id: string): this {
		this.logger.debug(`off('${id}')`)

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
		this.logger.debug("reset()")

		this.dispose()

		await this.connect()
	}

	async set<T>(key: string, value: T, options: DBLiveClientSetOptions = {}): Promise<boolean> {
		this.logger.debug(`set('${key}')`, value)

		if (this.status !== DBLiveClientStatus.connected) {
			this.logger.debug(`set('${key}') - waiting for connection`)
			await this.connect()
		}

		return await this.key<T>(key).set(value, options)
	}

	private async unlock(key: string, lockId: string): Promise<boolean> {
		this.logger.debug(`unlock('${key}', '${lockId}')`)

		if (this.status !== DBLiveClientStatus.connected) {
			this.logger.debug(`unlock('${key}', '${lockId}') - waiting for connection`)
			await this.connect()
		}

		const unlockResult = await this.sockets.unlock(key, lockId)

		if (isSocketErrorResult(unlockResult)) {
			this.logger.error(`Could not unlock '${key}'. Received error result:`, unlockResult)
			return false
		}

		return unlockResult.success
	}

}

export type DBLiveClientGetAndListenHandlerArgs = {
	value: string|undefined
	customArgs?: Record<string, string|number>
}

export type DBLiveClientGetJsonAndListenHandlerArgs<T> = {
	value: T|undefined
	customArgs?: Record<string, string|number>
}

export type DBLiveClientGetOptions = {
	bypassCache?: boolean
}

export class DBLiveClientInternalLibrary
{
	constructor(
		public content: () => Promise<DBLiveContent>,
		public socket: () => Promise<DBLiveSocketManager>,
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