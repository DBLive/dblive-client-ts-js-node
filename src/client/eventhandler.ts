import { v1 as uuidv1 } from "uuid"
import { DBLiveCallback } from "../types/dblive.callback"

export class DBLiveEventHandler<T>
{
	public readonly id = uuidv1()
	public isActive = true

	constructor(
		public readonly event: string,
		public readonly once: boolean,
		public readonly handler: DBLiveCallback<T>,
	) { }
}