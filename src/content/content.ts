import { DBLiveAPI } from "../api/api"
import { isErrorResult } from "../common/error.result"
import { DBLiveRequest, DBLiveRequestInit } from "../common/request"
import { DBLiveSocket, isSocketRedirectResult } from "../socket/socket"
import { DBLiveLogger } from "../util/logger"

export class DBLiveContent
{
	private readonly logger = new DBLiveLogger("DBLiveContent")
	private readonly storage: DBLiveContentCacheStorage = global.localStorage || new DBLiveContentLocalCacheStorage()
	private readonly request = new DBLiveRequest()

	constructor(
		private readonly appKey: string,
		private readonly url: string,
		private readonly api: DBLiveAPI,
		public socket?: DBLiveSocket,
		private readonly setEnv?: "api"|"socket",
	) { }

	clearCache(): void {
		this.logger.debug("clearCache")

		this.storage.clear()
	}

	deleteCache(key: string): void {
		this.logger.debug(`deleteCache '${key}'`)

		this.storage.removeItem(this.storageKeyFor(key))
	}

	async get(key: string, version: string|undefined = undefined): Promise<string|undefined> {
		if (version) {
			this.logger.debug(`get '${key}', version: '${version}'`)
		}
		else {
			this.logger.debug(`get '${key}'`)
		}

		if (!version && this.socket && this.socket.isConnected) {
			return await this.getFromSocket(key)
		}

		return await this.getFromUrl(key, version)
	}

	getFromCache(key: string): string|undefined {
		this.logger.debug(`getFromCache '${key}'`)

		return this.storage.getItem(this.storageKeyFor(key))
	}

	async refresh(key: string): Promise<string|undefined> {
		this.logger.debug(`refresh '${key}'`)

		if (!this.socket)
			return undefined
		
		const clientEtag = this.getFromCache(`${key}-etag`)
		
		if (!clientEtag) {
			this.logger.debug("refresh invalid - nothing stored locally")
			return await this.get(key)
		}

		const serverMeta = await this.socket.meta(key),
			serverEtag = serverMeta && serverMeta.etag
		
		if (clientEtag === serverEtag) {
			this.logger.debug("refresh complete - values hasn't changed")
			return this.getFromCache(key)
		}

		this.logger.debug(`refresh needs to update from server. serverEtag: '${serverEtag}', clientEtag: '${clientEtag}'`)

		return await this.get(key)
	}

	async set(key: string, value: string, options: DBLiveContentSetOptions): Promise<boolean> {
		let versionId: string|undefined = undefined

		if (this.setEnv === "socket") {
			const result = await this.socket.put(
				key,
				value,
				options,
			)
			versionId = result.versionId
		}
		else {
			const result = await this.api.set(
				key,
				value,
				options,
			)
			versionId = result && !isErrorResult(result) && result.versionId
		}

		if (versionId) {
			this.setCache(key, value)
			this.setCache(`${key}-etag`, versionId)
		}

		return versionId !== undefined
	}

	setCache(key: string, value: string): void {
		this.logger.debug(`setCache '${key}': '${value}'`)

		this.storage.setItem(this.storageKeyFor(key), value)
	}

	private async getFromUrl(key: string, version: string|undefined = undefined): Promise<string|undefined> {
		if (version) {
			this.logger.debug(`getFromUrl '${key}', version: '${version}'`)
		}
		else {
			this.logger.debug(`getFromUrl '${key}'`)
		}

		const url = this.urlFor(key, version),
			cachedValue = this.getFromCache(key),
			etag = this.getFromCache(`${key}-etag`),
			params: DBLiveRequestInit = {
				cache: "no-cache",
				keepalive: true,
			}

		if (cachedValue && etag) {
			this.logger.debug(`getFromUrl local etag: '${etag}'`)
			params.headers = params.headers || {};
			(params.headers as Record<string, string>)["If-None-Match"] = etag
		}
		
		const response = await this.request.get(url, params)

		if (!response)
			return undefined
		
		let result = await response.text()

		if (response.status === 200) {
			this.logger.debug("getFromUrl 200 response")
			this.setCache(key, result)

			const newEtag = response.headers.get("etag")
			if (newEtag) {
				this.logger.debug(`getFromUrl new etag: ${newEtag}`)
				this.setCache(`${key}-etag`, newEtag)
			}
		}
		else if (response.status === 304) {
			this.logger.debug("getFromUrl 304 - returning cached version")

			if (result && result.length) {
				this.setCache(key, result)
			}
			else {
				result = cachedValue
			}
		}
		else if (response.status === 404 || response.status === 403) {
			this.logger.debug(`getFromUrl ${response.status} - key not found`)
			result = undefined
		}
		else {
			this.logger.warn(`getFromUrl unhandled response status code ${response.status}`)
			result = undefined
		}

		return result
	}

	private async getFromSocket(key: string): Promise<string|undefined> {
		this.logger.debug(`getFromSocket '${key}'`)

		if (!this.socket || !this.socket.isConnected) {
			this.logger.warn("getFromSocket socket not connected")
			return undefined
		}
		
		const result = await this.socket.get(key)

		if (isSocketRedirectResult(result)) {
			this.logger.debug(`getFromSocket redirect result: ${result.url}`)
			return await this.getFromUrl(key)
		}

		if (result.value) {
			this.logger.debug("getFromSocket result")
			this.setCache(key, result.value)

			if (result.etag) {
				this.logger.debug(`getFromSocket new etag: ${result.etag}`)
				this.setCache(`${key}-etag`, result.etag)
			}
		}

		return result.value
	}

	private storageKeyFor(key: string, version: string|undefined = undefined): string {
		return `${this.appKey}/${key}${(version && `-${version}`) || ""}`
	}

	private urlFor(key: string, version: string|undefined = undefined): string {
		return `${this.url}${key}${(version && `-${version}`) || ""}`
	}
}

interface DBLiveContentCacheStorage
{
	[name: string]: unknown
	readonly length: number
	clear(): void
	getItem(key: string): string|undefined
	key(index: number): string|undefined
	removeItem(key: string): void
	setItem(key: string, value: string): void
}

class DBLiveContentLocalCacheStorage implements DBLiveContentCacheStorage
{
	[name: string]: unknown

	private items: { [name: string]: unknown  } = {}

	get length(): number {
		return Object.keys(this.items).length
	}

	clear(): void {
		this.items = {}
	}

	getItem(key: string): string|null {
		return this.items[key] as string
	}

	key(index: number): string|null {
		const keys = Object.keys(this.items)
		return keys[index]
	}

	removeItem(key: string): void {
		delete this.items[key]
	}

	setItem(key: string, value: string): void {
		this.items[key] = value
	}
}

type DBLiveContentSetOptions = {
	contentType: string
	customArgs?: unknown
}