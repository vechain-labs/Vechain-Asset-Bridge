import { SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import { getReceipt } from "myvetools/dist/connexUtils";
import { keccak256 } from "thor-devkit";
import Web3 from "web3";
import BridgeStorage from "./common/bridgeStorage";
import { EthereumBridgeHead } from "./common/ethereumBridgeHead";
import { EthereumBridgeVerifier } from "./common/ethereumBridgeVerifier";
import { EthereumCommon } from "./common/ethereumCommon";
import BridgeTxModel from "./common/model/bridgeTxModel";
import LedgerModel from "./common/model/ledgerModel";
import { SnapshootModel } from "./common/model/snapshootModel";
import { ActionData, ActionResult, PromiseActionResult } from "./common/utils/components/actionResult";
import { sleep } from "./common/utils/sleep";
import { BridgeLedger } from "./common/utils/types/bridgeLedger";
import { BridgeSnapshoot, ZeroRoot } from "./common/utils/types/bridgeSnapshoot";
import { BridgeTx } from "./common/utils/types/bridgeTx";
import { Verifier } from "./common/utils/types/verifier";
import { VeChainBridgeHead } from "./common/vechainBridgeHead";
import { VeChainBridgeVerifiter } from "./common/vechainBridgeVerifier";
import { VeChainCommon } from "./common/vechainCommon";

class TxStatusCache {
    public veChainLockTx = {txid:"",blockNum:0,txStatus:""}
    public ethereumLockTx = {txid:"",blockNum:0,txStatus:""}
    public veChainUpdateTx = {txid:"",blockNum:0,txStatus:""}
    public ethereumUpdateTx = {txid:"",blockNum:0,txStatus:""}
}

class BridgeStatusCache {
    public parentMerkleroot:string = "";
    public vechainLock:boolean = false;
    public ethereumLock:boolean = false;
    public vechainMerkleroot:string = "";
    public ethereumMerkleroot:string = "";
    public merklerootMatch():boolean {
        return this.vechainMerkleroot == this.ethereumMerkleroot;
    }
    public newSnapshoot:BridgeSnapshoot|undefined;
}

enum STATUS {
    Entry = "Entry",
    VeChainNeedToLock = "VeChainNeedToLock",
    VeChainLockTxSent = "VeChainLockTxSent",
    VeChainLockedUnconfirmed = "VeChainLockedUnconfirmed",
    VeChainLockedConfirmed = "VeChainLockedConfirmed",
    EthereumNeedToLock = "EthereumNeedToLock",
    EthereumLockTxSent = "EthereumLockTxSent",
    EthereumLockedUnconfirmed = "EthereumLockedUnconfirmed",
    EthereumLockedConfirmed = "EthereumLockedConfirmed",
    VeChainNeedToUpdate = "VeChainNeedToUpdate",
    VeChainUpdateTxSent = "VeChainUpdateTxSent",
    VeChainUpdateUnconfirmed = "VeChainUpdateUnconfirmed",
    VeChainUpdateConfirmed = "VeChainUpdateConfirmed",
    EthereumNeedToUpdate = "EthereumNeedToUpdate",
    EthereumUpdateTxSent = "EthereumUpdateTxSent",
    EthereumUpdateUnconfirmed = "EthereumUpdateUnconfirmed",
    EthereumUpdateConfirmed = "EthereumUpdateConfirmed",
    UnmanageableStatus = "UnmanageableStatus",
    Finished = "Finished"
}

export class BridgePackTask {
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = env.connex;
        this.wallet = env.wallet;
        this.web3 = env.web3;
        this.vechainCommon = new VeChainCommon(env);
        this.vechainBridge = new VeChainBridgeHead(env);
        this.vechainVerifier = new VeChainBridgeVerifiter(env);
        this.ethereumCommon = new EthereumCommon(env);
        this.ethereumBridge = new EthereumBridgeHead(env);
        this.ethereumVerifier = new EthereumBridgeVerifier(env);
        this.snapshootModel = new SnapshootModel(env);
        this.ledgerModel = new LedgerModel(env);
        this.bridgeTxModel = new BridgeTxModel(env);
        this.status = STATUS.Entry;
    }

    private readonly loopsleep = 5 * 1000;
    private readonly processTimeout = 60 * 10 * 1000;
    private readonly wattingBlock = 6;
    private env:any;
    private config:any;
    private txCache:TxStatusCache = new TxStatusCache();
    private bridgeStatusCache:BridgeStatusCache = new BridgeStatusCache();
    private vechainCommon:VeChainCommon;
    private vechainBridge:VeChainBridgeHead;
    private vechainVerifier:VeChainBridgeVerifiter;
    private ethereumCommon:EthereumCommon;
    private ethereumBridge:EthereumBridgeHead;
    private ethereumVerifier:EthereumBridgeVerifier;
    private connex:Framework;
    private web3:Web3;
    private wallet:SimpleWallet;
    private snapshootModel:SnapshootModel;
    private ledgerModel:LedgerModel;
    private bridgeTxModel:BridgeTxModel;
    private _status:STATUS = STATUS.Entry;

    private get status():STATUS {
        return this._status;
    }

    private set status(value:STATUS){
        if(this._status != value){
            console.debug(`Status changed ${this._status} --> ${value}`);
        }
        this._status = value;
    }

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();
        const beginTs = (new Date()).getTime();
        console.info(`Bridge lock process begin at ${beginTs} (${(new Date()).toString()})`);

        this._status = STATUS.Entry;
        while(beginTs + this.processTimeout >= (new Date()).getTime()){
            let processResult = new ActionResult();
            switch(this.status){
                case STATUS.Entry:
                    processResult = await this.entryHandle();
                    break;
                case STATUS.VeChainNeedToLock:
                    processResult = await this.veChainNeedToLockHandle();
                    break;
                case STATUS.VeChainLockTxSent:
                    processResult = await this.veChainLockTxSentHanle();
                    break;
                case STATUS.VeChainLockedUnconfirmed:
                    processResult = await this.veChainLockedUnconfirmedHandle();
                    break;
                case STATUS.VeChainLockedConfirmed:
                    processResult = await this.veChainLockedConfirmedHandle();
                    break;
                case STATUS.EthereumNeedToLock:
                    processResult = await this.ethereumNeedToLockHandle();
                    break;
                case STATUS.EthereumLockTxSent:
                    processResult = await this.ethereumLockTxSentHandle();
                    break;
                case STATUS.EthereumLockedUnconfirmed:
                    processResult = await this.ethereumLockedUnconfirmedHandle();
                    break;
                case STATUS.EthereumLockedConfirmed:
                    processResult = await this.ethereumLockedConfirmedHandle();
                    break;
                case STATUS.VeChainNeedToUpdate:
                    processResult = await this.veChainNeedToUpdateHandle();
                    break;
                case STATUS.VeChainUpdateTxSent:
                    processResult = await this.veChainUpdateTxSentHandle();
                    break;
                case STATUS.VeChainUpdateUnconfirmed:
                    processResult = await this.veChainUpdateUnconfirmedHandle();
                    break;
                case STATUS.VeChainUpdateConfirmed:
                    processResult = await this.veChainUpdateConfirmedHandle();
                    break;
                case STATUS.EthereumNeedToUpdate:
                    processResult = await this.ethereumNeedToUpdateHandle();
                    break;
                case STATUS.EthereumUpdateTxSent:
                    processResult = await this.ethereumUpdateTxSentHandle();
                    break;
                case STATUS.EthereumUpdateUnconfirmed:
                    processResult = await this.ethereumUpdateUnconfirmedHandle();
                    break;
                case STATUS.EthereumUpdateConfirmed:
                    processResult = await this.ethereumUpdateConfirmedHandle();
                    break;
                case STATUS.Finished:
                    console.info(`Bridge update merkelroot process end at ${(new Date()).getTime()} (${(new Date()).toString()})`);
                    return result;
                case STATUS.UnmanageableStatus:
                    console.error(`the bridge unmanageableStatus, bridgeStatus: ${JSON.stringify(this.bridgeStatusCache)} txCache: ${JSON.stringify(this.txCache)}`);
                    await sleep(this.loopsleep);
                    return result;
            }
            if(processResult.error){
                console.warn(`process error: ${processResult.error}`);
                await sleep(this.loopsleep);
            }
        }
        return result;
    }

    private async refreshStatus():Promise<ActionResult>{
        let result = new ActionResult();

        const loadStatusResult = await this.loadBridgeStatus();
        if(loadStatusResult.error){
            result.error = loadStatusResult.error;
            return result;
        }

        //tx status handle
        if(this.txCache.veChainLockTx.txStatus == "pending"){
            this.status = STATUS.VeChainLockedUnconfirmed;
            return result;
        }

        if(this.txCache.ethereumLockTx.txStatus == "pending"){
            this.status = STATUS.EthereumLockedUnconfirmed;
            return result;
        }

        if(this.txCache.veChainUpdateTx.txStatus == "pending"){
            this.status = STATUS.VeChainUpdateUnconfirmed;
            return result;
        }

        if(this.txCache.ethereumUpdateTx.txStatus == "pending"){
            this.status = STATUS.EthereumUpdateUnconfirmed;
            return result;
        }

        if(this.bridgeStatusCache.newSnapshoot == undefined){
            const getLastSnapshootResult = await this.vechainBridge.getLastSnapshoot();
            if(getLastSnapshootResult.error){
                result.error = getLastSnapshootResult.error;
                return result;
            }
            this.bridgeStatusCache.newSnapshoot = getLastSnapshootResult.data!.sn;
        }

        //bridge status handle
        if(this.bridgeStatusCache.vechainLock == false && this.bridgeStatusCache.ethereumLock == false && this.bridgeStatusCache.merklerootMatch() 
            && this.bridgeStatusCache.vechainMerkleroot == this.bridgeStatusCache.parentMerkleroot){
            this.status = STATUS.VeChainNeedToLock;
            return result;
        } else if(this.bridgeStatusCache.vechainLock == true && this.bridgeStatusCache.ethereumLock == false && this.bridgeStatusCache.merklerootMatch()){
            this.status = STATUS.EthereumNeedToLock;
            return result;
        }else if(this.bridgeStatusCache.vechainLock == true && this.bridgeStatusCache.ethereumLock == true && this.bridgeStatusCache.merklerootMatch()){
            this.status = STATUS.VeChainNeedToUpdate;
            return result;
        }else if(this.bridgeStatusCache.vechainLock == false && this.bridgeStatusCache.ethereumLock == true 
            && this.bridgeStatusCache.ethereumMerkleroot == this.bridgeStatusCache.newSnapshoot.parentMerkleRoot){
            this.status = STATUS.EthereumNeedToUpdate;
            return result;
        }else if(this.bridgeStatusCache.vechainLock == false && this.bridgeStatusCache.ethereumLock == false && this.bridgeStatusCache.merklerootMatch() 
            && this.bridgeStatusCache.vechainMerkleroot != this.bridgeStatusCache.parentMerkleroot){
            this.status = STATUS.Finished;
            return result;
        } else {
            this.status = STATUS.UnmanageableStatus;
            return result;
        }
    }

    private async loadBridgeStatus():Promise<ActionResult>{
        let result = new ActionResult();

        const vbLockedPromise = this.vechainBridge.getLockedStatus();
        const ebLockedPromise = this.ethereumBridge.getLockedStatus();
        const vbMerklerootPromise = this.vechainBridge.getMerkleRoot();
        const ebMerklerootPromise = this.ethereumBridge.getMerkleRoot();

        const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vbLockedPromise,ebLockedPromise,vbMerklerootPromise,ebMerklerootPromise]));
        if(promiseResult.error){
            result.error = promiseResult.error;
            return result;
        }

        this.bridgeStatusCache.vechainLock = (promiseResult.data!.succeed[0] as ActionData<boolean>).data!;
        this.bridgeStatusCache.ethereumLock = (promiseResult.data!.succeed[1] as ActionData<boolean>).data!;
        this.bridgeStatusCache.vechainMerkleroot = (promiseResult.data!.succeed[2] as ActionData<string>).data!;
        this.bridgeStatusCache.ethereumMerkleroot = (promiseResult.data!.succeed[3] as ActionData<string>).data!;

        if(this.txCache.veChainLockTx.txid == ""){
            const lastLockedResult = await this.vechainBridge.getLastLocked();
            if(lastLockedResult.error){
                result.error = lastLockedResult.error;
                return result;
            }
            this.txCache.veChainLockTx.txid = lastLockedResult.data?.txid || "";
            this.txCache.veChainLockTx.blockNum = lastLockedResult.data?.blocknum || 0;
            if(this.txCache.veChainLockTx.txid != ""){
                const txStatusResult = await this.vechainCommon.checkTxStatus(this.txCache.veChainLockTx.txid,this.txCache.veChainLockTx.blockNum);
                if(txStatusResult.error){
                    result.error = txStatusResult.error;
                    return result;
                }
                this.txCache.veChainLockTx.txStatus = txStatusResult.data!;
            }
        }
        
        if(this.txCache.ethereumLockTx.txid == ""){
            const lastLockedResult = await this.ethereumBridge.getLastLocked();
            if(lastLockedResult.error){
                result.error = lastLockedResult.error;
                return result;
            }
            this.txCache.ethereumLockTx.txid = lastLockedResult.data?.txhash || "";
            this.txCache.ethereumLockTx.blockNum = lastLockedResult.data?.blocknum || 0;
            if(this.txCache.ethereumLockTx.txid != ""){
                const txStatusResult = await this.ethereumCommon.checkTxStatus(this.txCache.ethereumLockTx.txid,this.txCache.ethereumLockTx.blockNum);
                if(txStatusResult.error){
                    result.error = txStatusResult.error;
                    return result;
                }
                this.txCache.ethereumLockTx.txStatus = txStatusResult.data!;
            }
        }

        if(this.txCache.veChainUpdateTx.txid == ""){
            const lastSnapshootResult = await this.vechainBridge.getLastSnapshoot();
            if(lastSnapshootResult.error){
                result.error = lastSnapshootResult.error;
                return result;
            }
            this.txCache.veChainUpdateTx.txid = lastSnapshootResult.data?.txid || "";
            this.txCache.veChainUpdateTx.blockNum = lastSnapshootResult.data?.blocknum || 0;
            if(this.txCache.veChainUpdateTx.txid != ""){
                const txStatusResult = await this.vechainCommon.checkTxStatus(this.txCache.veChainUpdateTx.txid,this.txCache.veChainUpdateTx.blockNum);
                if(txStatusResult.error){
                    result.error = txStatusResult.error;
                    return result;
                }
                this.txCache.veChainUpdateTx.txStatus = txStatusResult.data!;
            }
        }

        if(this.txCache.ethereumUpdateTx.txid == ""){
            const lastSnapshootResult = await this.ethereumBridge.getLastSnapshoot();
            if(lastSnapshootResult.error){
                result.error = lastSnapshootResult.error;
                return result;
            }
            this.txCache.ethereumUpdateTx.txid = lastSnapshootResult.data?.txid || "";
            this.txCache.ethereumUpdateTx.blockNum = lastSnapshootResult.data?.blocknum || 0;
            if(this.txCache.ethereumUpdateTx.txid != ""){
                const txStatusResult = await this.ethereumCommon.checkTxStatus(this.txCache.ethereumUpdateTx.txid,this.txCache.ethereumUpdateTx.blockNum);
                if(txStatusResult.error){
                    result.error = txStatusResult.error;
                    return result;
                }
                this.txCache.veChainUpdateTx.txStatus = txStatusResult.data!;
            }
        }

        return result;
    }

    private async entryHandle():Promise<ActionResult>{
        let result = new ActionResult();
        this.txCache = new TxStatusCache();
        this.bridgeStatusCache = new BridgeStatusCache();
        const parentMerklerootResult = await this.vechainBridge.getMerkleRoot();
        if(parentMerklerootResult.error){
            result.error = parentMerklerootResult.error;
            return result;
        }
        this.bridgeStatusCache.parentMerkleroot = parentMerklerootResult.data!;
        const initStatusResult = await this.refreshStatus();
        if(initStatusResult.error){
            result.error = initStatusResult.error;
            return result;
        }
        return result;
    }

    private async veChainNeedToLockHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const getMerkleRootRsult = await this.vechainBridge.getMerkleRoot();
            if(getMerkleRootRsult.error){
                console.warn(`Get vechain Merkleroot error: ${getMerkleRootRsult.error}`);
            }
            const root = getMerkleRootRsult.data!;
            const getLockBridgeProposalResult = await this.vechainVerifier.getLockBridgeProposal(root);
            if(getLockBridgeProposalResult.error){
                console.warn(`Get vechain LockBridgeProposal error: ${getLockBridgeProposalResult.error}`);
            }
            const msgHash = this.signEncodePacked("lockBridge",root);
            const sign = "0x" + (await this.wallet.list[0].sign(msgHash)).toString('hex');

            if(getLockBridgeProposalResult.data != undefined){
                const proposal = getLockBridgeProposalResult.data;
                if(proposal.executed){
                    this.status = STATUS.VeChainLockedUnconfirmed;
                    return result;
                }
                if(proposal.signatures != undefined && proposal.signatures.findIndex(item => {return item.toLocaleLowerCase() == sign.toLocaleLowerCase();}) != -1){
                    this.status = STATUS.VeChainLockTxSent;
                }
            }
            const lockBridgeResult =  await this.vechainVerifier.lockBridge(root);
            if(lockBridgeResult.error){
                console.warn(`Lock vechain Bridge error: ${lockBridgeResult.error}`);
            }
            const receipt = await getReceipt(this.connex,this.config.vechain.expiration,lockBridgeResult.data!);
            console.info(`Send vechain lock bridge, txid:${lockBridgeResult.data!}`);
            if(receipt.reverted == true){
                console.warn(`Send vechain lock bridge transaction reverted, txid:${lockBridgeResult.data!}`)
            }
            this.status = STATUS.VeChainLockTxSent;
            return result;
        } catch (error) {
            result.error = new Error(`VeChainNeedToLockHandle error: ${error}`);;
        }
        return result;
    }

    private async veChainLockTxSentHanle():Promise<ActionResult>{
        let result = new ActionResult();
        const getStatusResult = await this.vechainBridge.getLockedStatus();
        if(getStatusResult.error){
            result.error = getStatusResult.error;
            return result;
        }
        if(getStatusResult.data == true){
            this.status = STATUS.VeChainLockedUnconfirmed;
            return result;
        } else {
            this.status = STATUS.VeChainNeedToLock;
            await sleep(this.loopsleep);
            return result;
        }
    }

    private async veChainLockedUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const getLastLockedResult = await this.vechainBridge.getLastLocked();
        if(getLastLockedResult.error){
            result.error = getLastLockedResult.error;
            return result;
        }

        if(getLastLockedResult.data == undefined){
            await sleep(this.loopsleep);
            return result;
        }

        const txid = getLastLockedResult.data!.txid;
        const blockNum = getLastLockedResult.data!.blocknum;
        const confirmTxResult = await this.vechainVerifier.checkTxStatus(txid,blockNum);
        if(confirmTxResult.error){
            result.error = confirmTxResult.error;
            return result;
        }
        this.txCache.veChainLockTx.txid = txid;
        this.txCache.veChainLockTx.blockNum = blockNum;
        if(confirmTxResult.data == "pending"){
            this.status = STATUS.VeChainLockedUnconfirmed;
            this.txCache.veChainLockTx.txStatus = "pending";
            await sleep(this.loopsleep);   
        } else if (confirmTxResult.data == "confirmed"){
            this.status = STATUS.VeChainLockedConfirmed;
            this.txCache.veChainLockTx.txStatus = "confirmed";
        }
        return result;
    }

    private async veChainLockedConfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const refreshResult = await this.refreshStatus();
        if(refreshResult.error){
            result.error = refreshResult.error;
            return result;
        }
        return result;
    }

    private async ethereumNeedToLockHandle():Promise<ActionResult>{
        let result = new ActionResult();
        let beginBlock = (await this.web3.eth.getBlock('latest')).number;

        try {
            const getMerkleRootRsult = await this.ethereumBridge.getMerkleRoot();
            if(getMerkleRootRsult.error){
                console.warn(`Get ethereum Merkleroot error:${getMerkleRootRsult.error}`);
            }
            const root = getMerkleRootRsult.data!;

            const getEthereumProposalResult = await this.ethereumVerifier.getLockBridgeProposal(root);
            if(getEthereumProposalResult.error){
                result.error = getEthereumProposalResult.error;
                console.warn(`Get ethereum Proposal error:${getEthereumProposalResult.error}`);
            }

            if(getEthereumProposalResult.data && getEthereumProposalResult.data.executed){
                this.status = STATUS.EthereumLockedUnconfirmed;
                return result;
            }

            const getVeChainProposalResult = await this.vechainVerifier.getLockBridgeProposal(root);
            if(getVeChainProposalResult.error){
                console.warn(`ethereumNeedToLockHandle error: ${getVeChainProposalResult.error}`);
            }

            if(getVeChainProposalResult.data == undefined || getVeChainProposalResult.data.executed == false){
                this.status = STATUS.VeChainNeedToLock;
                return result;
            }

            const proposal = getVeChainProposalResult.data;

            let needSendLockTx = await this.needSendEthereumTx(root,beginBlock);
            if(needSendLockTx){
                const lockBridgeResult = await this.ethereumVerifier.lockBridge(root,proposal.signatures);
                if(lockBridgeResult.error){
                    console.warn(`Lock ethereum bridge error: ${lockBridgeResult.error}`);
                }
                this.status = STATUS.EthereumLockTxSent;
                return result;
            } else {
                this.status = STATUS.EthereumLockTxSent;
                return result;
            }   
        } catch (error) {
            result.error = new Error(`EthereumNeedToLockHandle error: ${error}`);;
        }
        return result;
    }

    private async ethereumLockTxSentHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const getStatusResult = await this.ethereumBridge.getLockedStatus();
        if(getStatusResult.error){
            result.error = getStatusResult.error;
            return result;
        }
        if(getStatusResult.data == true){
            this.status = STATUS.EthereumLockedUnconfirmed;
            return result;
        } else {
            this.status = STATUS.EthereumNeedToLock;
            await sleep(this.loopsleep);
            return result;
        }
    }

    private async ethereumLockedUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const ebLastLockedResult = await this.ethereumBridge.getLastLocked();
            if(ebLastLockedResult.error){
                result.error = ebLastLockedResult.error;
                return result;
            }

            if(ebLastLockedResult.data == undefined){
                return result;
            }

            const confirmTxResult = await this.ethereumVerifier.checkTxStatus(ebLastLockedResult.data!.txhash,ebLastLockedResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }
            this.txCache.ethereumLockTx.txid = ebLastLockedResult.data!.txhash;
            this.txCache.ethereumLockTx.blockNum = ebLastLockedResult.data!.blocknum;
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.EthereumLockedUnconfirmed;
                this.txCache.ethereumLockTx.txStatus = "pending";
                await sleep(this.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.EthereumLockedConfirmed;
                this.txCache.ethereumLockTx.txStatus = "confirmed";
                return result;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async ethereumLockedConfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const refreshResult = await this.refreshStatus();
        if(refreshResult.error){
            result.error = refreshResult.error;
            return result;
        }
        return result;
    }

    private async veChainNeedToUpdateHandle():Promise<ActionResult>{
        let result = new ActionResult();
        let newSnapshoot:BridgeSnapshoot|undefined;

        try {
            if(newSnapshoot == undefined){
                const getMerkleRootRsult = await this.vechainBridge.getMerkleRoot();
                if(getMerkleRootRsult.error){
                    console.warn(`Get vechain merkleroot error:${getMerkleRootRsult.error}`);
                }
                const root = getMerkleRootRsult.data!;
                const buildNewSnResult = await this.buildNewSnapshoot(root);
                if(buildNewSnResult.error){
                    console.warn(`Build new snapshoot error:${buildNewSnResult.error}`);
                }
                newSnapshoot = buildNewSnResult.data!;
            }
            const getUpdateProposalResult = await this.vechainVerifier.getMerkleRootProposals(newSnapshoot.merkleRoot);
            if(getUpdateProposalResult.error){
                console.warn(`Get vechain merkleroot proposals error: ${getUpdateProposalResult.error}`);
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
                    this.status = STATUS.VeChainUpdateTxSent;
                    return result;
                }
            }
            const updateRootResult = await this.vechainVerifier.updateBridgeMerkleRoot(newSnapshoot.parentMerkleRoot,newSnapshoot.merkleRoot);
            if(updateRootResult.error){
                console.warn(`vechain bridge update error: ${updateRootResult.error}`);
            }
            const receipt = await getReceipt(this.connex,this.config.vechain.expiration,updateRootResult.data!);
            console.info(`send vechain update merkleroot, txid:${updateRootResult.data!}`);
            if(receipt.reverted == true){
                console.warn(`send update merkleroot transaction reverted, txid:${updateRootResult.data!}`);
            }
            this.bridgeStatusCache.newSnapshoot = newSnapshoot;
            this.status = STATUS.VeChainUpdateTxSent;
        } catch (error) {
            result.error = new Error(`VeChainNeedToUpdateHandle error : ${error}`);
        }
        return result;
    }

    private async veChainUpdateTxSentHandle():Promise<ActionResult>{
        let result = new ActionResult();

        const getMerkleRootResult = await this.vechainBridge.getMerkleRoot();
        if(getMerkleRootResult.error){
            result.error = getMerkleRootResult.error;
            return result;
        }
        if(getMerkleRootResult.data! == this.bridgeStatusCache.newSnapshoot!.merkleRoot){
             this.status = STATUS.VeChainUpdateUnconfirmed;
        } else {
            this.status = STATUS.VeChainNeedToUpdate;
            await sleep(this.loopsleep);
        }

        return result;
    }

    private async veChainUpdateUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionData<BridgeSnapshoot>();

        try {
            const vbLastSnapshootResult = await this.vechainBridge.getLastSnapshoot();
            if(vbLastSnapshootResult.error){
                result.error = vbLastSnapshootResult.error;
                return result;
            }

            if(vbLastSnapshootResult.data == undefined){
                return result;
            }

            const confirmTxResult = await this.vechainVerifier.checkTxStatus(vbLastSnapshootResult.data!.txid,vbLastSnapshootResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }

            this.txCache.veChainUpdateTx.txid = vbLastSnapshootResult.data!.txid;
            this.txCache.veChainUpdateTx.blockNum = vbLastSnapshootResult.data!.blocknum;
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.VeChainUpdateUnconfirmed;
                result.data = vbLastSnapshootResult.data!.sn;
                this.txCache.veChainUpdateTx.txStatus = "pending";
                await sleep(this.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.VeChainUpdateConfirmed;
                this.txCache.veChainUpdateTx.txStatus = "confirmed";
                let index = this.bridgeStatusCache.newSnapshoot!.chains.findIndex(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;});
                if(index == -1){
                    let chainInfo = vbLastSnapshootResult.data!.sn.chains.find(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})!;
                    chainInfo.endBlockNum = vbLastSnapshootResult.data!.blocknum;
                    this.bridgeStatusCache.newSnapshoot!.chains.push(chainInfo);
                } else {
                    this.bridgeStatusCache.newSnapshoot!.chains[index].endBlockNum = vbLastSnapshootResult.data!.blocknum;
                }
                await this.snapshootModel.save([this.bridgeStatusCache.newSnapshoot!]);
                result.data = vbLastSnapshootResult.data!.sn;
                return result;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async veChainUpdateConfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const refreshResult = await this.refreshStatus();
        if(refreshResult.error){
            result.error = refreshResult.error;
            return result;
        }
        return result;
    }

    private async ethereumNeedToUpdateHandle():Promise<ActionResult>{
        let result = new ActionResult();
        let beginBlock = await this.web3.eth.getBlockNumber();

        try {
            const getebProposalResult = await this.ethereumVerifier.getUpdateMerkleRootProposal(this.bridgeStatusCache.newSnapshoot!.merkleRoot);
            if(getebProposalResult.error){
                result.error = getebProposalResult.error;
                return result;
            }

            if(getebProposalResult.data && getebProposalResult.data.executed){
                this.status = STATUS.EthereumUpdateUnconfirmed;
                return result;
            }

            const getVeChainProposalResult = await this.vechainVerifier.getMerkleRootProposals(this.bridgeStatusCache.newSnapshoot!.merkleRoot);
            if(getVeChainProposalResult.error || getVeChainProposalResult.data == undefined){
                this.status = STATUS.Entry;
                return result;
            }

            const proposal = getVeChainProposalResult.data;
            if(proposal.executed == false){
                this.status = STATUS.Entry;
                return result;
            }

            let needSendLockTx = await this.needSendEthereumTx(this.bridgeStatusCache.newSnapshoot!.merkleRoot,beginBlock);
             if(needSendLockTx){
                 try {
                     const updateResult = await this.ethereumVerifier.updateBridgeMerkleRoot(this.bridgeStatusCache.newSnapshoot!.parentMerkleRoot,proposal.hash,proposal.signatures);
                     console.info(`send ethereum update merkleroot, txid:${updateResult.data!}`);
                     if(updateResult.error){
                         console.warn(`send ethereum update merkleroot error: ${updateResult.error}`);
                     } else {
                         this.status = STATUS.EthereumUpdateTxSent;
                         return result;
                     }
                 } catch (error) {
                    result.error = error;
                 }
             } else {
                 this.status = STATUS.EthereumUpdateTxSent;
             }
        } catch (error) {
            result.error = new Error(`lock ethereum bridge retry exceeded`);
        }
        return result;
    }

    private async ethereumUpdateTxSentHandle():Promise<ActionResult>{
        let result = new ActionResult();

        const getMerkleRootResult = await this.ethereumBridge.getMerkleRoot();
        if(getMerkleRootResult.error){
            result.error = getMerkleRootResult.error;
            return result;
        }
        if(getMerkleRootResult.data! == this.bridgeStatusCache.newSnapshoot!.merkleRoot){
            this.status = STATUS.EthereumUpdateUnconfirmed;
        } else {
            this.status = STATUS.EthereumNeedToUpdate;
            await sleep(this.loopsleep);
        }

        return result;
    }

    private async ethereumUpdateUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionData<BridgeSnapshoot>();

        try {
            const ebLastSnapshootResult = await this.ethereumBridge.getLastSnapshoot();
            if(ebLastSnapshootResult.error){
                result.error = ebLastSnapshootResult.error;
                return result;
            }

            if(ebLastSnapshootResult.data == undefined){
                return result;
            }

            const confirmTxResult = await this.ethereumVerifier.checkTxStatus(ebLastSnapshootResult.data!.txid,ebLastSnapshootResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }

            this.txCache.ethereumUpdateTx.txid = ebLastSnapshootResult.data!.txid;
            this.txCache.ethereumUpdateTx.blockNum = ebLastSnapshootResult.data!.blocknum;
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.EthereumUpdateUnconfirmed;
                result.data = ebLastSnapshootResult.data!.sn;
                this.txCache.ethereumUpdateTx.txStatus = "pending";
                await sleep(this.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.EthereumUpdateConfirmed;
                this.txCache.ethereumUpdateTx.txStatus = "confirmed";
                let index = this.bridgeStatusCache.newSnapshoot!.chains.findIndex(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;});
                if(index == -1){
                    let chainInfo = ebLastSnapshootResult.data!.sn.chains.find(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})!;
                    chainInfo.endBlockNum = ebLastSnapshootResult.data!.blocknum;
                    this.bridgeStatusCache.newSnapshoot!.chains.push(chainInfo);
                } else {
                    this.bridgeStatusCache.newSnapshoot!.chains[index].endBlockNum = ebLastSnapshootResult.data!.blocknum;
                }
                await this.snapshootModel.save([this.bridgeStatusCache.newSnapshoot!]);
                result.data = ebLastSnapshootResult.data!.sn;
                return result;
            }

        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async ethereumUpdateConfirmedHandle():Promise<ActionResult>{
        this.status = STATUS.Finished;
        this.bridgeStatusCache.parentMerkleroot = this.bridgeStatusCache.newSnapshoot!.merkleRoot;
        return new ActionResult();
    }

    private signEncodePacked(opertion:string,hash:string):Buffer{
        let hashBuffer = hash != ZeroRoot() ? Buffer.from(hash.substring(2),'hex') : Buffer.alloc(32);
        let encode = Buffer.concat([
            Buffer.from(opertion),
            hashBuffer
        ]);
        return keccak256(encode);
    }

    private async needSendEthereumTx(root:string,beginBlock:number):Promise<boolean>{
        let arr = new Array<{addr:string,hash:string}>();
        for(const verifier of (this.env.verifiers as Array<Verifier>)){
            let data = Buffer.concat([
                Buffer.from(root),
                Buffer.from(verifier.verifier)
            ]);
            let hash = "0x" + keccak256(data).toString('hex');
            arr.push({addr:verifier.verifier,hash:hash});
        }
        let sortArr = arr.sort((l,r) => {return (BigInt(l.hash) >= BigInt(r.hash)) ? 1 : -1;});

        const index = sortArr.findIndex( item => {return item.addr.toLowerCase() == this.wallet.list[0].address.toLocaleLowerCase();});
        if(index == -1){
            return false;
        } else {
            const latestBlock = await this.web3.eth.getBlockNumber();
            if((beginBlock + this.wattingBlock * index) <= latestBlock && (beginBlock + this.wattingBlock * (index + 1)) > latestBlock){
                return true;
            }
        }
        return false;
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
        const swaptxsaveResult = await this.bridgeTxModel.saveBridgeTxs(getTxsResult.data || []);
        const packinglogsaveResult = await this.snapshootModel.savePackingLog(newSnapshoot.merkleRoot,getTxsResult.data || []);

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

        if(packinglogsaveResult.error){
            result.copyBase(packinglogsaveResult);
            return result;
        }

        result.data = newSnapshoot;
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
}