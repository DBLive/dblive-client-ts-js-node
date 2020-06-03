export type DBLiveErrorResult = {
	code: string
	description: string
}

export const isErrorResult = (result: unknown): result is DBLiveErrorResult => {
	return result && !!(result as DBLiveErrorResult).code
}