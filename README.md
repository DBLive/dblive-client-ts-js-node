# DBLive
DBLive client for TS/JS/Node

DBLive is a service that allows devices to stay synchronized in real-time. Updates to data are instantly passed to all devices within a matter of ms, even at scale across regions.

## Development
This project is in initial development. No website or admin portal are available at this time. If you would like to use this library, please contact me at [dblive@mikerichards.tech](mailto:dblive@mikerichards.tech).

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
dbLive.get("hello", value => {
	console.log(`hello '${value}'`) // prints "hello 'world'"
})

// get and listen to key "hello"
const listener = dbLive.getAndListen("hello", value => {
	console.log(`hello '${value}'`) // prints "hello 'world'" immediately

	// this handler will be called every time "hello" changes until "listener.listening" is false
})

// can start/stop listener by changing "listening" on the listener
listener.listening = true|false

// can also set, get and listen to json objects
dbLive.set("hello-json", {
	"hello": "world"
})

// can also set, get and listen to json objects
dbLive.getJson("hello-json", value => {
	console.log(`hello '${value.hello}'`) // prints "hello 'world'"
})

const listener = dbLive.getJsonAndListen("hello-json", value => {
	console.log(`hello '${value.hello}'`) // prints "hello 'world'" immediately

	// this handler will be called every time "hello-json" changes until "listener.listening" is false
})

// can start/stop listener by changing "listening" on the listener
listener.listening = true|false
```

#### Methods
`set(key: string, value: string)`: Sets `key` to a string value.

`set(key: string, value: object)`: Sets `key` to an object value. The object can handle any property that can be serialized into JSON.

`get(key: string, callback: (value: string|undefined))`: Gets the current **string** value of `key`

`getJson<T>(key: string, callback: (value: T|undefined))`: Gets the current **object** value of `key`

`getAndListen(key: string, handler: (value: string|undefined)) => DBLiveKeyEventListener`: Gets the current **string** value of `key` returned immediately, and then listens for any updates to its value. Set the `.listening` property of the returned `DBLiveKeyEventListener` to **false** to stop listening.

`getJsonAndListen<T>(key: string, handler: (value: T|undefined)) => DBLiveKeyEventListener`: Gets the current **object** value of `key` returned immediately, and then listens for any updates to its value. Set the `.listening` property of the returned `DBLiveKeyEventListener` to **false** to stop listening.

#### Planned future functionality
  * `set` and `get` will be restricted based on appKey. Individual devices can be granted additional functionalitality via a *secret key* that can be stored securely in your backend system.
  * `lockAndSet`: Will grant a temporary lock on a key so no other device can change its value. This will help assure that setting the value will not override a `set` from another device.
  * `Numeric values`: Numbers will have additional functionality, such as incrementing and decrementing in a way that 2 devices can simultaneously do it.
  * `Service Agent Push Notifications`: We'll accept push tokens so we can update key data in the background.

## Installation

### NPM
Add the project as a dependency to your `package.json`

`npm i @dblive/client-js`
