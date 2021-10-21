import { SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import { getReceipt } from "myvetools/dist/connexUtils";
import { keccak256 } from "thor-devkit";
import BridgeStorage from "../common/bridgeStorage";
import { EthereumBridgeHead } from "../common/ethereumBridgeHead";
import { EthereumBridgeVerifier } from "../common/ethereumBridgeVerifier";
import LedgerModel from "../common/model/ledgerModel";
import { SnapshootModel } from "../common/model/snapshootModel";
import BridgeTxModel from "../common/model/bridgeTxModel";
import { ActionData, ActionResult, PromiseActionResult } from "../common/utils/components/actionResult";
import { sleep } from "../common/utils/sleep";
import { BridgeLedger } from "../common/utils/types/bridgeLedger";
import { BridgeSnapshoot, ChainInfo, ZeroRoot } from "../common/utils/types/bridgeSnapshoot";
import { BridgeTx } from "../common/utils/types/bridgeTx";
import { VeChainBridgeHead } from "../common/vechainBridgeHead";
import { VeChainBridgeVerifiter } from "../common/vechainBridgeVerifier";

export class BridgeSnapshootProcess{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.wallet = env.wallet;
        this.connex = env.connex;
        this.snapshootModel = new SnapshootModel(this.env);
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.vechainVerifier = new VeChainBridgeVerifiter(this.env);
        this.ethereumBridge = new EthereumBridgeHead(this.env);
        this.ethereumVerifier = new EthereumBridgeVerifier(this.env);
        this.ledgerModel = new LedgerModel(this.env);
        this.BridgeTxModel = new BridgeTxModel(this.env);
        this.status = STATUS.Entry;
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();
        let newSnapshoot:BridgeSnapshoot;
        
        const getLocalMerkleRootResult = await this.snapshootModel.getLastSnapshoot();
        if(getLocalMerkleRootResult.error){
            result.error = getLocalMerkleRootResult.error;
            return result;
        }

        const getMerkleRootResult = await this.vechainBridge.getMerkleRoot();
        if(getMerkleRootResult.error){
            result.error = getMerkleRootResult.error;
            return result;
        }

        const parentRoot = getLocalMerkleRootResult.data!.merkleRoot;

        if(getMerkleRootResult.data!.toLocaleLowerCase() != parentRoot){
            result.error = new Error(`MerklerootNomatch,localRoot:${parentRoot} bridgeRoot:${getMerkleRootResult.data!}`);
            return result;
        }

        console.info(`LocalRoot:${parentRoot} bridgeRoot:${getMerkleRootResult.data!}`);
        const beginTs = (new Date()).getTime();
        console.info(`Bridge build snapshoot process begin at ${beginTs} (${(new Date()).toString()})`);

        while(true){
            if(beginTs + this.processTimeout < (new Date()).getTime()){
                result.error = new Error("BuildSnapshoot Process timeout");
                console.error(`BuildSnapshoot Process timeout`)
                return result;
            }
            await sleep(5 * 1000);

            console.info(`Status ${this.status}`);
            let runResult = new ActionResult();

            switch(this.status){
                case STATUS.Entry:
                case STATUS.BridgeNoLock:
                    runResult = await this.entryHandle();
                    break;
                case STATUS.BridgeLocked:
                    runResult = await this.bridgeLockedHandle(parentRoot);
                    if(runResult.error == undefined){
                        newSnapshoot = (runResult as ActionData<BridgeSnapshoot>).data!;
                    }
                    break;
                case STATUS.VeChainUpdateTxSend:
                    runResult = await this.veChainUpdateTxSendHandle(newSnapshoot!.merkleRoot);
                    break;
                case STATUS.VeChainUpdateUnconfirmed:
                    runResult = await this.veChainUpdateUnconfirmedHandle(newSnapshoot!);
                    if(runResult.error == undefined){
                        newSnapshoot = (runResult as ActionData<BridgeSnapshoot>).data!;
                    }
                    break;
                case STATUS.VeChainUpdateConfirmed:
                    runResult = await this.veChainUpdateConfirmedHandle(newSnapshoot!.merkleRoot);
                    break;
                case STATUS.EthereumNoUpdate:
                    runResult = await this.ethereumNoUpdateHandle(parentRoot,newSnapshoot!.merkleRoot);
                    break;
                case STATUS.EthereumUpdateTxSend:
                    runResult = await this.ethereumUpdateTxSendHandle(newSnapshoot!.merkleRoot);
                    break;
                case STATUS.EthereumUpdateUnconfirmed:
                    runResult = await this.ethereumUpdateUnconfirmedHandle(newSnapshoot!);
                    break;
                case STATUS.EthereumUpdateConfirmed:
                    runResult = await this.ethereumUpdateConfirmed();
                    break;
                case STATUS.Finished:
                    console.info(`Bridge update merkelroot process end at ${(new Date()).getTime()} (${(new Date()).toString()})`);
                    this.status = STATUS.Entry;
                    return result;
            }
            if(runResult.error != undefined){
                console.debug(`run result error ${runResult.error}`)
            }
        }

        return result;
    }

    private async entryHandle():Promise<ActionResult>{
        let result = new ActionResult();

        const vbLockedResult = await this.vechainBridge.getLockedStatus();
        if(vbLockedResult.error){
            result.error = vbLockedResult.error;
            return result;
        }

        if(vbLockedResult.data == false){
            this.status = STATUS.BridgeNoLock;
            return result;
        }

        const ebLockedResult = await this.ethereumBridge.getLockedStatus();
        if(ebLockedResult.error){
            result.error = ebLockedResult.error;
            return result;
        }

        if(ebLockedResult.data == false){
            this.status = STATUS.BridgeNoLock;
            return result;
        }

        this.status = STATUS.BridgeLocked;
        return result;
    }

    private async bridgeLockedHandle(root:string):Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        const retryLimit = 5;
        let retryCount = 0;

        try {
            while(retryCount <= retryLimit){
                await sleep(5 * 1000);
                retryCount++;

                const buildNewSnResult = await this.buildNewSnapshoot(root);
                if(buildNewSnResult.error){
                    continue;
                }

                let newSnapshoot = buildNewSnResult.data!;

                const getUpdateProposalResult = await this.vechainVerifier.getMerkleRootProposals(newSnapshoot.merkleRoot);
                if(getUpdateProposalResult.error){
                    continue;
                }

                const msgHash = this.signEncodePacked("updateBridgeMerkleRoot",newSnapshoot.merkleRoot);
                const sign = "0x" + (await this.wallet.list[0].sign(msgHash)).toString('hex');
                if(getUpdateProposalResult.data != undefined){
                    const proposal = getUpdateProposalResult.data;
                    if(proposal.executed){
                        this.status = STATUS.VeChainUpdateUnconfirmed;
                        return result;
                    }
                    if(proposal.signatures != undefined && proposal.signatures.findIndex(item => {return item.toLocaleLowerCase() == sign.toLocaleLowerCase();}) != -1){
                        this.status = STATUS.VeChainUpdateTxSend;
                        return result;
                    }
                }

                const updateRootResult = await this.vechainVerifier.updateBridgeMerkleRoot(root,newSnapshoot.merkleRoot);
                if(updateRootResult.error){
                    continue;
                }
                const receipt = await getReceipt(this.connex,this.config.vechain.expiration,updateRootResult.data!);
                console.info(`send vechain update merkleroot, txid:${updateRootResult.data!}`);
                if(receipt.reverted == true){
                    console.info(`send update merkleroot transaction reverted, txid:${updateRootResult.data!}`)
                    continue;
                }
                result.data = newSnapshoot;
                this.status = STATUS.VeChainUpdateTxSend;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async veChainUpdateTxSendHandle(root:string):Promise<ActionResult>{
        let result = new ActionResult();
        this.status = STATUS.BridgeLocked;

        const getMerkleRootResult = await this.vechainBridge.getMerkleRoot();
        if(getMerkleRootResult.error){
            result.error = getMerkleRootResult.error;
            return result;
        }
        if(getMerkleRootResult.data! == root){
             this.status = STATUS.VeChainUpdateUnconfirmed;
        }

        return result;
    }

    private async veChainUpdateUnconfirmedHandle(sn:BridgeSnapshoot):Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();

        try {
            const vbLastSnapshootResult = await this.vechainBridge.getLastSnapshoot();
            if(vbLastSnapshootResult.error){
                result.error = vbLastSnapshootResult.error;
                return result;
            }

            const confirmTxResult = await this.vechainVerifier.checkTxStatus(vbLastSnapshootResult.data!.txid,vbLastSnapshootResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }
            if(confirmTxResult.data == "pendding"){
                this.status = STATUS.VeChainUpdateUnconfirmed;
                result.data = vbLastSnapshootResult.data!.sn;
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.VeChainUpdateConfirmed;
                let index = sn.chains.findIndex(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;});
                if(index == -1){
                    const chainInfo = vbLastSnapshootResult.data!.sn.chains.find(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})!;
                    sn.chains.push(chainInfo);
                } else {
                    sn.chains[index].endBlockNum = vbLastSnapshootResult.data!.blocknum;
                }
                await this.snapshootModel.save([sn]);
                result.data = vbLastSnapshootResult.data!.sn;
                return result;
            }

        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async veChainUpdateConfirmedHandle(root:string):Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const ebMerkleRootResult = await this.ethereumBridge.getLastSnapshoot();
            if(ebMerkleRootResult.error){
                result.error = ebMerkleRootResult.error;
                return result;
            }

            if(ebMerkleRootResult.data!.sn.merkleRoot != root){
                this.status = STATUS.EthereumNoUpdate;
            } else {
                const confirmTxResult = await this.ethereumVerifier.checkTxStatus(ebMerkleRootResult.data!.txid,ebMerkleRootResult.data!.blocknum);
                if(confirmTxResult.error){
                    result.error = confirmTxResult.error;
                    return result;
                }
                if(confirmTxResult.data == "pendding"){
                    this.status = STATUS.EthereumUpdateUnconfirmed;
                    return result;
                } else if(confirmTxResult.data == "confirmed"){
                    this.status = STATUS.EthereumUpdateConfirmed;
                    return result;
                }
            }

        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async ethereumNoUpdateHandle(parent:string,root:string):Promise<ActionResult>{
        let result = new ActionResult();
        const retryLimit = 5;
        let retryCount = 0;

        while(retryCount <= retryLimit){
            await sleep(5 * 1000);

            const getebProposalResult = await this.ethereumVerifier.getUpdateMerkleRootProposal(root);
            if(getebProposalResult.error){
                result.error = getebProposalResult.error;
                return result;
            }

            if(getebProposalResult.data && getebProposalResult.data.executed){
                this.status = STATUS.EthereumUpdateUnconfirmed;
                return result;
            }

            const getVeChainProposalResult = await this.vechainVerifier.getMerkleRootProposals(root);
            if(getVeChainProposalResult.error || getVeChainProposalResult.data == undefined){
                this.status = STATUS.Entry;
                return result;
            }

            const proposal = getVeChainProposalResult.data;
            if(proposal.executed == false){
                this.status = STATUS.Entry;
                return result;
            }

            let needSendLockTx:boolean = true;
            /** 
             * DOTO: Check which verifier need to send ethereum bridge lock transaction.
             * needSendLockTx = {};
             */

             if(needSendLockTx){
                 try {
                     const updateResult = await this.ethereumVerifier.updateBridgeMerkleRoot(parent,proposal.hash,proposal.signatures);
                     console.info(`send vechain update merkleroot, txid:${updateResult.data!}`);
                     if(updateResult.error){
                         continue;
                     } else {
                         this.status = STATUS.EthereumUpdateTxSend;
                         return result;
                     }
                 } catch (error) {
                    result.error = error;
                 }
             }
             retryCount++;
        }
        result.error = new Error(`lock ethereum bridge retry exceeded`);
        return result;
    }

    private async ethereumUpdateTxSendHandle(root:string):Promise<ActionResult>{
        let result = new ActionData();
        this.status = STATUS.BridgeLocked;

        const getMerkleRootResult = await this.ethereumBridge.getMerkleRoot();
        if(getMerkleRootResult.error){
            result.error = getMerkleRootResult.error;
            return result;
        }
        if(getMerkleRootResult.data! == root){
            this.status = STATUS.EthereumUpdateUnconfirmed;
        }

        return result;
    }

    private async ethereumUpdateUnconfirmedHandle(sn:BridgeSnapshoot):Promise<ActionResult>{
        let result = new ActionData<BridgeSnapshoot>();

        try {
            const ebLastSnapshootResult = await this.ethereumBridge.getLastSnapshoot();
            if(ebLastSnapshootResult.error){
                result.error = ebLastSnapshootResult.error;
                return result;
            }

            const confirmTxResult = await this.ethereumVerifier.checkTxStatus(ebLastSnapshootResult.data!.txid,ebLastSnapshootResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }
            if(confirmTxResult.data == "pendding"){
                this.status = STATUS.EthereumUpdateUnconfirmed;
                result.data = ebLastSnapshootResult.data!.sn;
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.EthereumUpdateConfirmed;
                let index = sn.chains.findIndex(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;});
                if(index == -1){
                    const chainInfo = ebLastSnapshootResult.data!.sn.chains.find(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})!;
                    sn.chains.push(chainInfo);
                } else {
                    sn.chains[index].endBlockNum = ebLastSnapshootResult.data!.blocknum;
                }
                await this.snapshootModel.save([sn]);
                result.data = ebLastSnapshootResult.data!.sn;
                return result;
            }

        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async ethereumUpdateConfirmed():Promise<ActionResult>{
        this.status = STATUS.Finished;
        return new ActionData<string>();;
    }

    private async buildNewSnapshoot(parent:string):Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();

        const localDataResult = await this.loadLocalSnapshoot(parent);
        if(localDataResult.error){
            result.error = localDataResult.error;
            return result;
        }
        const lastLockedResult = await this.getLastLocked();
        if(lastLockedResult.error){
            result.error = lastLockedResult.error;
            return result;
        }
        const parentSn = localDataResult.data!.sn;
        const ledgers = localDataResult.data!.ledgers;
        const lockInfo = lastLockedResult.data!;
        let newSnapshoot:BridgeSnapshoot = {
            parentMerkleRoot:parentSn.merkleRoot,
            merkleRoot:ZeroRoot(),
            chains:[
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    beginBlockNum:parentSn.chains.find(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId})!.endBlockNum,
                    lockedBlockNum:lockInfo.vechain,
                    endBlockNum:lockInfo.vechain
                },
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    beginBlockNum:parentSn.chains.find(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId})!.endBlockNum,
                    lockedBlockNum:lockInfo.ethereum,
                    endBlockNum:lockInfo.ethereum
                }
            ]
        }

        const getTxsResult = await this.getTxsBySnapshoot(newSnapshoot);
        if(getTxsResult.error){
            result.error = getTxsResult.error;
            return result;
        }

        let storage = new BridgeStorage(parentSn,this.env.tokenInfo,ledgers);
        const updateResult = await storage.updateLedgers(getTxsResult.data!);
        if(updateResult.error){
            result.copyBase(updateResult);
            return result;
        }
        const treenode = storage.buildTree(newSnapshoot.chains,newSnapshoot.parentMerkleRoot);
        newSnapshoot.merkleRoot = treenode.nodeHash;

        const snsaveResult = await this.snapshootModel.save([newSnapshoot]);
        const ledgersaveResult = await this.ledgerModel.save(newSnapshoot.merkleRoot,storage.ledgerCache);
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

        result.data = newSnapshoot;
        return result;
    }

    private async getLastLocked():Promise<ActionData<{ethereum:number,vechain:number}>>{
        let result = new ActionData<{ethereum:number,vechain:number}>();
        const vechainLastResult = await this.vechainBridge.getLastLocked();
        const ethereumLastResult = await this.ethereumBridge.getLastLocked();

        if(vechainLastResult.error){
            result.error = vechainLastResult.error;
            return result;
        }

        if(ethereumLastResult.error){
            result.error = ethereumLastResult.error;
            return result;
        }
        result.data = {ethereum:ethereumLastResult.data!.blocknum,vechain:vechainLastResult.data!.blocknum};
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

    private async getTxsBySnapshoot(sn:BridgeSnapshoot):Promise<ActionData<BridgeTx[]>>{
        let result = new ActionData<BridgeTx[]>();
        result.data = new Array();
        const vechain = sn.chains.filter( chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})[0];
        const ethereum = sn.chains.filter( chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})[0];

        const scanVeChainResult = await this.vechainBridge.scanTxs(vechain.beginBlockNum,vechain.lockedBlockNum - 1);
        if(scanVeChainResult.error){
            result.error = scanVeChainResult.error;
            return result;
        }

        const scanEthereumResult = await this.ethereumBridge.scanTxs(ethereum.beginBlockNum,ethereum.lockedBlockNum -1);
        if(scanEthereumResult.error){
            result.error = scanEthereumResult.error;
            return result;
        }

        const vechainTxs = (scanVeChainResult as ActionData<BridgeTx[]>).data!;
        const ethereumTxs = (scanEthereumResult as ActionData<BridgeTx[]>).data!;

        result.data = result.data.concat(vechainTxs,ethereumTxs);
        return result;
    }

    private signEncodePacked(opertion:string,hash:string):Buffer{
        let hashBuffer = hash != ZeroRoot() ? Buffer.from(hash.substring(2),'hex') : Buffer.alloc(32);
        let encode = Buffer.concat([
            Buffer.from(opertion),
            hashBuffer
        ]);
        return keccak256(encode);
    }

    private env:any;
    private config:any;
    private readonly processTimeout = 60 * 30 * 1000;
    private wallet:SimpleWallet;
    private vechainBridge:VeChainBridgeHead;
    private ethereumBridge:EthereumBridgeHead;
    private snapshootModel:SnapshootModel;
    private vechainVerifier:VeChainBridgeVerifiter;
    private ethereumVerifier:EthereumBridgeVerifier;
    private ledgerModel:LedgerModel;
    private BridgeTxModel:BridgeTxModel;
    private connex:Framework;
    private status:STATUS;
}

enum STATUS {
    Entry = "Entry",
    BridgeNoLock = "BridgeNoLock",
    BridgeLocked = "BridgeLocked",
    VeChainUpdateTxSend = "VeChainUpdateTxSend",
    VeChainUpdateUnconfirmed = "VeChainUpdateUnconfirmed",
    VeChainUpdateConfirmed = "VeChainUpdateConfirmed",
    EthereumNoUpdate = "EthereumNoUpdate",
    EthereumUpdateTxSend = "EthereumUpdateTxSend",
    EthereumUpdateUnconfirmed = "EthereumUpdateUnconfirmed",
    EthereumUpdateConfirmed = "EthereumUpdateConfirmed",
    Finished = "Finished"
}