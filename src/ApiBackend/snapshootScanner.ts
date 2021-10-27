import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import { ActionData, ActionResult, PromiseActionResult } from "../common/utils/components/actionResult";
import { BridgeLedger } from "../common/utils/types/bridgeLedger";
import { BridgeSnapshoot, ZeroRoot } from "../common/utils/types/bridgeSnapshoot";
import { BridgeTx } from "../common/utils/types/bridgeTx";
import { TokenInfo } from "../common/utils/types/tokenInfo";
import LedgerModel from "../common/model/ledgerModel";
import { SnapshootModel } from "../common/model/snapshootModel";
import BridgeTxModel from "../common/model/bridgeTxModel";
import { VeChainBridgeHead } from "../common/vechainBridgeHead";
import { EthereumBridgeHead } from "../common/ethereumBridgeHead";
import BridgeStorage from "../common/bridgeStorage";

export class SnapshootScanner{
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
        this.BridgeTxModel = new BridgeTxModel(this.env);
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            console.info(`Get LastSyncedSnapshoot`);
            const lastSyncSnRsult = await this.getLastSyncedSnapshoot();
            if(lastSyncSnRsult.error){
                result.copyBase(lastSyncSnRsult);
                return result;
            }
            console.info(`LastSyncedSnapshoot is ${lastSyncSnRsult.data!.merkleRoot}`);

            const latestMerkleRootResult = await this.vechainBridge.getMerkleRoot();
            if(latestMerkleRootResult.error){
                result.error = latestMerkleRootResult.error;
                return result;
            }

            if(latestMerkleRootResult.data != undefined && latestMerkleRootResult.data == lastSyncSnRsult.data!.merkleRoot){
                console.info(`Complete synchronization`);
                return result;
            }

            console.info(`Get NoSyncSnapshootList`);
            const getNoSyncListResult = await this.getNoSyncSnapshootList(lastSyncSnRsult.data!);
            if(getNoSyncListResult.error){
                result.copyBase(getNoSyncListResult);
                return result;
            }

            console.info(`${getNoSyncListResult.data!.length} snapshoots have not been synchronized`);
            for(const sn of getNoSyncListResult.data!){
                console.info(`begin sync snapshoots: ${sn.merkleRoot}`);
                const syncResult = await this.syncDataBySnapshoot(sn);
                if(syncResult.error){
                    result.copyBase(syncResult);
                    return syncResult;
                }
                console.info(`end sync snapshoots: ${sn.merkleRoot}`);
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
            const localResult = await this.snapshootModel.getLastSnapshoot();
            if(localResult.error != undefined){
                result.error = localResult.error;
                return result;
            }

            const latestMerkleRootResult = await this.vechainBridge.getMerkleRoot();
            if(latestMerkleRootResult.error){
                result.error = latestMerkleRootResult.error;
                return result;
            }

            if(localResult.data!.merkleRoot == latestMerkleRootResult.data!){
                result.data = localResult.data;
                return result;
            }
            
            const onchainResult = await this.vechainBridge.getLastSnapshoot();
            if(onchainResult.error != undefined){
                result.error = onchainResult.error;
                return result;
            }

            let localsnapshoot = localResult.data!;
            let onchainsnapshoot = onchainResult.data!.sn;

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

    private async getNoSyncSnapshootList(sn:BridgeSnapshoot):Promise<ActionData<BridgeSnapshoot[]>>{
        let result = new ActionData<BridgeSnapshoot[]>();
        result.data = new Array();

        const vechain_beginBlock = sn.chains.filter(chain =>{return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})[0].endBlockNum + 1;
        const vechain_endblock = (await this.connex.thor.block().get())!.number;
        const ethereum_beginBlock = sn.chains.filter(chain =>{return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})[0].endBlockNum + 1;
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
            const tSn = eSn.filter( esn => {return esn.merkleRoot == sn.merkleRoot})[0];
            if(tSn == undefined){
                result.error = new Error(`ethereum can't found snapshoot:${sn.merkleRoot}`);
                return result;
            }
            sn.chains.push(tSn.chains[0]);
        }
        result.data = vSn;
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
        console.info(`get ${getTxsResult.data!.length} Swap/Claim transactions`);

        let bridgeStorage = new BridgeStorage(localSN.sn,this.tokenInfo,localSN.ledgers);
        const updateResult = await bridgeStorage.updateLedgers(getTxsResult.data!);
        if(updateResult.error){
            result.copyBase(updateResult);
            return result;
        }

        const treenode = bridgeStorage.buildTree(sn.chains,sn.parentMerkleRoot);
        if(treenode.nodeHash != sn.merkleRoot){
            result.error = `syncDataBySnapshoot error:hash mismatching, root: ${sn.merkleRoot}`;
            return result;
        }
        
        const snsaveResult = await this.snapshootModel.save([sn]);
        const ledgersaveResult = await this.ledgerModel.save(sn.merkleRoot,bridgeStorage.ledgerCache);
        const swaptxsaveResult = await this.BridgeTxModel.saveBridgeTxs(getTxsResult.data || []);

        if(snsaveResult.error){
            result.copyBase(snsaveResult);
            return result;
        }

        if(ledgersaveResult.error){
            result.copyBase(ledgersaveResult);
            return result;
        }

        if(swaptxsaveResult.error){
            result.copyBase(swaptxsaveResult);
            return result;
        }

        return result;
    }

    private async getTxsBySnapshoot(sn:BridgeSnapshoot):Promise<ActionData<BridgeTx[]>>{
        let result = new ActionData<BridgeTx[]>();
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

        const vechainTxs = (scanResult.data!.succeed[0] as ActionData<BridgeTx[]>).data!;
        const ethereumTxs = (scanResult.data!.succeed[1] as ActionData<BridgeTx[]>).data!;

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
    private BridgeTxModel!:BridgeTxModel;
}