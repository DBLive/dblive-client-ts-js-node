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
	connected
}

export class DBLiveClient
{
	public status = DBLiveClientStatus.notConnected
	private _content?: DBLiveContent
	private _socket?: DBLiveSocket
	
	private api?: DBLiveAPI
	private handlers: DBLiveEventHandler<{ [key: string]: unknown }>[] = []
	private readonly keys: { [key: string]: DBLiveKey } = {}
	private readonly logger = new DBLiveLogger("DBLiveClient")
	private setEnv?: "api"|"socket"

	constructor(
		private readonly appKey: string,
	) { }

	get socket(): DBLiveSocket|undefined {
		return this._socket
	}
	set socket(socket: DBLiveSocket|undefined) {
		this._socket = socket

		for (const key in this.keys) {
			this.keys[key].socket = socket
		}
	}

	// eslint-disable-next-line @typescript-eslint/member-ordering
	private get content(): DBLiveContent|undefined {
		return this._content
	}
	private set content(content: DBLiveContent|undefined) {
		this._content = content

		for (const key in this.keys) {
			this.keys[key].content = content
		}
	}

	async connect(): Promise<void> {
		if (this.status !== DBLiveClientStatus.notConnected) {
			if (this.status === DBLiveClientStatus.connecting) {
				await new Promise<void>(resolve => this.once("connect", () => resolve()))
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

		this.setEnv = initResult.setEnv
		this.connectSocket(`https://${initResult.socketDomain}/`, initResult.cookie)
		this.content = new DBLiveContent(`https://${initResult.contentDomain}/`)

		await new Promise<void>(resolve => this.once("socket-connected", () => {
			this.status = DBLiveClientStatus.connected
			setTimeout(() => this.handleEvent("connect"), 1)
			resolve()
		}))
	}

	dispose(): void {
		this.socket && this.socket.dispose()
	}

	get(key: string, callback: (value: string|undefined) => unknown): void {
		if (this.status !== DBLiveClientStatus.connected) {
			this.once("connect", () => this.get(key, callback))
			void this.connect()
			return
		}

		this.logger.debug(`get(${key})`)

		const callCallback = (value: string|undefined): void => {
			setTimeout(() => callback(value))
		}

		const cachedValue = this.content.getFromCache(key)

		if (cachedValue) {
			this.logger.debug("Key exists in cache")
			callCallback(cachedValue)
		}

		void this.content.get(key)
			.then(value => {
				if (!cachedValue || value !== cachedValue) {
					callCallback(value)
				}
			})
			.catch(err => {
				this.logger.error(`Error while getting '${key}':`, err)
			})
	}

	getAndListen(key: string, handler: (args: DBLiveClientGetAndListenHandlerArgs) => unknown): DBLiveKeyEventListener {
		this.logger.debug(`getAndListen(${key})`)

		this.get(key, value => handler({ value }))

		return this.key(key).onChanged(handler)
	}

	getJson<T>(key: string, callback: (value: T|undefined) => unknown): void {
		if (this.status !== DBLiveClientStatus.connected) {
			this.once("connect", () => this.getJson(key, callback))
			void this.connect()
			return
		}

		this.logger.debug(`getJson(${key})`)

		const callCallback = (value: T|undefined): void => {
			setTimeout(() => callback(value))
		}

		const cachedValue = this.content.getFromCache(key)

		if (cachedValue) {
			try {
				this.logger.debug("Key exists in cache")
				const jsonValue = JSON.parse(cachedValue) as T
				callCallback(jsonValue)
			}
			catch(err) {
				this.logger.error("Could not json parse value in cache:", err)
			}
		}

		void this.content.get(key)
			.then(value => {
				try {
					const jsonValue = value && JSON.parse(value) as T
					callCallback(jsonValue)
				}
				catch(err) {
					this.logger.error(`Could not json parse key '${key}' with value '${value}':`, err)
					callCallback(undefined)
				}
			})
			.catch(err => {
				this.logger.error(`Error while getting '${key}':`, err)
			})
	}

	getJsonAndListen<T>(key: string, handler: (args: DBLiveClientGetJsonAndListenHandlerArgs<T>) => unknown): DBLiveKeyEventListener {
		this.logger.debug(`getJsonAndListen(${key})`)

		this.getJson<T>(key, value => handler({ value }))

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
		return this.keys[key] = this.keys[key] || new DBLiveKey(key, this, this.content, this.socket)
	}

	off(id: string): this {
		this.logger.debug(`Removing handler ${id}`)

		this.handlers = this.handlers.filter(h => h.id !== id)

		return this
	}

	on(event: string, handler: DBLiveCallback<{ [key: string]: unknown }>): string {
		const eventHandler = new DBLiveEventHandler(event, false, handler)

		this.handlers.push(eventHandler)

		return eventHandler.id
	}

	once(event: string, handler: DBLiveCallback<{ [key: string]: unknown }>): string {
		const eventHandler = new DBLiveEventHandler(event, true, handler)

		this.handlers.push(eventHandler)

		return eventHandler.id
	}

	reset(): void {
		this.logger.debug("reset")

		this.socket && this.socket.dispose()

		this.socket = undefined
		this.api = undefined
		this.content = undefined
		this.status = DBLiveClientStatus.notConnected

		void this.connect()
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

		this.handleEvent(`key:${key}`, {
			action: "changed",
			customArgs: options.customArgs,
			key,
			value,
		})

		let success = false

		if (this.setEnv === "socket") {
			const result = await this.socket.put(
				key,
				value,
				{
					contentType,
					customArgs: options.customArgs,
				},
			)
			success = result.versionId !== undefined
		}
		else {
			const result = await this.api.set(
				key,
				value,
				{
					contentType,
					customArgs: options.customArgs,
				},
			)
			success = result && !isErrorResult(result) && result.versionId !== undefined
		}

		return success
	}

	private connectSocket(url: string, cookie: string|undefined) {
		this.logger.debug("Connecting to Socket")

		this.socket = new DBLiveSocket(url, this.appKey, this, cookie)
	}

}

export type DBLiveClientSetOptions = {
	customArgs?: unknown
}

export type DBLiveClientGetAndListenHandlerArgs = {
	value: string|undefined
	customArgs?: unknown
}

export type DBLiveClientGetJsonAndListenHandlerArgs<T> = {
	value: T|undefined
	customArgs?: unknown
}