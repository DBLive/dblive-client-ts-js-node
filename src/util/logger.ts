export enum DBLiveLoggerLevel
{
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
	get logLevel(): DBLiveLoggerLevel {
		return this._logLevel || DBLiveLogger.logLevel
	}

	constructor(
		private readonly name: string,
	) { }

	debug(message: string, ...optionalParams: any[]): void {
		this.commitLog(message, DBLiveLoggerLevel.debug, ...optionalParams)
	}

	info(message: string, ...optionalParams: any[]): void {
		this.commitLog(message, DBLiveLoggerLevel.info, ...optionalParams)
	}

	warn(message: string, ...optionalParams: any[]): void {
		this.commitLog(message, DBLiveLoggerLevel.warn, ...optionalParams)
	}

	error(message: string, ...optionalParams: any[]): void {
		this.commitLog(message, DBLiveLoggerLevel.error, ...optionalParams)
	}

	private commitLog(message: string, level: DBLiveLoggerLevel, ...optionalParams: any[]): void {
		if (this.doLog(level)) {
			if (level === DBLiveLoggerLevel.error) {
				console.error(`${this.name} ${DBLiveLoggerLevel[level].toUpperCase()}: ${message}`, ...optionalParams)
			}
			else {
				console.log(`${this.name} ${DBLiveLoggerLevel[level].toUpperCase()}: ${message}`, ...optionalParams)
			}
		}
	}

	private doLog(logLevel: DBLiveLoggerLevel): boolean {
		return logLevel >= this.logLevel
	}
}