import { Framework } from "@vechain/connex-framework";
import BridgeStorage from "./server/bridgeStorage";
import { EthereumBridgeHead } from "./server/ethereumBridgeHead";
import LedgerModel from "./server/model/ledgerModel";
import { SnapshootModel } from "./server/model/snapshootModel";
import { VeChainBridgeHead } from "./server/vechainBridgeHead";
import { ActionData, ActionResult, PromiseActionResult } from "./utils/components/actionResult";
import { BridgeLedger } from "./utils/types/bridgeLedger";
import { BridgeSnapshoot, ZeroRoot } from "./utils/types/bridgeSnapshoot";
import { SwapTx } from "./utils/types/swapTx";
import { TokenInfo } from "./utils/types/tokenInfo";

export class BridgeSyncTask{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = this.env.connex;
        this.tokenInfo = this.env.tokenInfo;
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.ethereumBridge = new EthereumBridgeHead(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.ledgerModel = new LedgerModel(this.env);
    }

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const lastSyncSnRsult = await this.getLastSyncSnapshoot();
            if(lastSyncSnRsult.error){
                result.copyBase(lastSyncSnRsult);
                return result;
            }

            const lastSnycSn = lastSyncSnRsult.data!;
            console.log(JSON.stringify(lastSnycSn));

        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private async getLastSyncSnapshoot():Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        result.data = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,beginBlockNum:this.config.vechain.startBlockNum,endBlockNum:this.config.vechain.startBlockNum},
                {chainName:this.config.ethereum.chainName,chainId:this.config.ethereum.chainId,beginBlockNum:this.config.ethereum.startBlockNum,endBlockNum:this.config.ethereum.startBlockNum},
            ]
        }

        try {
            const localPromise = this.snapshootModel.getLastSnapshoot();
            const onchainPromise = this.vechainBridge.getLastSnapshoot();
            const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([localPromise,onchainPromise]));
            if(promiseResult.error){
                result.copyBase(promiseResult);
            }

            let localsnapshoot = (promiseResult.data!.succeed[0] as ActionData<BridgeSnapshoot>).data!;
            let onchainsnapshoot = (promiseResult.data!.succeed[1] as ActionData<BridgeSnapshoot>).data!;

            if(localsnapshoot.merkleRoot == onchainsnapshoot.merkleRoot){
                return result;
            }

            const chainName = this.config.vechain.chainName;
            const chainId = this.config.vechain.chainId;

            while(true){
                if(localsnapshoot.merkleRoot == onchainsnapshoot.merkleRoot){
                    result.data = localsnapshoot;
                    return result;
                } else {
                    let localFromNum = localsnapshoot.chains.filter( chain =>{return chain.chainName == chainName && chain.chainId == chainId})[0].beginBlockNum;
                    let onchainFromeNum = onchainsnapshoot.chains.filter( chain =>{return chain.chainName == chainName && chain.chainId == chainId})[0].beginBlockNum;
                    if(localFromNum <= onchainFromeNum){
                        const lastSnapResult = await this.vechainBridge.getSnapshootByBlock(onchainFromeNum);
                        if(lastSnapResult.error){
                            result.copyBase(lastSnapResult);
                            return result;
                        }

                        if(lastSnapResult.data!.merkleRoot == ZeroRoot()){
                            await this.snapshootModel.deleteSnapshoot(localsnapshoot.merkleRoot);
                            return result;
                        }
                        onchainsnapshoot = lastSnapResult.data!;
                        continue;

                    } else {
                        const lastSnapResult = await this.snapshootModel.getSnapshootByRoot(localsnapshoot.parentMerkleRoot);
                        if(lastSnapResult.error){
                            result.copyBase(lastSnapResult);
                            return result;
                        }
                        if(lastSnapResult.data!.merkleRoot == ZeroRoot()){
                            return result;
                        }
                        await this.snapshootModel.deleteSnapshoot(localsnapshoot.merkleRoot);
                        localsnapshoot = lastSnapResult.data!
                        continue;
                    }
                }
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private async syncDataBySnapshoot(sn:BridgeSnapshoot):Promise<ActionResult>{
        let result = new ActionResult();

        const localDataResult = await this.loadLocalSnapshoot(sn.parentMerkleRoot);
        if(localDataResult.error){
            result.copyBase(localDataResult);
            return result;
        }

        const getTxsResult = await this.getTxsBySnapshoot(sn);
        if(getTxsResult.error){
            result.copyBase(getTxsResult);
            return result;
        }

        let bridgeStorage = new BridgeStorage(localDataResult.data!.sn,localDataResult.data!.ledgers);
        const updateResult = await bridgeStorage.updateLedgers(getTxsResult.data!,this.tokenInfo);
        if(updateResult.error){
            result.copyBase(updateResult);
            return result;
        }

        const treenode = bridgeStorage.buildTree(sn.chains,sn.parentMerkleRoot);
        if(treenode.nodeHash != sn.merkleRoot){
            result.error = `syncDataBySnapshoot error:hash mismatching, root: ${sn.merkleRoot}`;
            return result;
        }
        
        const snsaveResult = await this.snapshootModel.save(sn);
        const ledgersaveResult = await this.ledgerModel.save(sn.merkleRoot,bridgeStorage.ledgerCache);

        if(snsaveResult.error){
            result.copyBase(snsaveResult);
            return result;
        }

        if(ledgersaveResult.error){
            result.copyBase(ledgersaveResult);
            return result;
        }

        return result;
    }

    private async checkSyncStatus():Promise<ActionData<boolean>>{
        let result = new ActionData<boolean>();

        const localResult = await this.snapshootModel.getLastSnapshoot();
        const onchainResult = await this.vechainBridge.getLastSnapshoot();

        if(localResult.error){
            result.copyBase(localResult);
            return result;
        }

        if(onchainResult.error){
            result.copyBase(onchainResult);
            return result;
        }

        result.data = localResult.data!.merkleRoot == onchainResult.data!.merkleRoot;
        return result;
    }

    public async checkBridgeStatus():Promise<ActionData<boolean>>{
        let result = new ActionData<boolean>();

        const vechainResult = await this.vechainBridge.getLockedStatus();
        if(vechainResult.error){
            result.copyBase(vechainResult);
            return result;
        }
        if(vechainResult.data){
            return vechainResult;
        }

        const ethereumResult = await this.ethereumBridge.getLockedStatus();
        if(ethereumResult.error){
            result.copyBase(ethereumResult);
            return result;
        }
        return ethereumResult;
    }

    public async getNoSyncBlockNum():Promise<ActionData<number>>{
        let result = new ActionData<number>();
        result.data = 0;

        try {
            const localPromise = this.snapshootModel.getLastSnapshoot();
            const onchainPromise = this.vechainBridge.getLastSnapshoot();
            const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([localPromise,onchainPromise]));
            if(promiseResult.error){
                result.copyBase(promiseResult);
            }

            let localsnapshoot = (promiseResult.data!.succeed[0] as ActionData<BridgeSnapshoot>).data!;
            let onchainsnapshoot = (promiseResult.data!.succeed[1] as ActionData<BridgeSnapshoot>).data!;

            if(localsnapshoot.merkleRoot == onchainsnapshoot.merkleRoot){
                return result;
            }

            const chainName = this.config.vechain.chainName;
            const chainId = this.config.vechain.chainId;

            while(true){
                if(localsnapshoot.merkleRoot == onchainsnapshoot.merkleRoot){
                    result.data = onchainsnapshoot.chains.filter( chain =>{return chain.chainName == chainName && chain.chainId == chainId})[0].endBlockNum;
                    return result;
                } else {
                    let localFromNum = localsnapshoot.chains.filter( chain =>{return chain.chainName == chainName && chain.chainId == chainId})[0].beginBlockNum;
                    let onchainFromeNum = onchainsnapshoot.chains.filter( chain =>{return chain.chainName == chainName && chain.chainId == chainId})[0].beginBlockNum;
                    if(localFromNum <= onchainFromeNum){
                        const lastSnapResult = await this.vechainBridge.getSnapshootByBlock(onchainFromeNum);
                        if(lastSnapResult.error){
                            result.copyBase(lastSnapResult);
                            return result;
                        }

                        if(lastSnapResult.data!.merkleRoot == ZeroRoot()){
                            result.data = this.config.vechain.startBlockNum;
                            await this.snapshootModel.deleteSnapshoot(localsnapshoot.merkleRoot);
                            return result;
                        }
                        onchainsnapshoot = lastSnapResult.data!;
                        continue;

                    } else {
                        const lastSnapResult = await this.snapshootModel.getSnapshootByRoot(localsnapshoot.parentMerkleRoot);
                        if(lastSnapResult.error){
                            result.copyBase(lastSnapResult);
                            return result;
                        }
                        if(lastSnapResult.data!.merkleRoot == ZeroRoot()){
                            result.data = this.config.vechain.startBlockNum;
                            return result;
                        }
                        await this.snapshootModel.deleteSnapshoot(localsnapshoot.merkleRoot);
                        localsnapshoot = lastSnapResult.data!
                        continue;
                    }
                }
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    } 


    public async getNoSyncSnapshootList(from:number):Promise<ActionData<BridgeSnapshoot[]>>{
        const end = this.connex.thor.status.head.number;
        return await this.vechainBridge.getSnapshoot(from,end);
    }

    private async getTxsBySnapshoot(sn:BridgeSnapshoot):Promise<ActionData<SwapTx[]>>{
        let result = new ActionData<SwapTx[]>();
        result.data = new Array();
        const vechain = sn.chains.filter( chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})[0];
        const ethereum = sn.chains.filter( chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})[0];
        
        const scanVeChainTxsPromise = this.vechainBridge.scanTxs(vechain.beginBlockNum,vechain.endBlockNum);
        const scanEthereumTxsPromise = this.ethereumBridge.scanTxs(ethereum.beginBlockNum,ethereum.endBlockNum);
        
        const scanResult = await PromiseActionResult.PromiseActionResult(Promise.all([scanVeChainTxsPromise,scanEthereumTxsPromise]));
        if(scanResult.error){
            result.copyBase(scanResult);
            return result;
        }

        const vechainTxs = (scanResult.data!.succeed[0] as ActionData<SwapTx[]>).data!;
        const ethereumTxs = (scanResult.data!.succeed[1] as ActionData<SwapTx[]>).data!;

        result.data = result.data.concat(vechainTxs,ethereumTxs);
        return result;
    }

    private async loadLocalSnapshoot(root:string):Promise<ActionData<{sn:BridgeSnapshoot,ledgers:BridgeLedger[]}>>{
        let result = new ActionData<{sn:BridgeSnapshoot,ledgers:BridgeLedger[]}>();

        const snapshootResult = await this.snapshootModel.getSnapshootByRoot(root);
        const ledgersResult = await this.ledgerModel.load(root);

        if(snapshootResult.error){
            result.copyBase(snapshootResult);
        }

        if(ledgersResult.error){
            result.copyBase(ledgersResult);
        }

        result.data = {sn:snapshootResult.data!,ledgers:ledgersResult.data!};
        return result;
    }
 
    private env:any;
    private config:any;
    private vechainBridge:VeChainBridgeHead;
    private ethereumBridge:EthereumBridgeHead;
    private connex!:Framework;
    private tokenInfo!:Array<TokenInfo>;
    private snapshootModel!:SnapshootModel;
    private ledgerModel!:LedgerModel;
}