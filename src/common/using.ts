import { Disposable } from "./interfaces/disposable"

export async function using<T extends Disposable, K>(resource: T, func: (resource: T) => Promise<K|undefined>|K|undefined) {
	let result: K|undefined

	try {
		result = await func(resource)
	}
	finally {
		await resource.dispose()
	}

	return result
}