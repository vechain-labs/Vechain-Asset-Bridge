import Environment from "../Api/environment";
import schedule = require("node-schedule");
import { BridgeSyncTask } from "./bridgeSyncTask";
import { BridgePackTask } from "./bridgePackTask";

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
            }
            
        });
    }

    private environment:any;
}