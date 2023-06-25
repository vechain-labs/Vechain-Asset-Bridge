import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import { EthereumBridgeCore } from "./common/ethereum/ethereumBridgeCore";
import { EthereumCommon } from "./common/ethereum/ethereumCommon";
import BlockIndexModel from "./common/model/blockIndexModel";
import { ActionData, ActionResult, PromiseActionResult } from "./common/utils/components/actionResult";
import { sleep } from "./common/utils/sleep";
import { BridgeSnapshoot, ChainInfo, ZeroRoot } from "./common/utils/types/bridgeSnapshoot";
import { HashEvent } from "./common/utils/types/hashEvent";
import { VeChainBridgeCore } from "./common/vechain/vechainBridgeCore";
import { VeChainCommon } from "./common/vechain/vechainCommon";
import BridgeStorage from "./common/utils/bridgeStorage";
import { SnapshootModel } from "./common/model/snapshootModel";
import { VeChainBridgeValidator } from "./common/vechain/vechainBridgeValidator";
import { keccak256, RLP } from "thor-devkit";
import { SimpleWallet } from "@vechain/connex-driver";
import { getReceipt } from "myvetools/dist/connexUtils";
import { EthereumBridgeValidator } from "./common/ethereum/ethereumBridgeValidator";
import { Validator } from "./common/utils/types/validator";

class TxStatusCache {
    public vechainUpdateRootTx = {txid:"",blocknum:0,txStatus:""};
    public ethereumUpdateRootTx = {txid:"",blocknum:0,txStatus:""};
}

class BridgeStatusCache {
    public parentMerkleroot:string = "";
    public vechainMerkleroot:string = "";
    public ethereumMerkleroot:string = "";
    public merklerootMatch():boolean {
        return this.vechainMerkleroot == this.ethereumMerkleroot;
    }
    public newSnapshoot:BridgeSnapshoot|undefined;
}

enum STATUS {
    Entry = "Entry",
    WaittingPackStep = "WaittingPackStep",
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
        this.web3 = env.web3;
        this.wallet = env.wallet;
        this.status = STATUS.Entry;
        this.vechainCommon = new VeChainCommon(env);
        this.ethereumCommon = new EthereumCommon(env);
        this.vechainBridgeCore = new VeChainBridgeCore(env);
        this.ethereumBridgeCore = new EthereumBridgeCore(env);
        this.blockIndexModel = new BlockIndexModel(env);
        this.snapshootModel = new SnapshootModel(env);
        this.vechainBridgeValidator = new VeChainBridgeValidator(env);
        this.ethereumBridgeValidator = new EthereumBridgeValidator(env);
    }


    private readonly loopsleep = 5 * 1000;
    private readonly processTimeout = 60 * 10 * 1000;
    private readonly wattingBlock = 6;
    private env:any;
    private config:any;
    private connex:Framework;
    private web3:Web3;
    private wallet:SimpleWallet;
    private txCache:TxStatusCache = new TxStatusCache();
    private bridgeStatusCache:BridgeStatusCache = new BridgeStatusCache();
    private _status:STATUS = STATUS.Entry;
    private vechainCommon:VeChainCommon;
    private ethereumCommon:EthereumCommon;
    private vechainBridgeCore:VeChainBridgeCore;
    private ethereumBridgeCore:EthereumBridgeCore;
    private blockIndexModel:BlockIndexModel;
    private snapshootModel:SnapshootModel;
    private vechainBridgeValidator:VeChainBridgeValidator;
    private ethereumBridgeValidator:EthereumBridgeValidator;

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

        const localSNResult = await this.snapshootModel.getLastSnapshoot();
        if(localSNResult.error){
            result.error = localSNResult.error;
            return result;
        }

        const chainInfo = localSNResult.data!.chains.find(i => {return i.chainName == this.config.vechain.chainName && i.chainId == this.config.vechain.chainId;})!;
        const bestBlock = await this.connex.thor.status.head.number;
        if(bestBlock - chainInfo.endBlockNum < this.config.packstep){
            return result;
        }

        console.debug(`Bridge update process begin at ${beginTs} (${(new Date()).toString()})`);

        this._status = STATUS.Entry;
        while(beginTs + this.processTimeout >= (new Date()).getTime()){
            let processResult = new ActionResult();
            switch(this.status){
                case STATUS.Entry:
                    processResult = await this.entryHandle();
                    break;
                case STATUS.VeChainNeedToUpdate:
                    processResult = await this.vechainNeedToUpdateHandle();
                    break;
                case STATUS.VeChainUpdateTxSent:
                    processResult = await this.vechainUpdateTxSentHandle();
                    break;
                case STATUS.VeChainUpdateUnconfirmed:
                    processResult = await this.vechainUpdateUnconfirmedHandle();
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
                case STATUS.UnmanageableStatus:
                    console.error(`the bridge unmanageableStatus, bridgeStatus: ${JSON.stringify(this.bridgeStatusCache)} txCache: ${JSON.stringify(this.txCache)}`);
                    await sleep(this.loopsleep);
                    return result;
                case STATUS.Finished:
                    console.debug(`Bridge update merkelroot process end at ${(new Date()).getTime()} (${(new Date()).toString()})`);
                    return result;

            }
            if(processResult.error){
                console.warn(`process error: ${processResult.error}`);
                await sleep(this.loopsleep);
            }
        }

        return result;
    }

    private async entryHandle():Promise<ActionResult>{
        let result = new ActionResult();
        this.txCache = new TxStatusCache();
        this.bridgeStatusCache = new BridgeStatusCache();

        const parentMerklerootResult = await this.vechainBridgeCore.getLastSnapshoot();
        if(parentMerklerootResult.error){
            result.error = parentMerklerootResult.error;
            return result;
        }

        this.bridgeStatusCache.parentMerkleroot = parentMerklerootResult.data!.sn.merkleRoot;
        const initStatusResult = await this.refreshStatus();
        if(initStatusResult.error){
            result.error = initStatusResult.error;
            return result;
        }
        return result;
    }

    private async vechainNeedToUpdateHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const getLatestMerklerootResult = await this.vechainBridgeCore.getLastSnapshoot();
            if(getLatestMerklerootResult.error){
                result.error = getLatestMerklerootResult.error;
                return result;
            }
            const parentRoot = getLatestMerklerootResult.data!.sn.merkleRoot;
            const newSNResult = await this.buildNewSnapshoot(parentRoot);
            if(newSNResult.error){
                result.error = newSNResult.error;
                return result;
            }
            const newSnapshoot = newSNResult.data!;
            const vechainInfo = newSnapshoot.chains.find(i => {return i.chainName == this.config.vechain.chainName && i.chainId == this.config.vechain.chainId;})!;
            const ethereumInfo = newSnapshoot.chains.find(i => {return i.chainName == this.config.ethereum.chainName && i.chainId == this.config.ethereum.chainId;})!;

            const getProposalResult = await this.vechainBridgeValidator.getMerkleRootProposals(newSnapshoot.merkleRoot,vechainInfo.beginBlockNum,vechainInfo.endBlockNum,
                ethereumInfo.beginBlockNum,ethereumInfo.endBlockNum);
            if(getProposalResult.error){
                result.error = getProposalResult.error;
                return result;
            }
            const khash = this.signEncodePacked(newSnapshoot.merkleRoot,vechainInfo.beginBlockNum,vechainInfo.endBlockNum,
                ethereumInfo.beginBlockNum,ethereumInfo.endBlockNum);
            const sign = '0x' + (await this.wallet.list[0].sign(khash)).toString('hex');
            if(getProposalResult.data != undefined){
                const proposal = getProposalResult.data;
                if(proposal.executed){
                    this.status = STATUS.VeChainUpdateUnconfirmed;
                    return result;
                }
                if(proposal.signatures != undefined && proposal.signatures.findIndex(i => {return i.toLocaleLowerCase() == sign.toLocaleLowerCase()}) != -1){
                    this.status = STATUS.VeChainUpdateTxSent;
                    return result;
                }
            }
            const updateRootResult = await this.vechainBridgeValidator.updateBridgeMerkleRoot(newSnapshoot.merkleRoot,vechainInfo.beginBlockNum,vechainInfo.endBlockNum,
                ethereumInfo.beginBlockNum,ethereumInfo.endBlockNum);
            if(updateRootResult.error){
                result.error = updateRootResult.error;
                return result;
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

    private async vechainUpdateTxSentHandle():Promise<ActionResult>{
        let result = new ActionResult();

        const getMerkleRootResult = await this.vechainBridgeCore.getLastSnapshoot();
        if(getMerkleRootResult.error){
            result.error = getMerkleRootResult.error;
            return result;
        }
        if(getMerkleRootResult.data!.sn.merkleRoot == this.bridgeStatusCache.newSnapshoot!.merkleRoot){
             this.status = STATUS.VeChainUpdateUnconfirmed;
        } else {
            this.status = STATUS.VeChainNeedToUpdate;
            await sleep(this.loopsleep);
        }

        return result;
    }

    private async vechainUpdateUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const vbLastSnapshootResult = await this.vechainBridgeCore.getLastSnapshoot();
            if(vbLastSnapshootResult.error){
                result.error = vbLastSnapshootResult.error;
                return result;
            }

            if(vbLastSnapshootResult.data == undefined){
                return result;
            }

            const confirmTxResult = await this.vechainCommon.checkTxStatus(vbLastSnapshootResult.data!.txid,vbLastSnapshootResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }

            this.txCache.vechainUpdateRootTx.txid = vbLastSnapshootResult.data!.txid;
            this.txCache.vechainUpdateRootTx.blocknum = vbLastSnapshootResult.data!.blocknum;
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.VeChainUpdateUnconfirmed;
                this.txCache.vechainUpdateRootTx.txStatus = "pending";
                await sleep(this.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.VeChainUpdateConfirmed;
                this.txCache.vechainUpdateRootTx.txStatus = "confirmed";
                //this.bridgeStatusCache.newSnapshoot = vbLastSnapshootResult.data.sn;
                await this.snapshootModel.save([this.bridgeStatusCache.newSnapshoot!],[]);
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
            const newSnapshoot = this.bridgeStatusCache.newSnapshoot!;
            const vechainInfo = newSnapshoot.chains.find(i => {return i.chainName == this.config.vechain.chainName && i.chainId == this.config.vechain.chainId;})!;
            const ethereumInfo = newSnapshoot.chains.find(i => {return i.chainName == this.config.ethereum.chainName && i.chainId == this.config.ethereum.chainId;})!;
            const getebProposalResult = await this.ethereumBridgeValidator.getUpdateMerkleRootProposal(newSnapshoot.merkleRoot,vechainInfo.beginBlockNum,vechainInfo.endBlockNum,
                ethereumInfo.beginBlockNum,ethereumInfo.endBlockNum);

            if(getebProposalResult.error){
                result.error = getebProposalResult.error;
                return result;
            }

            if(getebProposalResult.data && getebProposalResult.data.executed){
                this.status = STATUS.EthereumUpdateUnconfirmed;
                return result;
            }

            const getVeChainProposalResult = await this.vechainBridgeValidator.getMerkleRootProposals(newSnapshoot.merkleRoot,vechainInfo.beginBlockNum,vechainInfo.endBlockNum,
                ethereumInfo.beginBlockNum,ethereumInfo.endBlockNum);
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
                     const updateResult = await this.ethereumBridgeValidator.updateBridgeMerkleRoot(this.bridgeStatusCache.newSnapshoot!.merkleRoot,proposal.args,proposal.signatures);
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
            result.error = new Error(`Ethereum update merkleroot faild. ${error}`);
        }
        return result;
    }

    private async ethereumUpdateTxSentHandle():Promise<ActionResult>{
        let result = new ActionResult();

        const getMerkleRootResult = await this.ethereumBridgeCore.getLastSnapshoot();
        if(getMerkleRootResult.error){
            result.error = getMerkleRootResult.error;
            return result;
        }
        if(getMerkleRootResult.data!.sn.merkleRoot == this.bridgeStatusCache.newSnapshoot!.merkleRoot){
            this.status = STATUS.EthereumUpdateUnconfirmed;
        } else {
            this.status = STATUS.EthereumNeedToUpdate;
            await sleep(this.loopsleep);
        }

        return result;
    }

    private async ethereumUpdateUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const ebLastSnapshootResult = await this.ethereumBridgeCore.getLastSnapshoot();
            if(ebLastSnapshootResult.error){
                result.error = ebLastSnapshootResult.error;
                return result;
            }

            if(ebLastSnapshootResult.data == undefined){
                return result;
            }

            const confirmTxResult = await this.ethereumCommon.checkTxStatus(ebLastSnapshootResult.data!.txid,ebLastSnapshootResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }

            this.txCache.ethereumUpdateRootTx.txid = ebLastSnapshootResult.data!.txid;
            this.txCache.ethereumUpdateRootTx.blocknum = ebLastSnapshootResult.data!.blocknum;
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.EthereumUpdateUnconfirmed;
                this.txCache.ethereumUpdateRootTx.txStatus = "pending";
                await sleep(this.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.EthereumUpdateConfirmed;
                this.txCache.ethereumUpdateRootTx.txStatus = "confirmed";
                this.bridgeStatusCache.newSnapshoot = ebLastSnapshootResult.data.sn;
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

    private async refreshStatus():Promise<ActionResult>{
        let result = new ActionResult();

        const loadStatusResult = await this.loadBridgeStatus();
        if(loadStatusResult.error){
            result.error = loadStatusResult.error;
            return result;
        }

        if(this.txCache.vechainUpdateRootTx.txStatus == "pending"){
            this.status = STATUS.VeChainUpdateUnconfirmed;
            return result;
        }

        if(this.txCache.ethereumUpdateRootTx.txStatus == "pending"){
            this.status = STATUS.EthereumUpdateUnconfirmed;
            return result;
        }

        if(this.bridgeStatusCache.newSnapshoot == undefined){
            const getLastSnapshootResult = await this.vechainBridgeCore.getLastSnapshoot();
            if(getLastSnapshootResult.error){
                result.error = getLastSnapshootResult.error;
                return result;
            }
            this.bridgeStatusCache.newSnapshoot = getLastSnapshootResult.data!.sn;
        }

        //bridge status handle
        if(this.bridgeStatusCache.merklerootMatch() && this.bridgeStatusCache.vechainMerkleroot == this.bridgeStatusCache.parentMerkleroot){
            this.status = STATUS.VeChainNeedToUpdate;
            return result;
        } else if(!this.bridgeStatusCache.merklerootMatch()){
            this.status = STATUS.EthereumNeedToUpdate;
            return result;
        } else if(this.bridgeStatusCache.merklerootMatch() && this.bridgeStatusCache.vechainMerkleroot != this.bridgeStatusCache.parentMerkleroot){
            this.status = STATUS.Finished;
            return result;
        } else {
            this.status = STATUS.UnmanageableStatus;
            return result;
        }
    }

    private async loadBridgeStatus():Promise<ActionResult>{
        let result = new ActionResult();

        const vbMerklerootPromise = this.vechainBridgeCore.getLastSnapshoot();
        const ebMerklerootPromise = this.ethereumBridgeCore.getLastSnapshoot();

        const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vbMerklerootPromise,ebMerklerootPromise]));
        if(promiseResult.error){
            result.error = promiseResult.error;
            return result;
        }

        const vechainLastSnInfo = (promiseResult.data!.succeed[0] as ActionData<{ sn: BridgeSnapshoot; txid: string; blocknum: number; }>).data;
        const ethereumLastSnInfo = (promiseResult.data!.succeed[1] as ActionData<{ sn: BridgeSnapshoot; txid: string; blocknum: number; }>).data;
        this.bridgeStatusCache.vechainMerkleroot = vechainLastSnInfo?.sn.merkleRoot || "";
        this.bridgeStatusCache.ethereumMerkleroot = ethereumLastSnInfo?.sn.merkleRoot || "";

        if(this.txCache.vechainUpdateRootTx.txid == ""){
            this.txCache.vechainUpdateRootTx.txid = vechainLastSnInfo?.txid || "";
            this.txCache.vechainUpdateRootTx.blocknum = vechainLastSnInfo?.blocknum || 0;
            if(this.txCache.vechainUpdateRootTx.txid != ""){
                const txStatusResult = await this.vechainCommon.checkTxStatus(this.txCache.vechainUpdateRootTx.txid,this.txCache.vechainUpdateRootTx.blocknum);
                if(txStatusResult.error){
                    result.error = txStatusResult.error;
                    return result;
                }
                this.txCache.vechainUpdateRootTx.txStatus = txStatusResult.data!;
            }
        }

        if(this.txCache.ethereumUpdateRootTx.txid == ""){
            this.txCache.ethereumUpdateRootTx.txid = ethereumLastSnInfo?.txid || "";
            this.txCache.ethereumUpdateRootTx.blocknum = ethereumLastSnInfo?.blocknum || 0;
            if(this.txCache.ethereumUpdateRootTx.txid != ""){
                const txStatusResult = await this.ethereumCommon.checkTxStatus(this.txCache.ethereumUpdateRootTx.txid,this.txCache.ethereumUpdateRootTx.blocknum);
                if(txStatusResult.error){
                    result.error = txStatusResult.error;
                    return result;
                }
                this.txCache.ethereumUpdateRootTx.txStatus = txStatusResult.data!;
            }
        }
        return result;
    }

    private async buildNewSnapshoot(parent:string):Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        const getParentSnResult = await this.vechainBridgeCore.getSnapshootByRoot(parent);
        if(getParentSnResult.error){
            result.error = getParentSnResult.error;
            return result;
        }

        if(getParentSnResult.data!.sn.merkleRoot == ZeroRoot()){
            result.error = new Error(`parent root: ${parent} not exists`);
            return result;
        }
        const parentSN = getParentSnResult.data!.sn;
        const newRangeResult = await this.newSnapshootRange(parentSN);
        if(newRangeResult.error){
            result.error = newRangeResult.error;
            return result;
        }
        const range = newRangeResult.data!;

        let hashEvents = new Array<HashEvent>();

        const scanVeEventsResult = await this.vechainBridgeCore.getSubmitEventsByRange(range.vechain.beginBlockNum,range.vechain.endBlockNum);
        if(scanVeEventsResult.error){
            result.error = scanVeEventsResult.error;
            return result;
        }
        hashEvents = hashEvents.concat(scanVeEventsResult.data!);
        if(range.ethereum.beginBlockNum <= range.ethereum.endBlockNum && range.ethereum.endBlockNum != 0){
            const scanEthEventsResult = await this.ethereumBridgeCore.getSubmitEventsByRange(range.ethereum.beginBlockNum,range.ethereum.endBlockNum);
            if(scanEthEventsResult.error){
                result.error = scanEthEventsResult.error;
                return result;
            }
            hashEvents = hashEvents.concat(scanEthEventsResult.data!);
        }

        let newSnapshoot:BridgeSnapshoot = {
            merkleRoot:"",
            chains:[
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    beginBlockNum:range.vechain.beginBlockNum,
                    endBlockNum:range.vechain.endBlockNum
                },
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    beginBlockNum:range.ethereum.beginBlockNum,
                    endBlockNum:range.ethereum.endBlockNum
                }
            ]
        }

        let storage = new BridgeStorage();
        storage.buildTree(this.config.appid,newSnapshoot,hashEvents);
        newSnapshoot.merkleRoot = storage.getMerkleRoot();

        const saveSnResult = await this.snapshootModel.save([newSnapshoot],hashEvents);
        if(saveSnResult.error){
            result.error = saveSnResult.error;
            return result;
        }
        result.data = newSnapshoot;

        return result;
    }

    private async newSnapshootRange(parentSN:BridgeSnapshoot):Promise<ActionData<{vechain:ChainInfo,ethereum:ChainInfo}>>{
        let result = new ActionData<{vechain:ChainInfo,ethereum:ChainInfo}>();

        const parentVChain = parentSN.chains.find(i => {return i.chainName = this.config.vechain.chainName && i.chainId == this.config.vechain.chainId;})!;
        const parentEChain = parentSN.chains.find(i => {return i.chainName = this.config.ethereum.chainName && i.chainId == this.config.ethereum.chainId;})!;

        let vechainBeginNum = parentVChain.endBlockNum + 1;
        let ethereumBeginNum = parentEChain.endBlockNum != 0 ? parentEChain.endBlockNum + 1 :  parentEChain.beginBlockNum;

        let vechainEndNum = vechainBeginNum + this.config.packstep as number;
        let bestBlock = await this.connex.thor.status.head.number;

        while(vechainEndNum + this.config.vechain.confirmHeight > bestBlock){
            await sleep(10);
            bestBlock = await this.connex.thor.status.head.number;
        }

        const getVeBlockInfo = (await this.connex.thor.block(vechainEndNum).get())!;
        const getEthBlockResult = await this.blockIndexModel.getBlockByTimestamp(this.config.ethereum.chainName,this.config.ethereum.chainId,undefined,getVeBlockInfo.timestamp,0,1);
        if(getEthBlockResult.error){
            result.error = getEthBlockResult.error;
            return result;
        }
        let ethereumEndNum = getEthBlockResult.data![0]!.blockNum - this.config.ethereum.confirmHeight;
        if(ethereumEndNum <= ethereumBeginNum){
            ethereumEndNum = 0;
        }

        result.data = {
            vechain:{
                chainName:this.config.vechain.chainName,
                chainId:this.config.vechain.chainId,
                beginBlockNum:vechainBeginNum,
                endBlockNum:vechainEndNum
            },
            ethereum:{
                chainName:this.config.ethereum.chainName,
                chainId:this.config.ethereum.chainId,
                beginBlockNum:ethereumBeginNum,
                endBlockNum:ethereumEndNum
            }
        }
        return result;
    }

    private signEncodePacked(hash:string,vbegin:number,vend:number,ebegin:number,eend:number):Buffer{
        let hashBuffer = hash != ZeroRoot() ? Buffer.from(hash.substring(2),'hex') : Buffer.alloc(32);
        const argsRLP = new RLP({
            name:'range',
            kind:[
                {name:'vbegin',kind:new RLP.NumericKind(32)},
                {name:'vend',kind:new RLP.NumericKind(32)},
                {name:'ebegin',kind:new RLP.NumericKind(32)},
                {name:'eend',kind:new RLP.NumericKind(32)},
            ]
        });
        const args = argsRLP.encode({vbegin:vbegin,vend:vend,ebegin:ebegin,eend:eend});
        let encode = Buffer.concat([
            args,
            hashBuffer
        ]);
        return keccak256(encode);
    }

    private async needSendEthereumTx(root:string,beginBlock:number):Promise<boolean>{
        let arr = new Array<{addr:string,hash:string}>();
        for(const validator of (this.env.validators as Array<Validator>)){
            let data = Buffer.concat([
                Buffer.from(root),
                Buffer.from(validator.validator)
            ]);
            let hash = "0x" + keccak256(data).toString('hex');
            arr.push({addr:validator.validator,hash:hash});

        }
        let sortArr = arr.sort((l,r) => {return (BigInt(l.hash) >= BigInt(r.hash)) ? 1 : -1;});

        //DEBUG
        console.debug("sortArr:" + JSON.stringify(sortArr));

        const index = sortArr.findIndex( item => {return item.addr.toLowerCase() == this.wallet.list[0].address.toLocaleLowerCase();});
        //DEBUG
        console.debug("The key index is " + index.toString());

        if(index == -1){
            return false;
        } else {
            const latestBlock = await this.web3.eth.getBlockNumber();
            //DEBUG
            console.debug(`Latest block is ${latestBlock} need range is ${beginBlock + this.wattingBlock * index} - ${beginBlock + this.wattingBlock * (index + 1)}`);
            if((beginBlock + this.wattingBlock * index) <= latestBlock && (beginBlock + this.wattingBlock * (index + 1)) > latestBlock){
                return true;
            }
        }
        return false;
    }
}
