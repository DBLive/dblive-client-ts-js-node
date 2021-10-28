export enum DBLiveLoggerLevel {
	debug,
	info,
	warn,
	error,
	none,
}

export class DBLiveLogger
{
	static logLevel = DBLiveLoggerLevel.error

	private _logLevel?: DBLiveLoggerLevel

	constructor(
		private readonly name: string,
	) { }

	get logLevel(): DBLiveLoggerLevel {
		return this._logLevel || DBLiveLogger.logLevel
	}

	debug(message: string, ...optionalParams: any[]): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		this.commitLog(message, DBLiveLoggerLevel.debug, ...optionalParams)
	}

	info(message: string, ...optionalParams: any[]): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		this.commitLog(message, DBLiveLoggerLevel.info, ...optionalParams)
	}

	warn(message: string, ...optionalParams: any[]): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		this.commitLog(message, DBLiveLoggerLevel.warn, ...optionalParams)
	}

	error(message: string, ...optionalParams: any[]): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		this.commitLog(message, DBLiveLoggerLevel.error, ...optionalParams)
	}

	private commitLog(message: string, level: DBLiveLoggerLevel, ...optionalParams: any[]): void {
		if (this.doLog(level)) {
			if (level === DBLiveLoggerLevel.error) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				console.error(`${this.name}: ${message}`, ...optionalParams)
			}
			else if (level === DBLiveLoggerLevel.warn) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				console.warn(`${this.name}: ${message}`, ...optionalParams)
			}
			else if (level === DBLiveLoggerLevel.info) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				console.info(`${this.name}: ${message}`, ...optionalParams)
			}
			else if (level === DBLiveLoggerLevel.debug) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				console.debug(`${this.name}: ${message}`, ...optionalParams)
			}
			else {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				console.log(`${this.name} ${DBLiveLoggerLevel[level].toUpperCase()}: ${message}`, ...optionalParams)
			}
		}
	}

	private doLog(logLevel: DBLiveLoggerLevel): boolean {
		return logLevel >= this.logLevel
	}
}