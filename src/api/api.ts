import { DBLiveErrorResult } from "../common/error.result"
import { DBLiveJsonResponse, DBLiveRequest, DBLiveRequestInit } from "../common/request"
import { DBLiveLogger } from "../util/logger"

export class DBLiveAPI
{
	private cookie?: string
	private readonly logger = new DBLiveLogger("DBLiveAPI")
	private readonly request = new DBLiveRequest()
	private url = "https://a.dblive.io/"

	constructor(
		private readonly appKey: string,
	) { }

	async init(): Promise<DBLiveAPIInitResult&{cookie?:string}|DBLiveErrorResult|undefined> {
		this.logger.debug("INIT started")

		const result = await this.post<DBLiveAPIInitResult>("init", {
			bodyJson: {
				appKey: this.appKey,
			},
		})

		this.logger.debug("INIT result:", result.json)

		if (result.json && (result.json as DBLiveAPIInitResult).apiDomain) {
			this.url = `https://${(result.json as DBLiveAPIInitResult).apiDomain}/`
		}

		const cookie = result.response && result.response.headers.get("set-cookie")
		this.cookie = cookie || undefined

		return {
			...result.json,
			cookie: this.cookie,
		}
	}

	async set(key: string, value: string, options: DBLiveAPISetOptions): Promise<DBLiveSetResult|DBLiveErrorResult|undefined> {
		this.logger.debug(`SET /keys '${key}'='${value}'`)

		const result = await this.put<DBLiveSetResult>("keys", {
			bodyJson: {
				appKey: this.appKey,
				body: value,
				"content-type": options.contentType,
				"custom-args": options.customArgs && JSON.stringify(options.customArgs),
				key,
			},
		})

		this.logger.debug(`SET /keys '${key}'='${value}' result:`, result)

		return result.json
	}

	private async post<T>(apiCall: string, params: DBLiveRequestInit = {}): Promise<DBLiveJsonResponse<T|DBLiveErrorResult>> {
		const initParams: DBLiveRequestInit = {
			...params,
			cache: "no-store",
			credentials: "include",
			keepalive: true,
		}

		if (this.cookie) {
			initParams.headers = initParams.headers || {};
			(initParams.headers as Record<string, string>)["Cookie"] = this.cookie
		}

		return await this.request.postJson<T|DBLiveErrorResult>(`${this.url}${apiCall}`, initParams)
	}
	
	private async put<T>(apiCall: string, params: DBLiveRequestInit = {}): Promise<DBLiveJsonResponse<T|DBLiveErrorResult>> {
		const initParams: DBLiveRequestInit = {
			...params,
			cache: "no-store",
			credentials: "include",
			keepalive: true,
		}

		if (this.cookie) {
			initParams.headers = initParams.headers || {};
			(initParams.headers as Record<string, string>)["Cookie"] = this.cookie
		}

		return await this.request.putJson<T|DBLiveErrorResult>(`${this.url}${apiCall}`, initParams)
	}
}

type DBLiveAPIInitResult = {
	apiDomain: string
	contentDomain: string
	setEnv?: "api"|"socket"
	socketDomain: string
}

type DBLiveSetResult = {
	etag?: string
	versionId?: string
}

export type DBLiveAPISetOptions = {
	contentType: string
	customArgs?: unknown
}