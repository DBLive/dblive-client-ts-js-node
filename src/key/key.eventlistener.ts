import { Disposable } from "../common/interfaces/disposable"
import { DBLiveCallback } from "../types/dblive.callback"

export class DBLiveKeyEventListener implements Disposable
{
	private _listening = true

	private listeningChangedHandlers: ListeningChangedHandler[] = []

	constructor(
		readonly action: string,
		readonly handler: DBLiveCallback<DBLiveKeyEventHandlerArgs>,
	) { }

	get listening(): boolean {
		return this._listening
	}
	set listening(listening: boolean) {
		if (listening === this._listening)
			return

		this._listening = listening

		for (const handler of this.listeningChangedHandlers) {
			handler(listening)
		}
	}

	dispose(): void {
		this.listening = false
	}

	onListeningChanged(handler: ListeningChangedHandler): this {
		this.listeningChangedHandlers.push(handler)
		return this
	}
}

type ListeningChangedHandler = (listening: boolean) => unknown

export type DBLiveKeyEventHandlerArgs = {
	value: string|undefined
	customArgs?: { [key: string]: string|number }
}