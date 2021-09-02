import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
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
        this.web3 = this.env.web3;
        this.tokenInfo = this.env.tokenInfo;
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.ethereumBridge = new EthereumBridgeHead(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.ledgerModel = new LedgerModel(this.env);
    }

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const lastSyncSnRsult = await this.getLastSyncedSnapshoot();
            if(lastSyncSnRsult.error){
                result.copyBase(lastSyncSnRsult);
                return result;
            }

            const getNoSyncListResult = await this.getNoSyncSnapshootList(lastSyncSnRsult.data!);
            if(getNoSyncListResult.error){
                result.copyBase(getNoSyncListResult);
                return result;
            }
            
            if(getNoSyncListResult.data!.length == 0){
                return result;
            }

            for await(const sn of getNoSyncListResult.data!){
                const syncResult = await this.syncDataBySnapshoot(sn);
                if(syncResult.error){
                    result.copyBase(syncResult);
                    return syncResult;
                }
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private async getLastSyncedSnapshoot():Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        result.data = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    beginBlockNum:this.config.vechain.startBlockNum,
                    lockedBlockNum:this.config.vechain.startBlockNum,
                    endBlockNum:this.config.vechain.startBlockNum},
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    beginBlockNum:this.config.ethereum.startBlockNum,
                    lockedBlockNum:this.config.ethereum.startBlockNum,
                    endBlockNum:this.config.ethereum.startBlockNum
                },
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
                result.data = localsnapshoot;
                return result;
            }

            while(true){
                if(localsnapshoot.merkleRoot == onchainsnapshoot.merkleRoot){
                    result.data = localsnapshoot;
                    return result;
                } else {
                    let localFromNum = localsnapshoot.chains.filter( chain =>{return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId})[0].beginBlockNum;
                    let onchainFromNum = onchainsnapshoot.chains.filter( chain =>{return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId})[0].beginBlockNum;
                    if(localFromNum <= onchainFromNum){
                        const lastSnapResult = await this.vechainBridge.getSnapshootByBlock(onchainFromNum);
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

        let localDataResult = await this.loadLocalSnapshoot(sn.parentMerkleRoot);
        if(localDataResult.error){
            result.copyBase(localDataResult);
            return result;
        }

        const localSN = localDataResult.data!;

        let getTxsResult = await this.getTxsBySnapshoot(sn);
        if(getTxsResult.error){
            result.copyBase(getTxsResult);
            return result;
        }

        console.log(`before localSN: ${JSON.stringify(localSN)}`);
        let bridgeStorage = new BridgeStorage(localSN.sn,this.tokenInfo,localSN.ledgers);
        console.log(`after localSN: ${JSON.stringify(localSN)}`);
        const updateResult = await bridgeStorage.updateLedgers(getTxsResult.data!);
        if(updateResult.error){
            result.copyBase(updateResult);
            return result;
        }

        console.log(`before sn: ${JSON.stringify(sn)}`);
        const treenode = bridgeStorage.buildTree(sn.chains,sn.parentMerkleRoot);
        console.log(`after sn: ${JSON.stringify(sn)}`);
        if(treenode.nodeHash != sn.merkleRoot){
            result.error = `syncDataBySnapshoot error:hash mismatching, root: ${sn.merkleRoot}`;
            console.log(`\r\nparent SN: ${JSON.stringify(localSN.sn)} \r\ntarget SN: ${JSON.stringify(sn)}`);

            return result;
        }
        
        // const snsaveResult = await this.snapshootModel.save(sn);
        // const ledgersaveResult = await this.ledgerModel.save(sn.merkleRoot,bridgeStorage.ledgerCache);

        // if(snsaveResult.error){
        //     result.copyBase(snsaveResult);
        //     return result;
        // }

        // if(ledgersaveResult.error){
        //     result.copyBase(ledgersaveResult);
        //     return result;
        // }

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

    private async getNoSyncSnapshootList(sn:BridgeSnapshoot):Promise<ActionData<BridgeSnapshoot[]>>{
        let result = new ActionData<BridgeSnapshoot[]>();
        result.data = new Array();

        const vechain_beginBlock = sn.chains.filter(chain =>{return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})[0].endBlockNum;
        const vechain_endblock = this.connex.thor.status.head.number;
        const ethereum_beginBlock = sn.chains.filter(chain =>{return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})[0].endBlockNum;
        const ethereum_endblock = (await this.web3.eth.getBlock('latest')).number;

        const vPromise = this.vechainBridge.getSnapshoot(vechain_beginBlock,vechain_endblock);
        const ePromise = this.ethereumBridge.getSnapshoot(ethereum_beginBlock,ethereum_endblock);

        const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vPromise,ePromise]));
        if(promiseResult.error){
            result.copyBase(promiseResult);
            return result;
        }

        const vSn = (promiseResult.data!.succeed[0] as ActionData<BridgeSnapshoot[]>).data!;
        const eSn = (promiseResult.data!.succeed[1] as ActionData<BridgeSnapshoot[]>).data!;

        for(let sn of vSn){
            const tSn = eSn.filter( sn => {return sn.merkleRoot == sn.merkleRoot})[0];
            if(tSn == undefined){
                result.error = new Error(`ethereum can't found snapshoot:${sn.merkleRoot}`);
                return result;
            }
            sn.chains.push(tSn.chains[0]);
        }
        result.data = vSn;
        return result;
    }

    private async getTxsBySnapshoot(sn:BridgeSnapshoot):Promise<ActionData<SwapTx[]>>{
        let result = new ActionData<SwapTx[]>();
        result.data = new Array();
        const vechain = sn.chains.filter( chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})[0];
        const ethereum = sn.chains.filter( chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})[0];
        
        const scanVeChainTxsPromise = this.vechainBridge.scanTxs(vechain.beginBlockNum,vechain.endBlockNum - 1);
        const scanEthereumTxsPromise = this.ethereumBridge.scanTxs(ethereum.beginBlockNum,ethereum.endBlockNum -1);
        
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
    private web3!:Web3;
    private tokenInfo!:Array<TokenInfo>;
    private snapshootModel!:SnapshootModel;
    private ledgerModel!:LedgerModel;
}