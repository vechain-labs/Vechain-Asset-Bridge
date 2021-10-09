import Log4jsHelper from "../common/utils/helper/log4jsHelper";

export default class Environment{

    public logHelper:Log4jsHelper;
    public config:any;

    constructor(config:any){
        this.config = config;
        this.logHelper = (new Log4jsHelper({
            logLevel:this.config.logconfig.logLevel,
            logDirPath:this.config.logconfig.logDirPath,
            serveName:this.config.serveName
        }));
    }
}