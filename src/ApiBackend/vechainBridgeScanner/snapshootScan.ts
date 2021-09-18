import { Framework } from "@vechain/connex-framework";
import { ActionData, ActionResult, PromiseActionResult } from "../../common/utils/components/actionResult";
import { BridgeSnapshoot, ZeroRoot } from "../../common/utils/types/bridgeSnapshoot";
import { SnapshootModel } from "../../ValidationNode/server/model/snapshootModel";
import { VeChainBridgeHead } from "../../ValidationNode/server/vechainBridgeHead";

export class VeChainBridgeSnapshootScan{
    public async run(env:any):Promise<ActionResult>{
        let result = new ActionResult();

        let beginBlock = env.config.vechain.startBlockNum;
        let endBlock = (env.connex as Framework).thor.status.head.number - env.config.vechain.confirmHeight;

        if(env.snapshoot == undefined || env.snapshoot.beginNumber == undefined){
            const getResult = await this.getStartBlockNum(env);
            if(getResult.error){
                result.copyBase(getResult);
                return result;
            }
            beginBlock = getResult.data != 0 ? getResult.data : beginBlock;
        }

        if(endBlock <= beginBlock){
            return result;
        }

        env.snapshoot = {beginNumber:beginBlock};
        const getSnapshootResult = await this.getSnapshoot(env,beginBlock,endBlock);
        if(getSnapshootResult.error){
            result.error = getSnapshootResult.error;
            return result;
        }

        if(getSnapshootResult.data && getSnapshootResult.data.length > 0){
            const saveResult = await (new SnapshootModel(env)).save(getSnapshootResult.data);
            if(saveResult.error){
                result.error = saveResult.error;
                return result;
            }
        }

        return result;
    }

    private async getStartBlockNum(env:any):Promise<ActionData<number>>{
        let result = new ActionData<number>();
        result.data = env.config.vechain.startBlockNum;
        
        const getResult = await (new SnapshootModel(env)).getLastSnapshoot();
        if(getResult.error){
            result.error = getResult.error;
            return result;
        }

        if(getResult.data){
            const vechain = getResult.data.chains.find(info =>{
                return info.chainId == env.config.vechain.chainId 
                && info.chainName == env.config.vechain.chainName;});
            result.data = vechain!.endBlockNum;
        }

        return result;
    }

    private async getSnapshoot(env:any,begin:number,end:number):Promise<ActionData<BridgeSnapshoot[]>>{
        let result = new ActionData<BridgeSnapshoot[]>();
        result.data = new Array();
        const scanBlockStep = 100;

        for(let block = begin; block <= end;){
            let from = block;
            let to = block + scanBlockStep > end ? end:block + scanBlockStep;

            const getSnapshootsResult = await (new VeChainBridgeHead(env)).getSnapshoot(from,to);
            if(getSnapshootsResult.error){
                result.error = getSnapshootsResult.error;
                return result;
            }

            if(getSnapshootsResult.data && getSnapshootsResult.data.length > 0){
                result.data = result.data.concat(getSnapshootsResult.data);
            }
            
            block = to + 1;
        }

        return result;
    }

}