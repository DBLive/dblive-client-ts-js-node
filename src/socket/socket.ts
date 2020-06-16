import io from "socket.io-client"
import { DBLiveClient, DBLiveClientStatus } from "../client/client"
import { DBLiveErrorResult, isErrorResult } from "../common/error.result"
import { DBLivePutResult } from "../types/putresult"
import { DBLiveLogger } from "../util/logger"

export class DBLiveSocket
{
	isConnected = false

	private logger = new DBLiveLogger("DBLiveSocket")
	private reconnectOnDisconnect = false
	private socket: SocketIOClient.Socket

	constructor(
		private readonly url: string,
		private readonly appKey: string,
		private readonly client: DBLiveClient,
		private readonly cookie: string|undefined,
	) {
		this.connect()
	}

	dispose(): void {
		this.socket.disconnect()
	}

	async put(key: string, value: string, contentType = "text/plain"): Promise<DBLivePutResult> {
		if (!this.socket)
			return {}

		this.logger.debug(`put '${key}'='${value}', ${contentType}`)

		return await new Promise(resolve => {
			this.socket.emit(
				"put",
				{
					body: value,
					contentType,
					key,
				},
				(data: DBLivePutResult) => {
					this.logger.debug("put ack:", data)
					resolve(data)
				},
			)
		})
	}

	async stopWatching(key: string): Promise<void> {
		if (this.client.status !== DBLiveClientStatus.connected) {
			await this.client.connect()
		}

		this.logger.debug(`stop watching key '${key}'`)

		this.socket.emit("stop-watching", {
			key,
		})
	}

	async watch(key: string): Promise<void> {
		if (this.client.status !== DBLiveClientStatus.connected) {
			await this.client.connect()
		}

		this.logger.debug(`watch key '${key}'`)

		this.socket.emit("watch", {
			key,
		})
	}

	private connect(): void {
		this.logger.debug(`Connecting to socketUrl ${this.url} with cookie: ${this.cookie}`)

		const socketOpts: SocketIOClient.ConnectOpts = {
			forceNew: true,
		}

		if (this.cookie) {
			socketOpts.transportOptions = {
				polling: {
					extraHeaders: {
						"Cookie": this.cookie,
					},
				},
				websocket: {
					extraHeaders: {
						"Cookie": this.cookie,
					},
				},
			}

			socketOpts.transports = ["websocket"]
		}
		else {
			socketOpts.transports = ["websocket"]
		}

		this.socket = io(this.url, socketOpts)

		this.socket.on("connect", () => this.onConnect())
		this.socket.on("connect_error", (err: unknown) => this.onConnectError(err))
		this.socket.on("connect_timeout", () => this.onConnectTimeout())
		this.socket.on("dbl-error", (data: { error: DBLiveErrorResult }) => this.onDBLError(data))
		this.socket.on("disconnect", (reason: string) => this.onDisconnect(reason))
		this.socket.on("error", (err: unknown) => this.onError(err))
		this.socket.on("key", (data: KeyEventData) => this.onKey(data))
		this.socket.on("reconnect", (attemptNumber: number) => this.onReconnect(attemptNumber))
		this.socket.on("reconnecting", (attemptNumber: number) => this.onReconnecting(attemptNumber))
		this.socket.on("reconnect_error", (err: unknown) => this.onReconnectError(err))
		this.socket.on("reconnect_failed", () => this.onReconnectFailed())
		this.socket.on("reset", () => this.onReset())
	}

	private emitAppKey(): void {
		this.logger.debug("Approving appKey")

		this.socket.emit(
			"app",
			{
				appKey: this.appKey,
			},
			(data: DBLiveErrorResult|undefined) => {
				if (data && isErrorResult(data)) {
					this.client.handleEvent("error", {
						error: new Error(`Socket error '${data.code}': '${data.description}'`),
					})

					return
				}

				this.client.handleEvent("socket-connected")
				this.client.socket = this
			},
		)
	}

	private onConnect(): void {
		this.logger.debug("connected")
		this.isConnected = true
		void this.emitAppKey()
	}

	private onConnectError(err: unknown): void {
		this.logger.error("connect error:", err)
		this.client.handleEvent("error", {
			error: err,
		})
	}

	private onConnectTimeout(): void {
		this.logger.error("connect timeout")
		this.client.handleEvent("error", {
			error: new Error("DBLive socket connection timed out"),
		})
	}

	private onDBLError(data: { error: DBLiveErrorResult }): void {
		this.logger.error("dbl-error:", data)
	}

	private onDisconnect(reason: string): void {
		this.logger.debug(`disconnect - '${reason}'`)

		this.isConnected = false

		if (this.reconnectOnDisconnect) {
			this.reconnectOnDisconnect = false
			this.connect()
		}
	}

	private onError(err: unknown): void {
		this.logger.error("Socket error:", err)

		if (err === "Session ID unknown") {
			this.reconnectOnDisconnect = true
			this.socket.disconnect()
		}
	}

	private onKey(data: KeyEventData) {
		this.logger.debug("key -", data)

		if (!data.action || !data.key)
			return

		this.client.handleEvent(`key:${data.key}`, data)
	}

	private onReconnect(attemptNumber: number): void {
		this.logger.debug(`reconnected on ${attemptNumber}`)
		this.isConnected = true
	}

	private onReconnecting(attemptNumber: number): void {
		this.logger.debug(`reconnecting attempt ${attemptNumber}`)
		this.isConnected = false
	}

	private onReconnectError(err: unknown): void {
		this.logger.error("reconnect error:", err)
	}

	private onReconnectFailed(): void {
		this.logger.error("reconnect failed")
	}

	private onReset(): void {
		this.logger.debug("reset")

		this.client.reset()
	}
}

type KeyEventData = {
	action: "changed"|"deleted"
	etag?: string
	key: string
	value?: string
	version?: string
}