import { ActionResult } from "../common/utils/components/actionResult";
import { BridgeLockProcess } from "./bridgeLockProess";
import { BridgeSnapshootProcess } from "./bridgeSnapshootProcess";

export class BridgePackTask{

    constructor(env:any){
        this.env = env;
    }

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();

        console.info(`begin bridge lock process`);
        let lockProcess = new BridgeLockProcess(this.env);
        const lockProcessResult = await lockProcess.run();
        if(lockProcessResult.error != undefined){
            result.error = lockProcessResult.error;
            return result;
        }
        console.info(`end bridge lock process`);

        console.info(`begin build new snapshoot`);
        let snapshootProcess = new BridgeSnapshootProcess(this.env);
        const snapshootProcessResult = await snapshootProcess.run();
        if(snapshootProcessResult.error != undefined){
            result.error = snapshootProcessResult.error;
            return result;
        }
        console.info(`end build new snapshoot`);

        return result;
    }

    private env:any;
}