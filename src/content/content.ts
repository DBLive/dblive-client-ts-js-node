import { DBLiveRequest } from "../common/request"
import { DBLiveLogger } from "../util/logger"

export class DBLiveContent
{
	private readonly logger = new DBLiveLogger("DBLiveContent")
	private readonly request = new DBLiveRequest()

	constructor(
		private readonly url: string,
	) { }

	deleteCache(key: string): void {
		this.logger.debug(`delete '${key}'`)

		sessionStorage.removeItem(this.urlFor(key))
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
			),
			result = await response.text()

		if (response.status === 200) {
			this.logger.debug(`New Etag: ${response.headers.get("Etag") ?? "None"}`)
			sessionStorage.setItem(url, result)
		}
		else if (response.status === 304) {
			this.logger.debug("304 - Returning cached version")
		}
		else if (response.status === 404 || response.status === 403) {
			this.logger.debug("Key not found")
		}
		else {
			this.logger.warn(`Unhandled response status code ${response.status}`)
		}

		return result
	}

	getFromCache(key: string): string|undefined {
		this.logger.debug(`getFromCache '${key}'`)

		const url = this.urlFor(key)

		return sessionStorage.getItem(url)
	}

	setCache(key: string, value: string): void {
		this.logger.debug(`setCache '${key}': '${value}'`)

		const url = this.urlFor(key)

		sessionStorage.setItem(url, value)
	}

	private urlFor(key: string, version: string|undefined = undefined): string {
		return `${this.url}${key}${version && `-${version}`}`
	}
}