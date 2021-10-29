import { DBLiveClient, DBLiveClientInternalLibrary } from "../client/client"
import { KeyEventData } from "../socket/socket"
import { DBLiveLogger } from "../util/logger"
import { DBLiveKeyEventHandlerArgs, DBLiveKeyEventListener } from "./key.eventlistener"

export class DBLiveKey
{
	private _isWatching = true
	private clientKeyListenerId?: string
	private readonly clientSocketReconnectListenerId: string
	private readonly listeners: DBLiveKeyEventListener[] = []
	private readonly logger = new DBLiveLogger("DBLiveKey")

	constructor(
		private readonly key: string,
		private readonly client: DBLiveClient,
		private readonly lib: DBLiveClientInternalLibrary,
	) {
		void this.startWatching()

		this.clientSocketReconnectListenerId = client.on("socket-connected", () => {
			void this.restartSocketWatch()
		})
	}

	get isWatching(): boolean {
		return this._isWatching
	}
	set isWatching(isWatching: boolean) {
		if (isWatching === this._isWatching)
			return

		this._isWatching = isWatching

		if (isWatching) {
			void this.startWatching()
		}
		else {
			void this.stopWatching()
		}
	}

	dispose() {
		this.client.off(this.clientSocketReconnectListenerId)
		this.isWatching = false
	}

	onChanged(handler: (args: DBLiveKeyEventHandlerArgs) => void): DBLiveKeyEventListener {
		const listener = new DBLiveKeyEventListener("changed", handler)
			.onListeningChanged(() => this.checkListenerStatus())

		this.listeners.push(listener)

		return listener
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

	private emitToListeners(action: "changed"|"deleted", args: DBLiveKeyEventHandlerArgs): void {
		this.logger.debug(`emitToListeners(${action})`, args)

		for (const listener of this.listeners.filter(l => l.listening && l.action === action)) {
			listener.handler(args)
		}
	}

	private async onKeyEvent(data: DBLiveKeyEventData): Promise<void> {
		this.logger.debug("onKeyEvent -", data)

		if (data.action === "changed") {
			if (data.value) {
				this.emitToListeners("changed", {
					customArgs: data.customArgs,
					value: data.value,
				})
			}
			else {
				const content = await this.lib.content()
				const currentValue = content.getFromCache(this.key)
				const value = await content.get(this.key, data.versionId)

				if (value && value !== currentValue) {
					this.emitToListeners("changed", {
						customArgs: data.customArgs,
						value,
					})
				}
			}
		}
		else if (data.action === "deleted") {
			this.emitToListeners("changed", {
				customArgs: data.customArgs,
				value: undefined,
			})
		}
		else {
			this.logger.warn(`No key event handler for action '${data.action as string}'`)
		}
	}

	private async restartSocketWatch(): Promise<void> {
		if (this.isWatching) {
			this.logger.debug(`starting socket watch on key ${this.key}`)

			const content = await this.lib.content()
			const socket = await this.lib.socket()

			await socket.watch(this.key)

			const currentValue = content.getFromCache(this.key)
			const value = await content.refresh(this.key)

			if (value && value !== currentValue) {
				this.emitToListeners("changed", {
					value,
				})
			}
		}
	}

	private async startWatching(): Promise<void> {
		if (this.clientKeyListenerId) {
			await this.stopWatching()
		}

		this.logger.debug(`startWatching - '${this.key}'`)

		this.clientKeyListenerId = this.client.on(`key:${this.key}`, (data: KeyEventData) => {
			const customArgs = {
				...data.customArgs,
			}

			if (customArgs.clientId === this.client.clientId) {
				this.logger.debug(`received key event for '${this.key}', but it originated from this client, so ignoring`)
				return
			}

			void this.onKeyEvent({
				action: data.action,
				contentEncoding: data.contentEncoding,
				contentType: data.contentType,
				customArgs,
				etag: data.etag,
				value: data.value,
				versionId: data.versionId,
			})
		})

		const socket = await this.lib.socket()

		await socket.watch(this.key)
	}

	private async stopWatching(): Promise<void> {
		this.logger.debug("stopWatching")

		if (this.clientKeyListenerId) {
			this.client.off(this.clientKeyListenerId)
			this.clientKeyListenerId = undefined
		}

		const socket = await this.lib.socket()

		await socket.stopWatching(this.key)
	}
}

type DBLiveKeyEventData = {
	action: "changed"|"deleted"
	contentEncoding?: string
	contentType: string
	customArgs?: { [key: string]: string|number }
	etag?: string
	oldValue?: string
	value?: string
	versionId?: string
}