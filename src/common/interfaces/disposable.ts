export interface Disposable {
	dispose(): Promise<unknown>|unknown
}