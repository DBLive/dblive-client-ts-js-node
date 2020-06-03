import { DBLiveClient } from "../client/client"
import { DBLiveContent } from "../content/content"
import { DBLiveSocket } from "../socket/socket"
import { DBLiveLogger } from "../util/logger"
import { DBLiveKeyEventListener } from "./key.eventlistener"

export class DBLiveKey
{
	private _content?: DBLiveContent
	get content(): DBLiveContent|undefined {
		return this._content
	}
	set content(content: DBLiveContent|undefined) {
		if (content === this._content)
			return

		this._content = content
	}

	private _isWatching = true
	get isWatching(): boolean {
		return this._isWatching
	}
	set isWatching(isWatching: boolean) {
		if (isWatching === this._isWatching)
			return

		this._isWatching = isWatching

		if (isWatching) {
			this.startWatching()
		}
		else {
			this.stopWatching()
		}
	}

	private _socket?: DBLiveSocket
	get socket(): DBLiveSocket|undefined {
		return this._socket
	}
	set socket(socket: DBLiveSocket|undefined) {
		if (socket === this._socket)
			return

		this._socket = socket

		void this.restartSocketWatch()
	}

	private clientKeyListenerId?: string
	private currentValue?: string
	private keyValueVersions: { [version: string]: string|undefined } = {}
	private readonly listeners: DBLiveKeyEventListener[] = []
	private readonly logger = new DBLiveLogger("DBLiveKey")

	constructor(
		private readonly key: string,
		private readonly client: DBLiveClient,
		content: DBLiveContent|undefined,
		socket: DBLiveSocket|undefined,
	) {
		this._socket = socket
		this.content = content

		this.startWatching()
	}

	onChanged(handler: (value: string|undefined) => void): DBLiveKeyEventListener {
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

	private emitToListeners(action: "changed"|"deleted", value: string|undefined): void {
		this.logger.debug(`emitToListeners(${action}, ${value})`)

		for (const listener of this.listeners.filter(l => l.listening && l.action === action)) {
			listener.handler(value)
		}
	}

	private async onKeyEvent(data: DBLiveKeyEventData): Promise<void> {
		this.logger.debug("onKeyEvent -", data)

		let doEmit = true

		if (data.version) {
			if (this.keyValueVersions[data.version] && this.keyValueVersions[data.version] === data.value) {
				doEmit = false
			}
			else if (data.value) {
				this.keyValueVersions[data.version] = data.value
			}
			else {
				delete this.keyValueVersions[data.version]
			}
		}

		if (data.action === "changed") {
			if (data.value) {
				this.content && this.content.setCache(this.key, data.value)

				if (doEmit) {
					this.currentValue = data.value
					this.emitToListeners("changed", data.value)
				}
			}
			else {
				const value = this.content && await this.content.get(this.key, data.version)

				this.currentValue = value
				this.emitToListeners("changed", value)
			}
		}
		else if (data.action === "deleted") {
			this.content && this.content.deleteCache(this.key)

			if (doEmit) {
				this.currentValue = undefined
				this.emitToListeners("changed", undefined)
			}
		}
		else {
			this.logger.warn(`No key event handler for action '${data.action as string}'`)
		}
	}

	private async restartSocketWatch(): Promise<void> {
		if (this.isWatching) {
			this.socket && this.socket.watch(this.key)

			const value = this.content && await this.content.get(this.key)

			if (value && value !== this.currentValue) {
				this.currentValue = value
				this.emitToListeners("changed", value)
			}
		}
	}

	private startWatching(): void {
		if (this.clientKeyListenerId) {
			this.stopWatching()
		}

		this.logger.debug("startWatching")

		this.clientKeyListenerId = this.client.on(`key:${this.key}`, data => void this.onKeyEvent(data as DBLiveKeyEventData))

		this.socket && this.socket.watch(this.key)
	}

	private stopWatching(): void {
		this.logger.debug("stopWatching")

		if (this.clientKeyListenerId) {
			this.client.off(this.clientKeyListenerId)
			this.clientKeyListenerId = undefined
		}

		this.socket && this.socket.stopWatching(this.key)
	}
}

type DBLiveKeyEventData = {
	action: "changed"|"deleted"
	etag?: string
	value?: string
	version?: string
}