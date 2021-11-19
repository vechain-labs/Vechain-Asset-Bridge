import path from "path";
import ActiveSupportServices from "./activeSupportService";
import Environment from "./environment";
import schedule = require("node-schedule");
import { SnapshootScanner } from "./snapshootScanner";
import { VeChainSwapTxsScanner } from "./vechainSwapTxsScanner";
import { EthereumSwapTxsScanner } from "./ethereumSwapTxsScanner";

class BridgeApiBackend{
    constructor(env:Environment){
        let taskIsBusy = false;

        const snapshootScanner = new SnapshootScanner(env);
        const scanVeChainScanner = new VeChainSwapTxsScanner(env);
        const scanEthereumScanner = new EthereumSwapTxsScanner(env);

        const rule = new schedule.RecurrenceRule();
        rule.second = [0,10,20,30,40,50];

        const taskJob = schedule.scheduleJob(rule, async() =>{
            if(taskIsBusy == false){
                taskIsBusy = true;

                const scanvechainResult = await scanVeChainScanner.run();
                if(scanvechainResult.error){
                    console.error(`ScanVeChain Error: ${scanvechainResult.error}`);
                    taskIsBusy = false;
                    return;
                }

                const scanethereumResult = await scanEthereumScanner.run();
                if(scanethereumResult.error){
                    console.error(`ScanEthereum Error: ${scanethereumResult.error}`);
                    taskIsBusy = false;
                    return;
                }

                const snapshootResult = await snapshootScanner.run();
                if(snapshootResult.error){
                    console.error(`Snapshoot Error: ${snapshootResult.error}`);
                    taskIsBusy = false;
                    return;
                }
                
                taskIsBusy = false;
            }
        });
        taskJob.invoke();
    }
    
}

const configPath = path.join(__dirname, "../config/config_api_bg.json");
let config = require(configPath);
config.serviceName = "Bridge Api Backend Service";

let env:any = new Environment(config);
export let environment = env;

(new ActiveSupportServices()).activieSupportServices().then(action =>{
    if(action.error != undefined){
        console.error("Support Active Faild: " + JSON.stringify(action.error));
        process.exit();
    }
    const backend = new BridgeApiBackend(environment);
    console.info(`Bridge Api Backend Actived Successful`);
});
