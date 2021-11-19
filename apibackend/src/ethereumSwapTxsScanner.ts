import Web3 from "web3";
import { EthereumBridgeHead } from "./common/ethereumBridgeHead";
import BridgeTxModel from "./common/model/bridgeTxModel";
import { SnapshootModel } from "./common/model/snapshootModel";
import { ActionData, ActionResult } from "./common/utils/components/actionResult";

export class EthereumSwapTxsScanner{

    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.web3 = this.env.web3;
        this.ethereumBridge = new EthereumBridgeHead(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.BridgeTxModel = new BridgeTxModel(this.env);
        this.env.ethereumscan = {endBlock:0};
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            console.info(`Begin Ethereum Swaptxs scanner`);
            let beginBlock = this.config.ethereum.startBlockNum;
            let endBlock = (await this.web3.eth.getBlock('latest')).number;

            if(this.env.ethereumscan.endBlock == 0){
                const lastSnapshootResult = await this.snapshootModel.getLastSnapshoot();
                if(lastSnapshootResult.error){
                    result.copyBase(lastSnapshootResult);
                    return result;
                }
                let chainInfo = lastSnapshootResult.data!.chains.filter(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})[0];
                if(chainInfo != undefined){
                    beginBlock = chainInfo.endBlockNum;
                }
                this.env.ethereumscan.endBlock = beginBlock;
            } else {
                beginBlock = this.env.ethereumscan.endBlock;
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
            this.env.ethereumscan.endBlock = endBlock;
            console.info(`End Ethereum Swaptxs scanner`);

        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private async scanTxs(begin:number,end:number):Promise<ActionResult>{
        let result = new ActionResult();
        console.info(`Begin Scan Ethereum SwapTxs OnChain`);
        const scanTxsResult = await this.ethereumBridge.scanTxs(begin,end);
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
        console.info(`End Scan Ethereum SwapTxs OnChain`);
        return result;
    }

    private async handleFork():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            while(true){
                console.info(`begin handle ethereum Fork`);
                const latestBridgeTxResult = await this.BridgeTxModel.getLastBridgeTx(this.config.ethereum.chainName,this.config.ethereum.chainId);
                if(latestBridgeTxResult.error){
                    result.error = latestBridgeTxResult.error;
                    return result;
                }
    
                if(latestBridgeTxResult.data == undefined){
                    return result;
                }
    
                let blockHash = latestBridgeTxResult.data.blockId.toLowerCase();
                const blockIsForkResult = await this.blockIsFork(blockHash);
                if(blockIsForkResult.error){
                    result.error = blockIsForkResult.error;
                    return result;
                }

                if(blockIsForkResult.data == true){
                    console.debug(`ethereum blockHash: ${blockHash} is fork`);
                    await this.BridgeTxModel.removeByBlockIds(this.config.ethereum.chainName,this.config.ethereum.chainId,[blockHash]);
                    continue;
                }
                console.info(`End handle ethereum Fork`);
                break;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async blockIsFork(bhash:string):Promise<ActionData<boolean>>{
        let result = new ActionData<boolean>();
        result.data = false;
        let blockHash = bhash; 
        let comfirmedCount = 0;
        try {
            while(true){
                const block = await this.web3.eth.getBlock(blockHash);
                if(block == null){
                    result.data = true;
                    return result;
                }
    
                const parentBlockHash = block.parentHash.toLowerCase();
                const parentBlock = await this.web3.eth.getBlock(block.number - 1);
                if(parentBlock == null){
                    result.data = true;
                    return result;
                }

                if(parentBlock.hash.toLowerCase() != parentBlockHash){
                    result.data = true;
                    return result;
                }
                blockHash = parentBlock.hash.toLowerCase();
                comfirmedCount++;
                if(comfirmedCount > this.config.ethereum.confirmHeight){
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
    private ethereumBridge:EthereumBridgeHead;
    private web3!:Web3;
    private BridgeTxModel!:BridgeTxModel;
    private snapshootModel!:SnapshootModel;
}