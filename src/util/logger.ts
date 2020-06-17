export const DBLiveLoggerLevel = {
	debug: 0,
	error: 3,
	info: 1,
	none: 4,
	warn: 2,
} as const
export type DBLiveLoggerLevel = typeof DBLiveLoggerLevel[keyof typeof DBLiveLoggerLevel]

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
				console.error(`${this.name} ${this.levelToString(level).toUpperCase()}: ${message}`, ...optionalParams)
			}
			else {
				console.log(`${this.name} ${this.levelToString(level).toUpperCase()}: ${message}`, ...optionalParams)
			}
		}
	}

	private doLog(logLevel: DBLiveLoggerLevel): boolean {
		return logLevel >= this.logLevel
	}

	private levelToString(logLevel: DBLiveLoggerLevel): string {
		switch (logLevel) {
		case DBLiveLoggerLevel.debug:
			return "debug"
		case DBLiveLoggerLevel.error:
			return "error"
		case DBLiveLoggerLevel.info:
			return "info"
		case DBLiveLoggerLevel.none:
			return "none"
		case DBLiveLoggerLevel.warn:
			return "warn"
		}

		return ""
	}
}