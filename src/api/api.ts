import { DBLiveErrorResult } from "../common/error.result"
import { DBLiveJsonResponse, DBLiveRequest, DBLiveRequestInit } from "../common/request"
import { DBLiveLogger } from "../util/logger"

export class DBLiveAPI
{
	private readonly logger = new DBLiveLogger("DBLiveAPI")
	private readonly request = new DBLiveRequest()
	private url = "https://a.dblive.io/"

	constructor(
		private readonly appKey: string,
	) { }

	async init(): Promise<DBLiveAPIInitResult&{cookie:string}|DBLiveErrorResult|undefined> {
		this.logger.debug("INIT started")

		const result = await this.post<DBLiveAPIInitResult>("init", {
			bodyJson: {
				appKey: this.appKey,
			},
		})

		if (!result) {
			this.logger.warn("INIT errored out")
			return undefined
		}

		this.logger.debug("INIT result:", result.json)

		if (result.json && (result.json as DBLiveAPIInitResult).apiDomain) {
			this.url = `https://${(result.json as DBLiveAPIInitResult).apiDomain}/`
		}

		return {
			...result.json,
			cookie: result.response.headers.get("set-cookie"),
		}
	}

	async set(key: string, value: string, contentType = "text/plain"): Promise<DBLiveSetResult|DBLiveErrorResult|undefined> {
		this.logger.debug(`SET /keys '${key}'='${value}'`)

		const result = await this.put<DBLiveSetResult>("keys", {
			bodyJson: {
				appKey: this.appKey,
				body: value,
				"content-type": contentType,
				key,
			},
		})

		this.logger.debug(`SET /keys '${key}'='${value}' result:`, result)

		return result.json
	}

	private async post<T>(apiCall: string, params: DBLiveRequestInit = {}): Promise<DBLiveJsonResponse<T|DBLiveErrorResult>> {
		return await this.request.postJson<T|DBLiveErrorResult>(`${this.url}${apiCall}`, {
			...params,
			cache: "no-store",
			credentials: "include",
			keepalive: true,
		})
	}
	
	private async put<T>(apiCall: string, params: DBLiveRequestInit = {}): Promise<DBLiveJsonResponse<T|DBLiveErrorResult>> {
		return await this.request.putJson<T|DBLiveErrorResult>(`${this.url}${apiCall}`, {
			...params,
			cache: "no-store",
			credentials: "include",
			keepalive: true,
		})
	}
}

type DBLiveAPIInitResult = {
	apiDomain: string
	contentDomain: string
	setEnv?: "api"|"socket"
	socketDomain: string
}

type DBLiveSetResult = {
	versionId?: string
}