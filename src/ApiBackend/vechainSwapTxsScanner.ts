import { Framework } from "@vechain/connex-framework";
import { SnapshootModel } from "../common/model/snapshootModel";
import BridgeTxModel from "../common/model/bridgeTxModel";
import { ActionData, ActionResult } from "../common/utils/components/actionResult";
import { VeChainBridgeHead } from "../common/vechainBridgeHead";

export class VeChainSwapTxsScanner{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = this.env.connex;
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.BridgeTxModel = new BridgeTxModel(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.env.vechainscan = {endBlock:0};
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            console.info(`Begin VeChain Swaptxs scanner`);
            let beginBlock = this.config.vechain.startBlockNum;
            let endBlock = (await this.connex.thor.block().get())!.number;
            
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

            const handleForkResult = await this.handleFork();
            if(handleForkResult.error){
                result.error = handleForkResult.error;
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
            const saveResult = await this.BridgeTxModel.saveBridgeTxs(scanTxsResult.data);
            if(saveResult.error){
                result.error = saveResult.error;
                return result;
            }
        }
        console.info(`End Scan VeChain SwapTxs OnChain`);
        return result;
    }

    private async handleFork():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            while(true){
                console.info(`begin handle VeChain Fork`);
                const latestBridgeTxResult = await this.BridgeTxModel.getLastBridgeTx(this.config.vechain.chainName,this.config.vechain.chainId);
                if(latestBridgeTxResult.error){
                    result.error = latestBridgeTxResult.error;
                    return result;
                }

                if(latestBridgeTxResult.data == undefined){
                    return result;
                }

                let blockId = latestBridgeTxResult.data.blockId.toLowerCase();
                const blockIsForkResult = await this.blockIsFork(blockId);
                if(blockIsForkResult.error){
                    result.error = blockIsForkResult.error;
                    return result;
                }

                if(blockIsForkResult.data == true){
                    console.debug(`VeChain blockId: ${blockId} is fork`);
                    await this.BridgeTxModel.removeByBlockIds(this.config.vechain.chainName,this.config.vechain.chainId,[blockId]);
                    continue;
                }
                console.info(`End handle VeChain Fork`);
                break;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async blockIsFork(bid:string):Promise<ActionData<boolean>>{
        let result = new ActionData<boolean>();
        result.data = false;
        let blockId = bid;
        let comfirmedCount = 0;

        try {
            while(true){
                const block = await this.connex.thor.block(blockId).get();
                if(block == null){
                    result.data = true;
                    return result;
                }
                const parentBlockId = block.parentID.toLowerCase();
                const parentBlock = await this.connex.thor.block(block.number - 1).get();
                if(parentBlock == null){
                    result.data = true;
                    return result;
                }

                if(parentBlock.id.toLowerCase() != parentBlockId){
                    result.data = true;
                    return result;
                }
                blockId = parentBlock.id.toLowerCase();
                comfirmedCount++;
                if(comfirmedCount > this.config.vechain.confirmHeight){
                    return result;
                }
                
            }
        } catch (error) {
            result.error = error;
            return result;
        }
    }

    private env:any;
    private config:any;
    private vechainBridge:VeChainBridgeHead;
    private connex!:Framework;
    private BridgeTxModel!:BridgeTxModel;
    private snapshootModel!:SnapshootModel;
}