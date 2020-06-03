import { DBLiveRequest } from "../common/request"
import { DBLiveLogger } from "../util/logger"

export class DBLiveContent
{
	private readonly logger = new DBLiveLogger("DBLiveContent")
	private readonly storage: DBLiveContentCacheStorage = global.sessionStorage || new DBLiveContentLocalCacheStorage()
	private readonly request = new DBLiveRequest()

	constructor(
		private readonly url: string,
	) { }

	deleteCache(key: string): void {
		this.logger.debug(`delete '${key}'`)

		this.storage.removeItem(this.urlFor(key))
	}

	async get(key: string, version: string|undefined = undefined): Promise<string|undefined> {
		if (version) {
			this.logger.debug(`get '${key}', version: '${version}'`)
		}
		else {
			this.logger.debug(`get '${key}'`)
		}

		const url = this.urlFor(key, version),
			response: Response = await this.request.get(
				url,
				{
					cache: "no-cache",
					keepalive: true,
				},
			)
		
		let result = await response.text()

		if (response.status === 200) {
			this.logger.debug(`New Etag: ${response.headers.get("Etag") ?? "None"}`)
			this.storage.setItem(url, result)
		}
		else if (response.status === 304) {
			this.logger.debug("304 - Returning cached version")
		}
		else if (response.status === 404 || response.status === 403) {
			this.logger.debug("Key not found")
			result = undefined
		}
		else {
			this.logger.warn(`Unhandled response status code ${response.status}`)
			result = undefined
		}

		return result
	}

	getFromCache(key: string): string|undefined {
		this.logger.debug(`getFromCache '${key}'`)

		const url = this.urlFor(key)

		return this.storage.getItem(url)
	}

	setCache(key: string, value: string): void {
		this.logger.debug(`setCache '${key}': '${value}'`)

		const url = this.urlFor(key)

		this.storage.setItem(url, value)
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

	get length(): number {
		return Object.keys(this.items).length
	}

	private items: { [name: string]: unknown  } = {}

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