import { DBLiveClient } from "../client/client"
import { DBLiveContent } from "../content/content"
import { DBLiveSocket, KeyEventData } from "../socket/socket"
import { DBLiveLogger } from "../util/logger"
import { DBLiveKeyEventHandlerArgs, DBLiveKeyEventListener } from "./key.eventlistener"

export class DBLiveKey
{
	private _content?: DBLiveContent
	private _isWatching = true
	private _socket?: DBLiveSocket
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

	get content(): DBLiveContent|undefined {
		return this._content
	}
	set content(content: DBLiveContent|undefined) {
		this._content = content

		if (content)
			void this.refresh()
	}

	// eslint-disable-next-line @typescript-eslint/member-ordering
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

	// eslint-disable-next-line @typescript-eslint/member-ordering
	get socket(): DBLiveSocket|undefined {
		return this._socket
	}
	set socket(socket: DBLiveSocket|undefined) {
		this._socket = socket

		void this.restartSocketWatch()
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
					this.emitToListeners("changed", {
						customArgs: data.customArgs,
						value: data.value,
					})
				}
			}
			else {
				const value = this.content && await this.content.get(this.key, data.version)

				this.currentValue = value
				this.emitToListeners("changed", {
					customArgs: data.customArgs,
					value,
				})
			}
		}
		else if (data.action === "deleted") {
			this.content && this.content.deleteCache(this.key)

			if (doEmit) {
				this.currentValue = undefined
				this.emitToListeners("changed", {
					customArgs: data.customArgs,
					value: undefined,
				})
			}
		}
		else {
			this.logger.warn(`No key event handler for action '${data.action as string}'`)
		}
	}

	private async refresh(): Promise<void> {
		if (!this.content)
			return
		
		const refreshedValue = await this.content.refresh(this.key)

		if (refreshedValue !== this.currentValue) {
			this.currentValue = refreshedValue
			this.emitToListeners("changed", {
				value: refreshedValue,
			})
		}
	}

	private async restartSocketWatch(): Promise<void> {
		if (this.isWatching) {
			this.logger.debug(`Restarting socket watch on key ${this.key}`)

			this.socket && this.socket.watch(this.key)

			const value = this.content && await this.content.get(this.key)

			if (value && value !== this.currentValue) {
				this.currentValue = value
				this.emitToListeners("changed", {
					value,
				})
			}
		}
	}

	private startWatching(): void {
		if (this.clientKeyListenerId) {
			this.stopWatching()
		}

		this.logger.debug("startWatching")

		this.clientKeyListenerId = this.client.on(`key:${this.key}`, (data: KeyEventData) => {
			let customArgs: unknown = data.customArgs

			if (data.customArgs && typeof(data.customArgs) === "string") {
				try {
					customArgs = JSON.parse(data.customArgs) as unknown
				}
				catch (jsonParseError) {
					// Nothing to do
				}
			}

			void this.onKeyEvent({
				action: data.action,
				customArgs,
				etag: data.etag,
				value: data.value,
				version: data.version,
			})
		})

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
	customArgs?: unknown
	etag?: string
	value?: string
	version?: string
}