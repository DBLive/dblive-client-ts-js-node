import { DBLiveAPI } from "../api/api"
import { isErrorResult } from "../common/error.result"
import { DBLiveRequest, DBLiveRequestInit } from "../common/request"
import { DBLiveSocket, DBLiveSocketState, isSocketRedirectResult } from "../socket/socket"
import { DBLiveLogger } from "../util/logger"

export class DBLiveContent
{
	private readonly logger = new DBLiveLogger("DBLiveContent")
	private readonly 	storage: DBLiveContentCacheStorage = global.localStorage || new DBLiveContentLocalCacheStorage()
	private readonly request = new DBLiveRequest()

	constructor(
		private readonly appKey: string,
		private readonly url: string,
		private readonly api: DBLiveAPI,
		private readonly socket?: DBLiveSocket,
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

	async get(key: string, versionId: string|undefined = undefined): Promise<string|undefined> {
		if (versionId) {
			this.logger.debug(`get '${key}', versionId: '${versionId}'`)
		}
		else {
			this.logger.debug(`get '${key}'`)
		}

		if (!versionId && this.socket.state !== DBLiveSocketState.notConnected) {
			return await this.getFromSocket(key)
		}

		return await this.getFromUrl(key, versionId)
	}

	getFromCache(key: string): string|undefined {
		this.logger.debug(`getFromCache '${key}'`)

		return this.storage.getItem(this.storageKeyFor(key))
	}

	async refresh(key: string): Promise<string|undefined> {
		this.logger.debug(`refresh '${key}'`)

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
		let etag: string|undefined
		let success = false
		// let versionId: string|undefined

		const oldCachedValue = this.getFromCache(key)
		const oldCachedEtagValue = this.getFromCache(`${key}-etag`)

		this.setCache(key, value)
		this.deleteCache(`${key}-etag`)

		if (this.setEnv === "socket") {
			const result = await this.socket.put(
				key,
				value,
				options,
			)
			etag = result.etag
			success = result.success
			// versionId = result.versionId
		}
		else {
			const result = await this.api.set(
				key,
				value,
				options,
			)
			etag = result && !isErrorResult(result) && result.etag
			success = (result && !isErrorResult(result) && result.success) || false
			// versionId = result && !isErrorResult(result) && result.versionId
		}

		if (success) {
			if (etag) {
				this.setCache(`${key}-etag`, etag)
			}
		}
		else {
			this.setCache(key, oldCachedValue)
			this.setCache(`${key}-etag`, oldCachedEtagValue)
		}

		return success
	}

	setCache(key: string, value: string): void {
		this.logger.debug(`setCache '${key}': '${value}'`)

		this.storage.setItem(this.storageKeyFor(key), value)
	}

	private async getFromUrl(key: string, versionId: string|undefined = undefined): Promise<string|undefined> {
		if (versionId) {
			this.logger.debug(`getFromUrl '${key}', versionId: '${versionId}'`)
		}
		else {
			this.logger.debug(`getFromUrl '${key}'`)
		}

		const url = this.urlFor(key, versionId),
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

	private storageKeyFor(key: string, versionId: string|undefined = undefined): string {
		return `${this.appKey}/${key}${(versionId && `-${versionId}`) || ""}`
	}

	private urlFor(key: string, versionId: string|undefined = undefined): string {
		return `${this.url}${key}${(versionId && `-${versionId}`) || ""}`
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
	customArgs?: { [key: string]: string|number }
}