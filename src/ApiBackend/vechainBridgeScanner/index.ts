import Schedule from "node-schedule";
import path from "path";
import fs from 'fs';
import { VeChainBridgeSnapshootScan } from "./snapshootScan";

class VeChainBridgeScanner {
    constructor(env:any){
        const configPath = path.join(__dirname,"../config/config.json");

        if(!fs.existsSync(configPath)){
            console.info(`can't load config ${configPath}`);
            throw Error(`can't load config ${configPath}`);
        }

        this.initConfig(configPath);
        
        this.vechainBridgeScannerJob = Schedule.scheduleJob(this.config.taskRule, async() =>{
            //const scanSnapshootResult = (new VeChainBridgeSnapshootScan()).run
        });
    }

    private async initConfig(configPath:string){
        this.config = require(configPath);
        this.config.cache = {};
    }

    private vechainBridgeScannerJob!:Schedule.Job;
    private config:any;
}