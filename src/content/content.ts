import { DBLiveAPI } from "../api/api"
import { isErrorResult } from "../common/error.result"
import { DBLiveRequest, DBLiveRequestInit } from "../common/request"
import { DBLiveSocketManager } from "../socket/socket.manager"
import { isSocketErrorResult, isSocketRedirectResult } from "../socket/socket.types"
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
		private readonly sockets?: DBLiveSocketManager,
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

	async get<T>(key: string, versionId: string|undefined = undefined): Promise<DBLiveContentGetResult<T>|undefined> {
		if (versionId) {
			this.logger.debug(`get '${key}', versionId: '${versionId}'`)
		}
		else {
			this.logger.debug(`get '${key}'`)
		}
		
		let rawResult: DBLiveContentGetRawResult|undefined

		if (!versionId && this.sockets.isConnected) {
			rawResult = await this.getFromSocket(key)
		}
		else {
			rawResult = await this.getFromUrl(key, versionId)
		}

		if (!rawResult)
			return undefined

		return this.parseValueFromContentType<T>(rawResult.value, rawResult.contentType)
	}

	getFromCache<T>(key: string): DBLiveContentGetResult<T>|undefined {
		this.logger.debug(`getFromCache '${key}'`)

		return this.parseValueFromContentType(
			this.getValueFromCache(key),
			this.getContentTypeFromCache(key),
		)
	}

	getValueFromCache(key: string): string|undefined {
		this.logger.debug(`getValueFromCache '${key}'`)

		return this.storage.getItem(this.storageKeyFor(key))
	}

	async refresh<T>(key: string): Promise<DBLiveContentGetResult<T>|undefined> {
		this.logger.debug(`refresh '${key}'`)

		const clientEtag = this.getEtagFromCache(key)
		
		if (!clientEtag) {
			this.logger.debug("refresh invalid - nothing stored locally")
			return await this.get(key)
		}

		const serverMeta = await this.sockets.meta(key),
			serverEtag = !isSocketErrorResult(serverMeta) && serverMeta.etag
		
		if (clientEtag === serverEtag) {
			this.logger.debug("refresh complete - values hasn't changed")

			return this.getFromCache(key)
		}

		this.logger.debug(`refresh needs to update from server. serverEtag: '${serverEtag}', clientEtag: '${clientEtag}'`)

		return await this.get(key)
	}

	async set<T>(key: string, value: T|string, contentType: DBLiveContentType, options: DBLiveContentSetOptions): Promise<boolean> {
		let etag: string|undefined
		let success = false

		const cachedValue = this.getValueFromCache(key)
		const cachedEtag = this.getEtagFromCache(key)
		const cachedContentType = this.getContentTypeFromCache(key)

		if (typeof(value) !== "string") {
			value = JSON.stringify(value)
		}

		this.setCache(key, value)
		this.setContentTypeCache(key, contentType)
		this.deleteEtagCache(key)

		let doSetOnApi = true

		if (this.setEnv === "socket" && this.sockets.isConnected) {
			const result = await this.sockets.put(
				key,
				value,
				{
					contentType,
					customArgs: options.customArgs,
					lockId: options.lockId,
				},
			)

			if (isSocketErrorResult(result)) {
				this.logger.error(`Error setting '${key}', socket returned error:`, result)
			}
			else {
				etag = result.etag
				success = result.success
				doSetOnApi = false
			}
		}
		
		if (doSetOnApi) {
			const result = await this.api.set(
				key,
				value,
				{
					contentType,
					customArgs: options.customArgs,
					lockId: options.lockId,
				},
			)
			etag = result && !isErrorResult(result) && result.etag
			success = (result && !isErrorResult(result) && result.success) || false
		}

		if (success) {
			if (etag) {
				this.setEtagCache(key, etag)
			}
		}
		else {
			this.setCache(key, cachedValue)
			this.setEtagCache(key, cachedEtag)
			this.setContentTypeCache(key, cachedContentType)
		}

		return success
	}

	private deleteContentTypeCache(key: string): void {
		this.deleteCache(`${key}-contenttype`)
	}

	private deleteEtagCache(key: string): void {
		this.deleteCache(`${key}-etag`)
	}

	private getContentTypeFromCache(key: string): string|undefined {
		return this.getValueFromCache(`${key}-contenttype`)
	}

	private getEtagFromCache(key: string): string|undefined {
		return this.getValueFromCache(`${key}-etag`)
	}

	private async getFromSocket(key: string): Promise<DBLiveContentGetRawResult|undefined> {
		this.logger.debug(`getFromSocket '${key}'`)

		const result = await this.sockets.get(key)

		if (isSocketErrorResult(result)) {
			this.logger.warn(`Error getting key '${key}' from socket. result:`, result)
			return await this.getFromUrl(key)
		}

		if (isSocketRedirectResult(result)) {
			this.logger.debug(`getFromSocket redirect result: ${result.url}`)
			return await this.getFromUrl(key)
		}

		if (result.value) {
			this.logger.debug("getFromSocket result")
			this.setCache(key, result.value)

			if (result.etag) {
				this.logger.debug(`getFromSocket new etag: ${result.etag}`)
				this.setEtagCache(key, result.etag)
			}

			if (result.contentType) {
				this.logger.debug(`getFromSocket new content type: ${result.contentType}`)
				this.setContentTypeCache(key, result.contentType)
			}
		}

		return result.value ? {
			contentType: result.contentType,
			value: result.value,
		} : undefined
	}

	private async getFromUrl(key: string, versionId: string|undefined = undefined): Promise<DBLiveContentGetRawResult|undefined> {
		if (versionId) {
			this.logger.debug(`getFromUrl '${key}', versionId: '${versionId}'`)
		}
		else {
			this.logger.debug(`getFromUrl '${key}'`)
		}

		const url = this.urlFor(key, versionId),
			cachedValue = this.getValueFromCache(key),
			etag = this.getEtagFromCache(key),
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
		
		let value = await response.text()
		const contentType = response.headers.get("content-type") || response.headers.get("Content-Type") || ""

		if (response.status === 200) {
			this.logger.debug("getFromUrl 200 response")
			this.setCache(key, value)

			const newEtag = response.headers.get("etag")
			if (newEtag) {
				this.logger.debug(`getFromUrl new etag: ${newEtag}`)
				this.setEtagCache(key, newEtag)
			}
		}
		else if (response.status === 304) {
			this.logger.debug("getFromUrl 304 - returning cached version")

			if (value && value.length) {
				this.setCache(key, value)
			}
			else {
				value = cachedValue
			}
		}
		else if (response.status === 404 || response.status === 403) {
			this.logger.debug(`getFromUrl ${response.status} - key not found`)
			value = undefined
		}
		else {
			this.logger.warn(`getFromUrl unhandled response status code ${response.status}`)
			value = undefined
		}

		return value ? {
			contentType,
			value,
		} : undefined
	}

	private parseValueFromContentType<T>(value: string|undefined, contentType: string|undefined): DBLiveContentGetResult<T>|undefined {
		if (!value)
			return undefined

		const result: DBLiveContentGetResult<T> = {
			contentType: DBLiveContentType.string,
			value,
		}
		
		const contentTypeValueSplit = (contentType && contentType.split(";")) || []

		for (const contentTypeValue of contentTypeValueSplit) {
			if (contentTypeValue.trim().toLowerCase() === DBLiveContentType.json) {
				try {
					const jsonValue = JSON.parse(value) as T
					result.value = jsonValue
					result.contentType = DBLiveContentType.json
				}
				catch(err) {
					this.logger.warn(`Could not json parse value. contentType: '${contentType}', value: '${value}'`, err)
					result.contentType = DBLiveContentType.string
				}

				break
			}
		}
	
		return result
	}

	private setCache(key: string, value: string): void {
		this.logger.debug(`setCache '${key}': '${value}'`)

		this.storage.setItem(this.storageKeyFor(key), value)
	}

	private setContentTypeCache(key: string, contentType: string): void {
		this.setCache(`${key}-contenttype`, contentType)
	}

	private setEtagCache(key: string, value: string): void {
		this.setCache(`${key}-etag`, value)
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

type DBLiveContentGetResult<T> = {
	contentType: DBLiveContentType
	value: T|string
}

type DBLiveContentGetRawResult = {
	contentType?: string
	value: string
}

type DBLiveContentSetOptions = {
	customArgs?: { [key: string]: string|number }
	lockId?: string
}

export enum DBLiveContentType {
	string = "text/plain",
	json = "application/json",
}