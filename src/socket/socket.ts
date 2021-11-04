import io, { ManagerOptions, Socket, SocketOptions } from "socket.io-client"
import { DBLiveClient } from "../client/client"
import { DBLiveErrorResult, isErrorResult } from "../common/error.result"
import { DBLivePutResult } from "../types/putresult"
import { DBLiveLogger } from "../util/logger"

export class DBLiveSocket
{
	public state = DBLiveSocketState.notConnected

	private readonly logger = new DBLiveLogger("DBLiveSocket")
	private socket!: Socket

	constructor(
		private readonly url: string,
		private readonly appKey: string,
		private readonly client: DBLiveClient,
		private readonly cookie: string|undefined,
	) {
		this.connect()
	}

	dispose(): void {
		this.logger.debug("dispose")

		this.socket.disconnect()
	}

	async get(key: string): Promise<DBLiveSocketGetResult|DBLiveSocketGetRedirectResult> {
		this.logger.debug(`get '${key}'`)

		if (!await this.waitForConnection()) {
			this.logger.warn(`cannot get '${key}', socket disconnected`)

			return {}
		}

		return await new Promise(resolve => {
			this.socket.emit(
				"get",
				{
					key,
				},
				(data: DBLiveSocketGetResult) => {
					this.logger.debug("get ack:", data)
					resolve(data)
				},
			)
		})
	}

	async lock(key: string, options: DBLiveSocketLockOptions = {}): Promise<DBLiveSocketLockResult> {
		this.logger.debug(`lock '${key}'`)

		if (!await this.waitForConnection()) {
			this.logger.warn(`cannot lock '${key}', socket disconnected`)

			return {}
		}

		return await new Promise(resolve => {
			this.socket.emit(
				"lock",
				{
					key,
					timeout: options.timeout,
				},
				(data: DBLiveSocketLockResult) => {
					this.logger.debug("lock ack:", data)
					resolve(data)
				},
			)
		})
	}

	async meta(key: string): Promise<DBLiveSocketMetaResult> {
		this.logger.debug(`meta '${key}'`)

		if (!await this.waitForConnection()) {
			this.logger.warn(`cannot meta '${key}', socket disconnected`)

			return {}
		}

		return await new Promise(resolve => {
			this.socket.emit(
				"meta",
				{
					key,
				},
				(data: DBLiveSocketMetaResult) => {
					this.logger.debug("meta result:", data)
					resolve(data)
				},
			)
		})
	}
	
	async put(key: string, value: string, options: DBLiveSocketPutOptions): Promise<DBLivePutResult> {
		this.logger.debug(`put '${key}'='${value}', ${options.contentType}`)

		if (!await this.waitForConnection()) {
			this.logger.warn(`cannot put '${key}', socket disconnected`)
			
			return {
				success: false,
			}
		}

		return await new Promise(resolve => {
			this.socket.emit(
				"put",
				{
					body: value,
					contentType: options.contentType,
					customArgs: options.customArgs,
					key,
					lockId: options.lockId,
				},
				(data: DBLivePutResult) => {
					this.logger.debug("put ack:", data)
					resolve(data)
				},
			)
		})
	}

	async stopWatching(key: string): Promise<void> {
		this.logger.debug(`stop watching key '${key}'`)

		if (!await this.waitForConnection()) {
			this.logger.warn(`cannot stop watching key '${key}', socket disconnected`)
			return
		}

		return await new Promise<void>(resolve => {
			this.socket.emit(
				"stop-watching",
				{
					key,
				},
				(data: DBLiveSocketStopWatchingResult) => {
					this.logger.debug("stop watching ack:", data)
					resolve()
				},
			)
		})
	}

	async unlock(key: string, lockId: string): Promise<DBLiveSocketUnlockResult> {
		this.logger.debug(`unlock '${key}', '${lockId}'`)

		if (!await this.waitForConnection()) {
			this.logger.warn(`cannot unlock '${key}', socket disconnected`)

			return {
				success: false,
			}
		}

		return await new Promise(resolve => {
			this.socket.emit(
				"unlock",
				{
					key,
					lockId,
				},
				(data: DBLiveSocketUnlockResult) => {
					this.logger.debug("unlock ack:", data)
					resolve(data)
				},
			)
		})
	}

	async waitForConnection(): Promise<boolean> {
		return await new Promise<boolean>(resolve => {
			if (this.state === DBLiveSocketState.connected)
				return resolve(true)
			
			if (this.state === DBLiveSocketState.notConnected)
				return resolve(false)
			
			this.client.once("socket-connected", () => resolve(true))
		})
	}

	async watch(key: string): Promise<void> {
		this.logger.debug(`watch key '${key}'`)

		if (!await this.waitForConnection()) {
			this.logger.warn(`cannot watch key '${key}', socket disconnected`)

			return
		}

		return await new Promise<void>(resolve => {
			this.socket.emit(
				"watch",
				{
					key,
				},
				(data: DBLiveSocketWatchResult) => {
					this.logger.debug("watch ack:", data)
					resolve()
				},
			)
		})
	}

	private connect(): void {
		this.logger.debug(`Connecting to socketUrl ${this.url} with cookie: ${this.cookie}`)

		this.state = DBLiveSocketState.connecting

		const socketOpts: Partial<ManagerOptions & SocketOptions> = {
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

			socketOpts.transports = ["polling", "websocket"]
		}
		else {
			socketOpts.transports = ["websocket"]
		}

		this.socket = io(this.url, socketOpts)

		this.socket.on("connect", () => this.onConnect())
		this.socket.on("connect_error", (err: unknown) => this.onConnectError(err))
		this.socket.on("dbl-error", (data: { error: DBLiveErrorResult }) => this.onDBLError(data))
		this.socket.on("disconnect", (reason: string) => this.onDisconnect(reason))
		this.socket.on("error", (err: unknown) => this.onError(err))
		this.socket.on("key", (data: KeyEventData) => this.onKey(data))
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
					this.state = DBLiveSocketState.notConnected

					this.client.handleEvent("error", {
						error: new Error(`Socket error '${data.code}': '${data.description}'`),
					})

					return
				}

				this.logger.debug("appKey approved")

				this.state = DBLiveSocketState.connected

				this.client.handleEvent("socket-connected")
			},
		)
	}

	private onConnect(): void {
		this.logger.debug("connected")
		void this.emitAppKey()
	}

	private onConnectError(err: unknown): void {
		this.logger.error("connect error:", err)

		this.state = DBLiveSocketState.notConnected

		this.client.handleEvent("error", {
			error: err,
		})
	}

	private onDBLError(data: { error: DBLiveErrorResult }): void {
		this.logger.error("dbl-error:", data)
	}

	private onDisconnect(reason: string): void {
		this.logger.debug(`disconnect - '${reason}'`)

		if (this.state === DBLiveSocketState.reconnectOnDisconnect) {
			this.logger.debug("reconnecting")
			this.connect()
		}
		else if (reason === "ping timeout" || reason === "transport close" || reason === "transport error") {
			this.logger.debug("automatically reconnecting")
			this.state = DBLiveSocketState.reconnecting
		}
		else {
			this.logger.debug("completely disconnected")
			this.state = DBLiveSocketState.notConnected
		}
	}

	private onError(err: unknown): void {
		this.logger.error("Socket error:", err)

		if (err === "Session ID unknown") {
			this.state = DBLiveSocketState.reconnectOnDisconnect
			this.socket.disconnect()
		}
	}

	private onKey(data: KeyEventData) {
		this.logger.debug("key -", data)

		if (!data.action || !data.key)
			return

		this.client.handleEvent(`key:${data.key}`, data)
	}

	private onReset(): void {
		this.logger.debug("reset")

		void this.client.reset()
	}
}

export const isSocketRedirectResult = (args: DBLiveSocketGetResult|DBLiveSocketGetRedirectResult): args is DBLiveSocketGetRedirectResult => {
	return (args as DBLiveSocketGetRedirectResult).url !== undefined
}

export type KeyEventData = {
	action: "changed"|"deleted"
	contentEncoding?: string
	contentType: string
	customArgs?: { [id: string]: string|number }
	etag?: string
	key: string
	oldValue?: string
	value?: string
	versionId?: string
}

export type DBLiveSocketGetResult = {
	contentType?: string
	etag?: string
	value?: string
}

export type DBLiveSocketGetRedirectResult = {
	url?: string
}

export type DBLiveSocketLockOptions = {
	timeout?: number
}

export type DBLiveSocketLockResult = {
	lockId?: string
}

export type DBLiveSocketLockAndPutOptions = {
	customArgs?: unknown
}

export type DBLiveSocketLockAndPutHandlerParams = {
	contentType?: string
	value?: string
}

export type DBLiveSocketLockAndPutResult = DBLivePutResult

export type DBLiveSocketMetaResult = {
	etag?: string
}

export type DBLiveSocketPutOptions = {
	contentType: string
	customArgs?: unknown
	lockId?: string
}

export enum DBLiveSocketState {
	notConnected,
	connecting,
	connected,
	reconnecting,
	reconnectOnDisconnect,
}

export type DBLiveSocketStopWatchingResult = Record<never, never>

export type DBLiveSocketUnlockResult = {
	success: boolean
}

export type DBLiveSocketWatchResult = Record<never, never>