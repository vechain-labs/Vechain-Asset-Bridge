import Environment from "../Api/environment";
import schedule = require("node-schedule");
import { BridgeSyncTask } from "./bridgeSyncTask";
import { BridgePackTask } from "./bridgePackTask";
import { Framework } from "@vechain/connex-framework";
import path from "path";
import ActiveSupportServices from "./activeSupportService";

class BridgeValidationNode{
    constructor(environment:Environment){
        let taskIsBusy = false;
        this.environment = environment;

        const rule = new schedule.RecurrenceRule();
        rule.second = [0,10,20,30,40,50];

        const syncTask = new BridgeSyncTask(this.environment);
        const packTask = new BridgePackTask(this.environment);
        
        const taskJob = schedule.scheduleJob(rule, async() =>{
            if(taskIsBusy == false){
                taskIsBusy = true;

                const syncResult = await syncTask.taskJob();
                if(syncResult.error){
                    console.error(`Sync bridge data error: ${syncResult.error}`);
                }
                const needToPacking = await this.packRule();
                if(needToPacking){
                    const packResult = await packTask.taskJob();
                    if(packResult.error){
                        console.error(`Pack bridge data error: ${packResult.error}`);
                    }
                }
                taskIsBusy = false;
            }
        });
        taskJob.invoke();
    }

    private async packRule():Promise<boolean>{
        const bestBlock = await (this.environment.connex as Framework).thor.block().get();
        return bestBlock && bestBlock.number % 150 <= 3 ? true : false;
    }

    private environment:any;
}

const configPath = path.join(__dirname, "../../../config/config_node.json");
let config = require(configPath);
config.serviceName = "Bridge Node";

let env:any = new Environment(config);
env.entityPath = path.join(__dirname,"../common/model/entities/**.entity{.ts,.js}");
env.contractdir = path.join(__dirname,"../../../src/SmartContracts/contracts/");

export let environment = env;

(new ActiveSupportServices()).activieSupportServices().then(action =>{
    if(action.error != undefined){
        console.error("Support Active Faild: " + JSON.stringify(action.error));
        process.exit();
    }
    const node = new BridgeValidationNode(environment);
    console.info(`Bridge Node Actived Successful`);
});