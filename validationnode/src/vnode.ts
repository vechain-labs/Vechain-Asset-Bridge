import schedule from "node-schedule";
import { BridgePackTask } from "./bridgePackTask";
import { BridgeSyncTask } from "./bridgeSyncTask";

export default class BridgeValidationNode {
    constructor(env:any){
        let taskIsBusy = false;
        this.env = env;
        this.config = env.config;

        const rule = new schedule.RecurrenceRule();
        rule.second = [0,5,10,15,20,25,30,35,40,45,50,55];
        const taskJob = schedule.scheduleJob(rule, async() =>{
            if(taskIsBusy == false){
                taskIsBusy = true;
                const syncTask = new BridgeSyncTask(this.env);
                const syncResult = await syncTask.taskJob();
                if(syncResult.error){
                    console.error(`Sync bridge data error: ${syncResult.error}`);
                }
                const packTask = new BridgePackTask(this.env);
                const packResult = await packTask.taskJob();
                if(packResult.error){
                    console.error(`Pack bridge data error: ${packResult.error}`);
                }
                taskIsBusy = false;
            }
        });
        taskJob.invoke();
    }

    private env:any;
    private config:any;
}
