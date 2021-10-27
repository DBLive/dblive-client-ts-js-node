import { DBLiveLogger } from "../util/logger"

export class DBLiveRequest
{
	private readonly logger = new DBLiveLogger("DBLiveRequest")

	async delete(url: string, params: DBLiveRequestInit = {}): Promise<Response|undefined> {
		return await this.request(url, {
			...params,
			method: "DELETE",
		})
	}

	async deleteJson<T>(url: string, params: DBLiveRequestInit = {}) : Promise<DBLiveJsonResponse<T>> {
		return await this.requestJson(url, {
			...params,
			method: "DELETE",
		})
	}
	
	async get(url: string, params: DBLiveRequestInit = {}): Promise<Response|undefined> {
		return await this.request(url, {
			...params,
			method: "GET",
		})
	}

	async getJson<T>(url: string, params: DBLiveRequestInit = {}) : Promise<DBLiveJsonResponse<T>> {
		return await this.requestJson(url, {
			...params,
			method: "GET",
		})
	}

	async post(url: string, params: DBLiveRequestInit = {}): Promise<Response|undefined> {
		return await this.request(url, {
			...params,
			method: "POST",
		})
	}

	async postJson<T>(url: string, params: DBLiveRequestInit = {}) : Promise<DBLiveJsonResponse<T>> {
		return await this.requestJson(url, {
			...params,
			method: "POST",
		})
	}

	async put(url: string, params: DBLiveRequestInit = {}): Promise<Response|undefined> {
		return await this.request(url, {
			...params,
			method: "PUT",
		})
	}

	async putJson<T>(url: string, params: DBLiveRequestInit = {}) : Promise<DBLiveJsonResponse<T>> {
		return await this.requestJson(url, {
			...params,
			method: "PUT",
		})
	}

	private async request(url: string, params: DBLiveRequestInit = {}): Promise<Response|undefined> {
		params.method = params.method || "GET"

		try {
			if (params.bodyJson) {
				params.headers = params.headers || {};
				(params.headers as Record<string, string>)["Content-Type"] = "application/json"
				params.body = JSON.stringify(params.bodyJson)
				delete params.bodyJson
			}

			this.logger.debug(`${params.method} ${url}:`, params)

			const response = await fetch(url, {
				...params,
				cache: "no-cache",
			})

			this.logger.debug(`${url} responded with status code: ${response.status}`)

			return response
		}
		catch(err) {
			this.logger.error(`ERROR making '${params.method || "GET"}' request to '${url}':`, err)
			return undefined
		}
	}

	private async requestJson<T>(url: string, params: DBLiveRequestInit = {}): Promise<DBLiveJsonResponse<T>> {
		const response = await this.request(url, params)

		try {
			return {
				json: response && await response.json() as T,
				response,
			}
		}
		catch(err) {
			this.logger.error(`ERROR parsing json from ${url}:`, err)

			return {
				response,
			}
		}
	}
}

export type DBLiveRequestInit = RequestInit & {
	bodyJson?: unknown
}

export type DBLiveJsonResponse<T> = {
	json?: T
	response?: Response
}