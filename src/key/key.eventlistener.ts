import { DBLiveCallback } from "../types/dblive.callback"

export class DBLiveKeyEventListener extends EventTarget
{
	private _isListening = true
	get isListening(): boolean {
		return this._isListening
	}
	set isListening(isListening: boolean) {
		if (isListening === this._isListening)
			return

		this._isListening = isListening

		this.dispatchEvent(new Event("isListening-changed"))
	}

	constructor(
		readonly action: string,
		readonly handler: DBLiveCallback<string|undefined>,
	) {
		super()
	}
}