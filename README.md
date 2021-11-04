# DBLive
*DBLive* client for TS/JS/Node

### What is it?
*DBLive* is a service that allows devices to synchronize data in real-time. Updates to data are instantly passed to all devices within a matter of ms, even at scale across regions.

### Currently in development
This project is currently in development. No website or admin portal are available at this time. If you have any questions or would like to use or play with this library, please contact me at [dblive@mikerichards.tech](mailto:dblive@mikerichards.tech).

## Example
See this client in action with a tic-tac-toe web app. This is obviously **not** a full-featured Tic-Tac-Toe game; you can play both X and O from the same device, or separate, and other people might be playing the game at the same time. The point of the example is to demonstrate how data stays synchronized between devices using *DBLive*, and how it could work for your project.

[https://tictactoe.dblive.io](https://tictactoe.dblive.io)

[https://github.com/DBLive/dblive-web-example-tictactoe-ts](https://github.com/DBLive/dblive-web-example-tictactoe-ts)

## Usage

### Typescript/JS
```typescript
import { DBLiveClient } from "@dblive/client-js" 
// or
const DBLiveClient = require("@dblive/client-js")

const dbLive = new DBLiveClient("+++ appKey +++")

// set key "hello" to "world"
await dbLive.set("hello", "world")

// get key "hello"
const value = await dbLive.get("hello")

// prints "hello 'world'"
console.log(`hello '${value}'`) 

// get and listen to key "hello"
const listener = dbLive.getAndListen("hello", value => {
	console.log(`hello '${value}'`) // prints "hello 'world'" immediately

	// this handler will be called every time "hello" changes until "listener.listening" is false
})

// can start/stop listener by changing "listening" on the listener
listener.listening = true|false

// can also set, get and listen to json objects
await dbLive.set("hello-json", {
	"hello": "world"
})

// can also set, get and listen to json objects
const value = dbLive.getJson("hello-json")

// prints "hello 'world'"
console.log(`hello '${value.hello}'`) 

const listener = dbLive.getJsonAndListen("hello-json", value => {
	console.log(`hello '${value.hello}'`) // prints "hello 'world'" immediately

	// this handler will be called every time "hello-json" changes until "listener.listening" is false
})

// can start/stop listener by changing "listening" on the listener
listener.listening = true|false

// lock a key to avoid conflicts between devices
const lock = await dbLive.lock("hello-lock")

// In order to set values while you have the lock, you'll need to pass it in.
await dbLive.set("hello-lock", "value-within-lock", {
	lock: lock
})

// Then you can unlock the key
await lock.unlock()

// Use the "using" helper to unlock a key even if there's an exception in your code.
// No need to worry about explicity calling '.unlock()'
using(await dbLive.lock("hello-lock"), async(lock) => {
	await dbLive.set("hello-lock", "value-within-lock", {
		lock: lock
	})
})

// OR, you could use the helper method to help avoid conflicts between devices
await dbLive.lockAndSet("hello-lock", (currentValue: string|undefined): string => {
	const numericValue = (currentValue && parseInt(currentValue)) || 0

	return `${numericValue + 1}`
})
```

#### Methods
`async set(key: string, value: string)`: Sets `key` to a string value.

`async set<T>(key: string, value: T)`: Sets `key` to an object value. The object can handle any property that can be serialized into JSON.

`async get(key: string): Promise<string|undefined>`: Gets the current **string** value of `key`

`async getJson<T>(key: string): Promise<T|undefined>`: Gets the current **object** value of `key`

`getAndListen(key: string, handler: (value: string|undefined)): DBLiveKeyEventListener`: Gets the current **string** value of `key` returned immediately, and then listens for any updates to its value. Set the `.listening` property of the returned `DBLiveKeyEventListener` to **false** to stop listening.

`getJsonAndListen<T>(key: string, handler: (value: T|undefined)): DBLiveKeyEventListener`: Gets the current **object** value of `key` returned immediately, and then listens for any updates to its value. Set the `.listening` property of the returned `DBLiveKeyEventListener` to **false** to stop listening.

`async lock(key: string): Promise<DBLiveClientLock>`: Acquires a lock on a key. No other clients can change the value of the key while you have the lock. The lock will timeout, however you can configure what timeout you need. By default, the timeout is 1000ms or 1s. To unlock, call `.unlock()` on the returned **DBLiveClientLock**.

`async lockAndSet(key: string, handler: (currentValue: T|string|undefined) => Promise<T|string>|T|string): Promise<boolean>`: A helper method for locking, setting a key's value and then unlocking. Use this to help avoid conflicts between devices.

#### Planned future functionality
  * `set` and `get` will have the ability to restricted per device. Individual devices can be granted additional functionalitality via a *secret key* that can be stored securely in your backend.
  * `Numeric values`: Numbers will have additional functionality, such as incrementing and decrementing in a way that 2 devices can simultaneously do it.
  * `Service Agent Push Notifications`: We'll accept push tokens so we can update key data in the background.

## Installation

### NPM
Add the project as a dependency to your `package.json`

`npm i @dblive/client-js`
