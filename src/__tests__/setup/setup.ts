import { DBLiveLogger, DBLiveLoggerLevel } from "../../util/logger"

export default (): void => {
	DBLiveLogger.logLevel = DBLiveLoggerLevel.none
}