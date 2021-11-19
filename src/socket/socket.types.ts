import { DBLivePutResult } from "../types/putresult"

export const isSocketErrorResult = <T>(args: T|DBLiveSocketErrorResult): args is DBLiveSocketErrorResult => {
	return (args as DBLiveSocketErrorResult).errorCode !== undefined
}

export const isSocketRedirectResult = (args: DBLiveSocketGetResult|DBLiveSocketGetRedirectResult): args is DBLiveSocketGetRedirectResult => {
	return (args as DBLiveSocketGetRedirectResult).url !== undefined
}

export const isSocketKeyChangedData = (args: DBLiveSocketKeyChangedData|DBLiveSocketKeyDeletedData): args is DBLiveSocketKeyChangedData => {
	return (args as DBLiveSocketKeyChangedData).action === "changed"
}

export const isSocketKeyDeletedData = (args: DBLiveSocketKeyChangedData|DBLiveSocketKeyDeletedData): args is DBLiveSocketKeyDeletedData => {
	return (args as DBLiveSocketKeyDeletedData).action === "deleted"
}

export type DBLiveSocketErrorResult = {
	errorCode: string
	errorDescription: string
	errorMessage?: string
}

export type DBLiveSocketGetResult = {
	contentType?: string
	etag?: string
	value?: string
}

export type DBLiveSocketGetRedirectResult = {
	url?: string
}

export type DBLiveSocketKeyChangedData = {
	action: "changed"
	contentEncoding?: string
	contentType: string
	customArgs?: Record<string, string|number>
	etag?: string
	key: string
	value?: string
	versionId?: string
}

export type DBLiveSocketKeyDeletedData = {
	action: "deleted"
	customArgs?: Record<string, string|number>
	key: string
}

export type DBLiveSocketLockOptions = {
	timeout?: number
}

export type DBLiveSocketLockResult = {
	lockId?: string
}

export type DBLiveSocketLockAndPutOptions = {
	customArgs?: Record<string, string|number>
}

export type DBLiveSocketLockAndPutHandlerParams = {
	contentType?: string
	value?: string
}

export type DBLiveSocketLockAndPutResult = DBLivePutResult

export type DBLiveSocketMetaResult = {
	etag?: string
}

export type DBLiveSocketPutOptions = {
	contentType: string
	customArgs?: unknown
	lockId?: string
}

export type DBLiveSocketStopWatchingResult = Record<never, never>

export type DBLiveSocketUnlockResult = {
	success: boolean
}

export type DBLiveSocketWatchResult = Record<never, never>