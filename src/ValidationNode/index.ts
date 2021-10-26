import Environment from "../Api/environment";
import schedule = require("node-schedule");

class BridgeValidationNode{
    constructor(env:Environment){
        let taskIsBusy = false;

        const rule = new schedule.RecurrenceRule();
        rule.second = [0,10,20,30,40,50];

        const taskJob = schedule.scheduleJob(rule, async() =>{

        });
    }
}