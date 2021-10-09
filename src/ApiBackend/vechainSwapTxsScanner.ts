import { Framework } from "@vechain/connex-framework";
import { SnapshootModel } from "../common/model/snapshootModel";
import SwapTxModel from "../common/model/swapTxModel";
import { ActionResult } from "../common/utils/components/actionResult";
import { VeChainBridgeHead } from "../common/vechainBridgeHead";

export class VeChainSwapTxsScanner{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = this.env.connex;
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.swapTxModel = new SwapTxModel(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.env.vechainscan = {endBlock:0};
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            console.info(`Begin VeChain Swaptxs scanner`);
            let beginBlock = this.config.vechain.startBlockNum;
            let endBlock = (await this.connex.thor.block().get())!.number - this.config.vechain.confirmHeight;
            
            if(this.env.vechainscan.endBlock == 0){
                const lastSnapshootResult = await this.snapshootModel.getLastSnapshoot();
                if(lastSnapshootResult.error){
                    result.copyBase(lastSnapshootResult);
                    return result;
                }
                let chainInfo = lastSnapshootResult.data!.chains.filter(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})[0];
                if(chainInfo != undefined){
                    beginBlock = chainInfo.endBlockNum;
                }
                this.env.vechainscan.endBlock = beginBlock;
            } else {
                beginBlock = this.env.vechainscan.endBlock;
            }

            const scanResult = await this.scanTxs(beginBlock,endBlock);
            if(scanResult.error){
                result.error = scanResult.error;
                return result;
            }
            this.env.vechainscan.endBlock = endBlock;
            console.info(`End VeChain Swaptxs scanner`);
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async scanTxs(begin:number,end:number):Promise<ActionResult>{
        let result = new ActionResult();
        console.info(`Begin Scan VeChain SwapTxs OnChain`);
        const scanTxsResult = await this.vechainBridge.scanTxs(begin,end);
        if(scanTxsResult.error){
            result.error = scanTxsResult.error;
            return result;
        }
        
        if(scanTxsResult.data && scanTxsResult.data!.length > 0){
            console.debug(`Get ${scanTxsResult.data!.length} swapTxs`);
            const saveResult = await this.swapTxModel.saveSwapTx(scanTxsResult.data);
            if(saveResult.error){
                result.error = saveResult.error;
                return result;
            }
        }
        console.info(`End Scan VeChain SwapTxs OnChain`);
        return result;
    }

    private env:any;
    private config:any;
    private vechainBridge:VeChainBridgeHead;
    private connex!:Framework;
    private swapTxModel!:SwapTxModel;
    private snapshootModel!:SnapshootModel;
}