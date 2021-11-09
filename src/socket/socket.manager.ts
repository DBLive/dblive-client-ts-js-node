import DBLiveClient, { DBLiveLogger } from ".."
import { Disposable } from "../common/interfaces/disposable"
import { DBLivePutResult } from "../types/putresult"
import { DBLiveSocket, DBLiveSocketState } from "./socket"
import { DBLiveSocketErrorResult, DBLiveSocketGetRedirectResult, DBLiveSocketGetResult, DBLiveSocketLockOptions, DBLiveSocketLockResult, DBLiveSocketMetaResult, DBLiveSocketPutOptions, DBLiveSocketUnlockResult, isSocketErrorResult } from "./socket.types"

export class DBLiveSocketManager implements Disposable
{
	private readonly logger = new DBLiveLogger("DBLiveSocketManager")
	private readonly sockets: DBLiveSocket[] = []

	constructor(
		socketDomains: string[],
		appKey: string,
		client: DBLiveClient,
		cookie: string|undefined,
	) {
		for (const socketDomain of socketDomains) {
			this.logger.debug(`Connecting to Socket '${socketDomain}'`)
			this.sockets.push(new DBLiveSocket(`https://${socketDomain}/`, appKey, client, cookie))
		}
	}

	get isConnected(): boolean {
		return this.sockets.find((socket: DBLiveSocket) => socket.state !== DBLiveSocketState.notConnected) !== undefined
	}

	dispose() {
		for (const socket of this.sockets) {
			socket.dispose()
		}
	}
	
	async get(key: string): Promise<DBLiveSocketGetResult|DBLiveSocketGetRedirectResult|DBLiveSocketErrorResult> {
		return await this.sendToSockets((socket: DBLiveSocket) => socket.get(key))
	}

	async lock(key: string, options: DBLiveSocketLockOptions = {}): Promise<DBLiveSocketLockResult|DBLiveSocketErrorResult> {
		return await this.sendToSockets((socket: DBLiveSocket) => socket.lock(key, options))
	}

	async meta(key: string): Promise<DBLiveSocketMetaResult|DBLiveSocketErrorResult> {
		return await this.sendToSockets((socket: DBLiveSocket) => socket.meta(key))
	}

	async put(key: string, value: string, options: DBLiveSocketPutOptions): Promise<DBLivePutResult|DBLiveSocketErrorResult> {
		return await this.sendToSockets((socket: DBLiveSocket) => socket.put(key, value, options))
	}

	async stopWatching(key: string): Promise<void> {
		await this.sendToSockets((socket: DBLiveSocket) => socket.stopWatching(key))
	}

	async unlock(key: string, lockId: string): Promise<DBLiveSocketUnlockResult|DBLiveSocketErrorResult> {
		return await this.sendToSockets((socket: DBLiveSocket) => socket.unlock(key, lockId))
	}

	async watch(key: string): Promise<void> {
		await this.sendToSockets((socket: DBLiveSocket) => socket.watch(key))
	}

	private async sendToSockets<T>(handler: (socket: DBLiveSocket) => Promise<T|DBLiveSocketErrorResult>, timeoutMS = 5000): Promise<T|DBLiveSocketErrorResult> {
		return await new Promise<T|DBLiveSocketErrorResult>(resolve => {
			let result: T|DBLiveSocketErrorResult|undefined = undefined
			let finished = false
			let numSocketsReturned = 0

			const timeout: NodeJS.Timeout = setTimeout(() => {
				if (finished)
					return

				finished = true

				resolve(result || {
					errorCode: "timeout",
					errorDescription: `No socket returned a response within ${timeoutMS} ms`,
				})
			}, timeoutMS)
			
			const socketReturned = (value: T|DBLiveSocketErrorResult|undefined): void => {
				if (finished)
					return
				
				numSocketsReturned++
				
				if (value && isSocketErrorResult(value)) {
					if (value.errorCode === "socket-duplicate-call") {
						return
					}

					result = result || value
					
					if (numSocketsReturned < this.sockets.length) {
						return
					}
				}
				else {
					result = value
				}

				clearTimeout(timeout)
				finished = true
				resolve(result)
			}

			for (const socket of this.sockets) {
				handler(socket)
					.then((value: T|DBLiveSocketErrorResult) => {
						socketReturned(value)
					})
					.catch(err => {
						this.logger.error(`Socket '${socket.url}' threw an exception:`, err)

						socketReturned({
							errorCode: "socket-exception",
							errorDescription: "Socket threw an exception. Check logs.",
						})
					})
			}
		})
	}

}