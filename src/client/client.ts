import { v1 as uuidv1 } from "uuid"
import { DBLiveAPI } from "../api/api"
import { isErrorResult } from "../common/error.result"
import { DBLiveContent } from "../content/content"
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

export class DBLiveClient
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
			}

			return
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
			const cachedValue = this.content.getFromCache(key)

			if (cachedValue) {
				this.logger.debug("Key exists in cache")
				return cachedValue
			}
		}

		try {
			return await this.content.get(key)
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

	async getJson<T>(key: string): Promise<T|undefined> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		this.logger.debug(`getJson(${key})`)

		const cachedValue = this.content.getFromCache(key)

		if (cachedValue) {
			try {
				this.logger.debug("Key exists in cache")
				const jsonValue = JSON.parse(cachedValue) as T
				return jsonValue
			}
			catch(err) {
				this.logger.error("Could not json parse value in cache:", err)
			}
		}

		try {
			const value = await this.content.get(key)

			try {
				const jsonValue = value && JSON.parse(value) as T
				return jsonValue
			}
			catch(err) {
				this.logger.error(`Could not json parse key '${key}' with value '${value}':`, err)
				return undefined
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

		let contentType = "text/plain"

		if (typeof(value) !== "string") {
			value = JSON.stringify(value)
			contentType = "application/json"
		}

		this.logger.debug(`set ${key}='${value}'`)

		const currentValue = this.content.getFromCache(key)
		
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
			{
				contentType,
				customArgs: {
					...options.customArgs,
					clientId: this.clientId,
				},
			},
		)
	}

	private connectSocket(url: string, cookie: string|undefined) {
		this.logger.debug("Connecting to Socket")

		this.socket = new DBLiveSocket(url, this.appKey, this, cookie)
	}

}

export type DBLiveClientGetOptions = {
	bypassCache?: boolean
}

export type DBLiveClientSetOptions = {
	customArgs?: { [key: string]: string|number }
}

export type DBLiveClientGetAndListenHandlerArgs = {
	value: string|undefined
	customArgs?: { [key: string]: string|number }
}

export type DBLiveClientGetJsonAndListenHandlerArgs<T> = {
	value: T|undefined
	customArgs?: { [key: string]: string|number }
}

export class DBLiveClientInternalLibrary {
	constructor(
		public content: () => Promise<DBLiveContent>,
		public socket: () => Promise<DBLiveSocket>,
	) { }
}