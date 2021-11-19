import { DBLiveClient, DBLiveClientInternalLibrary, DBLiveClientLock } from "../client/client"
import { Disposable } from "../common/interfaces/disposable"
import { DBLiveContentType } from "../content/content"
import { DBLiveSocketKeyChangedData, DBLiveSocketKeyDeletedData, isSocketKeyChangedData, isSocketKeyDeletedData } from "../socket/socket.types"
import { DBLiveLogger } from "../util/logger"
import { DBLiveKeyEventHandlerArgs, DBLiveKeyEventListener } from "./key.eventlistener"

export class DBLiveKey<T> implements Disposable
{
	private _isWatching = true
	private _ready = false
	private clientKeyListenerId?: string
	private currentValue?: T
	private readonly clientSocketReconnectListenerId: string
	private readonly listeners: DBLiveKeyEventListener<T>[] = []
	private readonly logger = new DBLiveLogger(`DBLiveKey('${this.key}')`)

	constructor(
		private readonly key: string,
		private readonly client: DBLiveClient,
		private readonly lib: DBLiveClientInternalLibrary,
	) {
		this.loadFromCache()
			.then(() => this.startWatching())
			.then(() => this.refresh())
			.then(() => this.ready = true)
			.catch(err => {
				this.logger.error(`Error initializing key '${key}'`, err)
			})

		this.clientSocketReconnectListenerId = client.on("socket-reconnected", () => {
			this.ready = false

			if (this.isWatching) {
				this.logger.debug("Re-initializing key because of socket reconnection")

				this.startWatching()
					.then(() => this.refresh())
					.then(() => this.ready = true)
					.catch(err => {
						this.logger.error(`Error re-initializing key '${key}'`, err)
					})
			}
		})
	}

	private get isWatching(): boolean {
		return this._isWatching
	}
	private set isWatching(isWatching: boolean) {
		if (isWatching === this._isWatching)
			return

		this._isWatching = isWatching

		if (isWatching) {
			this.startWatching()
				.then(() => this.refresh())
				.then(() => this.ready = true)
				.catch(err => {
					this.logger.error(`Error restarting isWatching on key '${this.key}'`, err)
				})
		}
		else {
			void this.stopWatching()
		}
	}

	// eslint-disable-next-line @typescript-eslint/member-ordering
	private get ready(): boolean {
		return this._ready
	}
	private set ready(ready: boolean) {
		if (ready === this._ready)
			return
		
		this._ready = ready

		if (ready) {
			this.client.handleEvent(`key:${this.key}:ready`)
		}
	}

	dispose() {
		this.client.off(this.clientSocketReconnectListenerId)
		this.isWatching = false
	}

	async get(options: DBLiveKeyGetOptions = {}): Promise<T|undefined> {
		this.logger.debug("get()")

		if (!this.ready) {
			this.logger.debug("get(): waiting for ready")
			await this.waitForReady()
		}

		const content = await this.lib.content()

		if (!options.bypassCache) {
			this.logger.debug("get(): returning memory value")
			return this.currentValue
		}

		try {
			this.logger.debug("get(): Retrieving value from server")

			const result = await content.get<T>(this.key)

			if (result) {
				this.logger.debug("get(): Returning value from server")
				this.currentValue = result.value
				return this.currentValue
			}
			else {
				this.logger.debug("get(): No value on server")
				this.currentValue = undefined
				return undefined
			}
		}
		catch(err) {
			this.logger.error("get(): Error while getting key from server:", err)
		}

		return undefined
	}

	getAndListen(handler: (args: DBLiveKeyGetAndListenHandlerArgs<T>) => unknown): DBLiveKeyEventListener<T> {
		this.logger.debug("getAndListen()")

		this.get()
			.then(value => handler(value))
			.catch(() => handler({}))

		return this.onChanged(value => handler(value))
	}

	onChanged(handler: (args: DBLiveKeyEventHandlerArgs<T>) => unknown): DBLiveKeyEventListener<T> {
		const listener = new DBLiveKeyEventListener("changed", (args: DBLiveKeyEventHandlerArgs<T>) => handler(args))
			.onListeningChanged(() => this.checkListenerStatus())

		this.listeners.push(listener)

		this.isWatching = true

		return listener
	}

	async set(value: T, options: DBLiveKeySetOptions = {}): Promise<boolean> {
		this.logger.debug("set() - ", value)

		if (!this.ready) {
			this.logger.debug("set(): waiting for ready")
			await this.waitForReady()
		}

		const oldValue = this.currentValue
		this.currentValue = value

		this.emitToListeners("changed", {
			customArgs: options.customArgs,
			oldValue,
			value,
		})

		const content = await this.lib.content()
		const contentType = typeof(value) === "string" ? DBLiveContentType.string : DBLiveContentType.json

		return await content.set(
			this.key,
			value,
			contentType,
			{
				customArgs: {
					...options.customArgs,
					clientId: this.client.clientId,
				},
				lockId: options.lock && options.lock.lockId,
			},
		)
	}

	private checkListenerStatus() {
		if (this.isWatching) {
			if (!this.listeners.find(l => l.listening)) {
				this.isWatching = false
			}
		}
		else {
			if (this.listeners.find(l => l.listening)) {
				this.isWatching = true
			}
		}
	}

	private emitToListeners(action: "changed"|"deleted", args: DBLiveKeyEventHandlerArgs<T>): void {
		this.logger.debug(`emitToListeners(${action})`, args)

		for (const listener of this.listeners) {
			if (listener.listening && listener.action === action) {
				listener.handler(args)
			}
		}
	}

	private async loadFromCache(): Promise<void> {
		this.logger.debug("loadFromCache()")
		
		const content = await this.lib.content()
		const cachedValue = content.getFromCache<T>(this.key)

		if (cachedValue && cachedValue.value) {
			this.logger.debug("loadFromCache(): cache loaded into memory")
			this.currentValue = cachedValue.value
		}
		else {
			this.logger.debug("loadFromCache(): value not in cache")
			this.currentValue = undefined
		}
	}

	private async onKeyEvent(data: DBLiveKeyEventData): Promise<void> {
		this.logger.debug("onKeyEvent()", data)

		const oldValue = this.currentValue

		if (data.action === "changed") {
			if (data.value) {
				let value: T
				
				try {
					value = (data.contentType === DBLiveContentType.json ? JSON.parse(data.value) : data.value) as T
				}
				catch(err) {
					this.logger.error(`onKeyEvent: Error parsing json value from '${data.value}'`, err)
					return
				}

				this.currentValue = value
	
				this.emitToListeners("changed", {
					customArgs: data.customArgs,
					oldValue,
					value,
				})
			}
			else {
				const content = await this.lib.content()
				const refreshedValue = await content.refresh<T>(this.key)

				if (refreshedValue && refreshedValue.didChange) {
					this.currentValue = refreshedValue.value

					this.emitToListeners("changed", {
						customArgs: data.customArgs,
						oldValue,
						value: refreshedValue.value,
					})
				}
			}
		}
		else if (data.action === "deleted") {
			this.currentValue = undefined

			this.emitToListeners("changed", {
				customArgs: data.customArgs,
				oldValue,
				value: undefined,
			})
		}
		else {
			this.logger.warn(`No key event handler for action '${data.action as string}'`)
		}
	}

	private async refresh(): Promise<T|undefined> {
		this.logger.debug("refresh()")

		const oldValue = this.currentValue
		const content = await this.lib.content()
		const result = await content.refresh<T>(this.key)

		if (result) {
			this.logger.debug("refresh(): complete")

			this.currentValue = result.value

			if (result.didChange && result.value !== oldValue) {
				this.logger.debug("refresh(): emitting change to listeners")

				setTimeout(() => {
					this.emitToListeners("changed", {
						oldValue,
						value: result.value,
					})
				})
			}
			else {
				this.logger.debug("refresh(): no change detected")
			}

			return result.value
		}
		else {
			this.logger.warn("refresh(): could not refresh")
		}

		return this.currentValue
	}

	private async startWatching(): Promise<void> {
		this.logger.debug("startWatching()")

		if (this.clientKeyListenerId) {
			this.logger.debug("startWatching(): need to stop previous watch")
			await this.stopWatching()
		}

		this.clientKeyListenerId = this.client.on(`key:${this.key}`, (data: DBLiveSocketKeyChangedData|DBLiveSocketKeyDeletedData) => {
			this.logger.debug("Received key event -", data)

			if (data.customArgs && data.customArgs.clientId === this.client.clientId) {
				this.logger.debug("received key event but it originated from this client, so ignoring")
				return
			}

			if (isSocketKeyChangedData(data)) {
				void this.onKeyEvent({
					action: data.action,
					contentEncoding: data.contentEncoding,
					contentType: data.contentType,
					customArgs: data.customArgs,
					etag: data.etag,
					value: data.value,
					versionId: data.versionId,
				})
			}
			else if (isSocketKeyDeletedData(data)) {
				void this.onKeyEvent({
					action: data.action,
					customArgs: data.customArgs,
				})
			}
		})

		const socket = await this.lib.socket()
		await socket.watch(this.key)
	}

	private async stopWatching(): Promise<void> {
		this.logger.debug("stopWatching()")

		if (this.clientKeyListenerId) {
			this.client.off(this.clientKeyListenerId)
			this.clientKeyListenerId = undefined
		}

		const socket = await this.lib.socket()
		await socket.stopWatching(this.key)
	}

	private async waitForReady(): Promise<void> {
		if (this.ready)
			return
		
		return new Promise<void>(resolve => this.client.once(`key:${this.key}:ready`, () => resolve()))
	}
}

type DBLiveKeyEventData = {
	action: "changed"|"deleted"
	contentEncoding?: string
	contentType?: string
	customArgs?: Record<string, string|number>
	etag?: string
	value?: string
	versionId?: string
}

export type DBLiveKeyGetAndListenHandlerArgs<T> = {
	value?: T
	customArgs?: Record<string, string|number>
}

export type DBLiveKeyGetOptions = {
	bypassCache?: boolean
}

export type DBLiveKeySetOptions = {
	customArgs?: { [key: string]: string|number }
	lock?: DBLiveClientLock
}