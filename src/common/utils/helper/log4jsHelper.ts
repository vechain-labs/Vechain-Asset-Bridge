import log4js = require('log4js');
import path = require('path');

export default class Log4jsHelper{

    constructor(config:ILog4jsConfig){
        this.config = config;
        this.config.serveName = (this.config.serveName != undefined && this.config.serveName != "") ? this.config.serveName : "serve"
        this.config.logDirPath = (this.config.logDirPath != undefined && this.config.logDirPath != "") ? this.config.logDirPath : path.join(process.cwd(),"logs")
        log4js.addLayout('json', function (config) {
            return function (logEvent) { return JSON.stringify(logEvent); }
        });
        log4js.configure(this._initConfig(this.config));
        const logger = log4js.getLogger('default');
        console.trace = logger.trace.bind(logger);
        console.debug = logger.debug.bind(logger);
        console.info = logger.info.bind(logger);
        console.warn = logger.warn.bind(logger);
        console.error = logger.error.bind(logger);
    }

    public log(level: LogHelperLevel, message: string, ...args: any[]) {
        let log = log4js.getLogger("default");
        let lgoData: any = {
            time: (new Date()).toISOString(),
            level: level,
            catalog: this.config.serveName,
            app_name: this.config.serveName,
            msg: message
        }
        if (args) {
            if (args[0] && typeof (args[0] instanceof TypeError)) {
                let error = args[0]
                lgoData.err = {
                    message: error.message,
                    stack: error.stack
                }
            }
        }

        switch (level) {
            case LogHelperLevel.TRACE: {
                log.trace(lgoData);
                break;
            }
            case LogHelperLevel.DEBUG: {
                log.debug(lgoData);
                break;
            }
            case LogHelperLevel.INFO: {
                log.info(lgoData);
                break;
            }
            case LogHelperLevel.WARN: {
                log.warn(lgoData);
                break;
            }
            case LogHelperLevel.ERROR: {
                log.error(lgoData);
                break;
            }
        }
    }

    public trace(message?: string, ...args: any[]){
        this.log(LogHelperLevel.TRACE,message || "",args);
    }

    public debug(message?: string, ...args: any[]){
        this.log(LogHelperLevel.DEBUG,message || "",args);
    }

    public info(message?: string, ...args: any[]){
        this.log(LogHelperLevel.INFO,message || "",args);
    }

    public warn(message?: string, ...args: any[]){
        this.log(LogHelperLevel.WARN,message || "",args);
    }

    public error(message?: string, ...args: any[]){
        this.log(LogHelperLevel.ERROR,message || "",args);
    }

    private _initConfig(config:ILog4jsConfig): log4js.Configuration {
        let logDir = this.config.logDirPath;
        let log4jsConfig: log4js.Configuration = {
            pm2: true,
            appenders: {
                console: {
                    type: "console"
                },
                file: {
                    type: "file",
                    filename: path.join(logDir, this.config.serveName + ".log"),
                    maxLogSize: 104857600,
                    backups: 100,
                    layout: { type: 'json' }
                },
                healthfile: {
                    type: "file",
                    maxLogSize: 64,
                    backups:1,
                    filename: path.join(logDir, 'health.log'),
                    layout: { type: 'json' }
                },
                http: {
                    type: 'dateFile',
                    filename: path.join(logDir, "access.log"),
                    pattern: '-yyyy-MM-dd',
                    alwaysIncludePattern: true,
                },
                error: {
                    type: 'file',
                    filename: path.join(logDir, "error.log"),
                    maxLogSize: 10485760,
                    backups: 100,
                    layout: { type: 'json' }
                }
            },
            categories: {
                default: {
                    appenders: ["file", "console", "error"],
                    level: "all"
                },
                http: {
                    appenders: ["console", "error"],
                    level: "all"
                },
                health: {
                    appenders: ["healthfile"],
                    level: "info"
                }
            }
        }
        return log4jsConfig;
    }

    private config:ILog4jsConfig;
}

export interface ILog4jsConfig{
    logLevel:LogHelperLevel;
    logDirPath:string;
    serveName:string;
}

export enum LogHelperLevel
{
    TRACE = "trace",
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error"
}