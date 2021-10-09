import { Framework } from "@vechain/connex-framework";
import { ActionData, ActionResult } from "../../common/utils/components/actionResult";
import { SwapTx } from "../../common/utils/types/swapTx";
import SwapTxModel from "../../common/model/swapTxModel";
import { VeChainBridgeHead } from "../../common/vechainBridgeHead";

export class VeChainBridgeSwapTxScan{

    public async run(env:any):Promise<ActionResult>{
        let result = new ActionResult();

        let beginBlock = env.config.vechain.startBlockNum;
        let endBlock = (env.connex as Framework).thor.status.head.number - env.config.vechain.confirmHeight;

        if(env.swapTxScan == undefined || env.swapTxScan.beginNumber == undefined){
            const getResult = await this.getStartBlockNum(env);
            if(getResult.error){
                result.copyBase(getResult);
                return result;
            }
            beginBlock = getResult.data!;
        }

        if(endBlock <= beginBlock){
            return result;
        }
        
        env.swapTxScan = {beginNumber:beginBlock}
        const getSwapTxsResult = await this.getSwapTxs(env,beginBlock,endBlock);
        if(getSwapTxsResult.error){
            result.error = getSwapTxsResult.error;
            return result;
        }

        if(getSwapTxsResult.data && getSwapTxsResult.data.length>0){
            const saveResult = await (new SwapTxModel(env)).saveSwapTx(getSwapTxsResult.data);
            if(saveResult.error){
                result.error = getSwapTxsResult.error;
                return result;
            }
        }

        return result;
    }

    private async getStartBlockNum(env:any):Promise<ActionData<number>>{
        let result = new ActionData<number>();
        result.data = env.config.vechain.startBlockNum;
        try {
            const lastSwapTxResult = await (new SwapTxModel(env)).getLastSwapTx(env.config.vechain.chainName,env.config.vechain.chainId);
            if(lastSwapTxResult.error){
                result.error = lastSwapTxResult.error;
                return result;
            }
            if(lastSwapTxResult.data){
                result.data = lastSwapTxResult.data.blockNumber;
            }
        } catch (error) {
            result.error = error;
        }
        
        return result;
    }

    private async getSwapTxs(env:any,begin:number,end:number):Promise<ActionData<SwapTx[]>>{
        let result = new ActionData<SwapTx[]>();
        result.data = new Array();
        const scanBlockStep = 100;

        for(let block = begin; block <= end;){
            let from = block;
            let to = block + scanBlockStep > end ? end:block + scanBlockStep;

            const getSwapTxsResult = await (new VeChainBridgeHead(env)).scanTxs(from,to);
            if(getSwapTxsResult.error){
                result.copyBase(getSwapTxsResult);
                return result;
            }
            if(getSwapTxsResult.data && getSwapTxsResult.data.length > 0){
                result.data = result.data.concat(getSwapTxsResult.data);
            }
            
            block = to + 1;
        }

        return result;
    }
}