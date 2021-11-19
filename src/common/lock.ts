import { v1 as uuidv1 } from "uuid"
import DBLiveClient from ".."
import { Disposable } from "./interfaces/disposable"

export class Lock implements Disposable
{
	isLocked = false

	private readonly id = uuidv1()

	constructor(
		private readonly client: DBLiveClient,
	) { }

	lock(): this {
		this.isLocked = true
		return this
	}

	unlock(): this {
		this.isLocked = false
		this.client.handleEvent(`lock${this.id}:unlocked`)
		return this
	}

	async acquireWhenAvailable(): Promise<this> {
		if (this.isLocked) {
			return await new Promise<this>(resolve =>
				this.onUnlock(async() => resolve(await this.acquireWhenAvailable())))
		}

		return this.lock()
	}

	dispose(): void {
		this.unlock()
	}

	private onUnlock(onUnlock: () => unknown): void {
		this.client.once(`lock${this.id}:unlocked`, () => onUnlock())
	}
}