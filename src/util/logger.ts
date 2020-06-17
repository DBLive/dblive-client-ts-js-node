export const DBLiveLoggerLevel = {
	debug: "debug", // 0
	error: "error", // 3
	info: "info", // 1
	none: "none", // 4
	warn: "warn", // 2
} as const
export type DBLiveLoggerLevel = typeof DBLiveLoggerLevel[keyof typeof DBLiveLoggerLevel]

export class DBLiveLogger
{
	static logLevel: DBLiveLoggerLevel = DBLiveLoggerLevel.error

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
				console.error(`${this.name} ${level.toUpperCase()}: ${message}`, ...optionalParams)
			}
			else {
				console.log(`${this.name} ${level.toUpperCase()}: ${message}`, ...optionalParams)
			}
		}
	}

	private doLog(logLevel: DBLiveLoggerLevel): boolean {
		return this.levelValue(logLevel) >= this.levelValue(this.logLevel)
	}

	private levelValue(logLevel: DBLiveLoggerLevel): number {
		switch (logLevel) {
		case DBLiveLoggerLevel.debug:
			return 0
		case DBLiveLoggerLevel.error:
			return 3
		case DBLiveLoggerLevel.info:
			return 1
		case DBLiveLoggerLevel.none:
			return 4
		case DBLiveLoggerLevel.warn:
			return 2
		}
	}
}