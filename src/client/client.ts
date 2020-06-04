import { DBLiveAPI } from "../api/api"
import { isErrorResult } from "../common/error.result"
import { DBLiveContent } from "../content/content"
import { DBLiveKey } from "../key/key"
import { DBLiveKeyEventListener } from "../key/key.eventlistener"
import { DBLiveSocket } from "../socket/socket"
import { DBLiveCallback } from "../types/dblive.callback"
import { DBLiveLogger } from "../util/logger"
import { DBLiveEventHandler } from "./eventhandler"

export enum DBLiveClientStatus
{
	notConnected,
	connecting,
	connected
}

export class DBLiveClient
{
	public status = DBLiveClientStatus.notConnected

	private _socket?: DBLiveSocket
	get socket(): DBLiveSocket|undefined {
		return this._socket
	}
	set socket(socket: DBLiveSocket|undefined) {
		this._socket = socket

		for (const key in this.keys) {
			this.keys[key].socket = socket
		}
	}

	private _content?: DBLiveContent
	private get content(): DBLiveContent|undefined {
		return this._content
	}
	private set content(content: DBLiveContent|undefined) {
		this._content = content

		for (const key in this.keys) {
			this.keys[key].content = content
		}
	}

	private api?: DBLiveAPI
	private handlers: DBLiveEventHandler<{ [key: string]: unknown }>[] = []
	private readonly keys: { [key: string]: DBLiveKey } = {}
	private readonly logger = new DBLiveLogger("DBLiveClient")
	private setEnv?: "api"|"socket"

	constructor(
		private readonly appKey: string,
	) { }

	async connect(): Promise<void> {
		if (this.status !== DBLiveClientStatus.notConnected) {
			if (this.status === DBLiveClientStatus.connecting) {
				await new Promise(resolve => this.once("connect", () => resolve()))
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

		await new Promise(resolve => this.once("socket-connected", () => {
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

		const cachedValue = this.content.getFromCache(key)

		if (cachedValue) {
			this.logger.debug("Key exists in cache")
			callback(cachedValue)
		}

		void this.content.get(key)
			.then(value => {
				if (!cachedValue || value !== cachedValue) {
					callback(value)
				}
			})
			.catch(err => {
				this.logger.error(`Error while getting '${key}':`, err)
			})
	}

	getAndListen(key: string, handler: (value: string|undefined) => unknown): DBLiveKeyEventListener {
		this.logger.debug(`getAndListen(${key})`)

		this.get(key, handler)

		return this.key(key).onChanged(handler)
	}

	getJson<T>(key: string, callback: (value: T|undefined) => unknown): void {
		if (this.status !== DBLiveClientStatus.connected) {
			this.once("connect", () => this.getJson(key, callback))
			void this.connect()
			return
		}

		this.logger.debug(`getJson(${key})`)

		const cachedValue = this.content.getFromCache(key)

		if (cachedValue) {
			try {
				this.logger.debug("Key exists in cache")
				const jsonValue = JSON.parse(cachedValue) as T
				callback(jsonValue)
			}
			catch(err) {
				this.logger.error("Could not json parse value in cache:", err)
			}
		}

		void this.content.get(key)
			.then(value => {
				try {
					const jsonValue = value && JSON.parse(value) as T
					callback(jsonValue)
				}
				catch(err) {
					this.logger.error(`Could not json parse key '${key}' with value '${value}':`, err)
					callback(undefined)
				}
			})
			.catch(err => {
				this.logger.error(`Error while getting '${key}':`, err)
			})
	}

	getJsonAndListen<T>(key: string, handler: (value: T|undefined) => unknown): DBLiveKeyEventListener {
		this.logger.debug(`getJsonAndListen(${key})`)

		this.getJson(key, handler)

		return this.key(key).onChanged(value => {
			try {
				const jsonValue = value && JSON.parse(value) as T
				handler(jsonValue)
			}
			catch(err) {
				this.logger.error(`Could not json parse key '${key}' with value '${value}':`, err)
				handler(undefined)
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

	async set(key: string, value: string|Record<string, unknown>, contentType = "text/plain"): Promise<boolean> {
		if (this.status !== DBLiveClientStatus.connected) {
			await this.connect()
		}

		if (typeof(value) === "object") {
			value = JSON.stringify(value)
			contentType = "application/json"
		}

		this.logger.debug(`set ${key}='${value}'`)

		this.handleEvent(`key:${key}`, {
			action: "changed",
			key,
			value,
		})

		let success = false

		if (this.setEnv === "socket") {
			const result = await this.socket.put(key, value, contentType)
			success = result.versionId !== undefined
		}
		else {
			const result = await this.api.set(key, value, contentType)
			success = result && !isErrorResult(result) && result.versionId !== undefined
		}

		return success
	}

	private connectSocket(url: string, cookie: string|undefined) {
		this.logger.debug("Connecting to Socket")

		this.socket = new DBLiveSocket(url, this.appKey, this, cookie)
	}

}