import { DBLivePutResult } from "../types/putresult"

export const isSocketErrorResult = <T>(args: T|DBLiveSocketErrorResult): args is DBLiveSocketErrorResult => {
	return (args as DBLiveSocketErrorResult).errorCode !== undefined
}

export const isSocketRedirectResult = (args: DBLiveSocketGetResult|DBLiveSocketGetRedirectResult): args is DBLiveSocketGetRedirectResult => {
	return (args as DBLiveSocketGetRedirectResult).url !== undefined
}

export type KeyEventData = {
	action: "changed"|"deleted"
	contentEncoding?: string
	contentType: string
	customArgs?: { [id: string]: string|number }
	etag?: string
	key: string
	oldValue?: string
	value?: string
	versionId?: string
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

export type DBLiveSocketLockOptions = {
	timeout?: number
}

export type DBLiveSocketLockResult = {
	lockId?: string
}

export type DBLiveSocketLockAndPutOptions = {
	customArgs?: unknown
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