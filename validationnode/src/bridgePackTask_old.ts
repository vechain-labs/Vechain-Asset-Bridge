import { SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import { getReceipt } from "myvetools/dist/connexUtils";
import { keccak256 } from "thor-devkit";
import Web3 from "web3";
import BridgeStorage from "./common/bridgeStorage";
import { EthereumBridgeHead } from "./common/ethereumBridgeHead";
import { EthereumBridgeVerifier } from "./common/ethereumBridgeVerifier";
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

export class BridgePackTaskOld{

    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = env.connex;
        this.wallet = env.wallet;
        this.web3 = env.web3;
        this.vechainBridge = new VeChainBridgeHead(env);
        this.vechainVerifier = new VeChainBridgeVerifiter(env);
        this.ethereumBridge = new EthereumBridgeHead(env);
        this.ethereumVerifier = new EthereumBridgeVerifier(env);
        this.snapshootModel = new SnapshootModel(env);
        this.ledgerModel = new LedgerModel(env);
        this.BridgeTxModel = new BridgeTxModel(env);
        this.status = STATUS.Entry;
    }

    private static loopsleep = 5 * 1000;

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();

        let newSnapshoot:BridgeSnapshoot;
        const beginTs = (new Date()).getTime();
        console.info(`Bridge lock process begin at ${beginTs} (${(new Date()).toString()})`);

        let prevStatus = this.status;
        while(beginTs + this.processTimeout >= (new Date()).getTime()){
            let processResult = new ActionResult();

            if(prevStatus != this.status){
                console.info(`Status ${prevStatus.toString()} --> ${this.status.toString()}`);
                prevStatus = this.status;
            }
            switch(this.status){
                case STATUS.Entry:
                    processResult = await this.entryHandle();
                    break;
                case STATUS.BridgeNoLocked:
                    processResult = await this.bridgeNoLockedHandle();
                    break;
                case STATUS.MerklerootMatch:
                    processResult = await this.merklerootMatchHandle();
                    break;
                case STATUS.MerklerootNomatch:
                    processResult = await this.merklerootNoMatchHandle();
                    break;
                case STATUS.VeChainNoLocked:
                    processResult = await this.vechainNoLockedHandle();
                    break;
                case STATUS.VeChainLockTxSend:
                    processResult = await this.vechainLockTxSendHandle();
                    break;
                case STATUS.VeChainLockedUnconfirmed:
                    processResult = await this.vechainLockedUnconfirmedHandle();
                    break;
                case STATUS.VeChainLockedConfirmed:
                    processResult = await this.vechainLockedConfirmedHandle();
                    break;
                case STATUS.EthereumNoLocked:
                    processResult = await this.ethereumNoLockedHandle();
                    break;
                case STATUS.EthereumLockTxSend:
                    processResult = await this.ethereumLockTxSendHandle();
                    break;
                case STATUS.EthereumLockedUnconfirmed:
                    processResult = await this.ethereumLockedUnconfirmedHandle();
                    break;
                case STATUS.EthereumLockedConfirmed:
                    processResult = await this.ethereumLockedConfirmed();
                    break;
                case STATUS.BridgeLocked:
                    processResult = await this.bridgeLockedHandle();
                    if(processResult == undefined){
                        newSnapshoot = (processResult as ActionData<BridgeSnapshoot>).data!;
                    }
                    break;
                case STATUS.VeChainUpdateTxSend:
                    processResult = await this.veChainUpdateTxSendHandle(newSnapshoot!.merkleRoot);
                    break;
                case STATUS.VeChainUpdateUnconfirmed:
                    const handleResult = await this.veChainUpdateUnconfirmedHandle(newSnapshoot!);
                    if(handleResult.error == undefined){
                        newSnapshoot = (handleResult as ActionData<BridgeSnapshoot>).data!;
                    }
                    processResult = handleResult as ActionResult;
                    break;
                case STATUS.VeChainUpdateConfirmed:
                    processResult = await this.veChainUpdateConfirmedHandle(newSnapshoot!.merkleRoot);
                    break;
                case STATUS.EthereumNoUpdate:
                    processResult = await this.ethereumNoUpdateHandle(newSnapshoot!.parentMerkleRoot,newSnapshoot!.merkleRoot);
                    break;
                case STATUS.EthereumUpdateTxSend:
                    processResult = await this.ethereumUpdateTxSendHandle(newSnapshoot!.merkleRoot);
                    break;
                case STATUS.EthereumUpdateUnconfirmed:
                    processResult = await this.ethereumUpdateUnconfirmedHandle(newSnapshoot!);
                    break;
                case STATUS.EthereumUpdateConfirmed:
                    processResult = await this.ethereumUpdateConfirmed();
                    break;
                case STATUS.Finished:
                    console.info(`Bridge update merkelroot process end at ${(new Date()).getTime()} (${(new Date()).toString()})`);
                    this.status = STATUS.Entry;
                    return result;
            }
            if(processResult.error){
                console.warn(`process error: ${processResult.error}`);
                await sleep(BridgePackTaskOld.loopsleep);
            }
        }

        return result;
    }

    private env:any;
    private config:any;
    private vechainBridge:VeChainBridgeHead;
    private vechainVerifier:VeChainBridgeVerifiter;
    private ethereumBridge:EthereumBridgeHead;
    private ethereumVerifier:EthereumBridgeVerifier;
    private connex:Framework;
    private snapshootModel:SnapshootModel;
    private readonly processTimeout = 60 * 10 * 1000;
    private readonly wattingBlock = 6;
    private wallet:SimpleWallet;
    private status:STATUS;
    private web3:Web3;
    private ledgerModel:LedgerModel;
    private BridgeTxModel:BridgeTxModel;

    private async entryHandle():Promise<ActionResult>{
        let result = new ActionResult();

        const vbLockedPromise = this.vechainBridge.getLockedStatus();
        const ebLockedPromise = this.ethereumBridge.getLockedStatus();
        const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vbLockedPromise,ebLockedPromise]));
        if(promiseResult.error){
            result.error = promiseResult.error;
            return result;
        }

        const vBridgeLockStatus = (promiseResult.data!.succeed[0] as ActionData<boolean>).data;
        const eBridgeLockStatus = (promiseResult.data!.succeed[1] as ActionData<boolean>).data;

        if(vBridgeLockStatus == true){
            const vbLastLockedResult = await this.vechainBridge.getLastLocked();
            if(vbLastLockedResult.error){
                result.error = vbLastLockedResult.error;
                return result;
            }
            const confirmTxResult = await this.vechainVerifier.checkTxStatus(vbLastLockedResult.data!.txid,vbLastLockedResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.VeChainLockedUnconfirmed;
                await sleep(BridgePackTaskOld.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.VeChainLockedConfirmed;
                return result;
            }
        } else if(eBridgeLockStatus == true){
            const ebLastLockedResult = await this.ethereumBridge.getLastLocked();
            if(ebLastLockedResult.error){
                result.error = ebLastLockedResult.error;
                return result;
            }
            const confirmTxResult = await this.ethereumVerifier.checkTxStatus(ebLastLockedResult.data!.txhash,ebLastLockedResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }

            if(confirmTxResult.data == "pending"){
                await sleep(BridgePackTaskOld.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                const vbMerkleRootPromise = this.vechainBridge.getMerkleRoot();
                const ebMerkleRootPromise = this.ethereumBridge.getMerkleRoot();
                const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vbMerkleRootPromise,ebMerkleRootPromise]));
                if(promiseResult.error){
                    result.error = promiseResult.error;
                    return result;
                }

                const vbMerkleRoot = (promiseResult.data!.succeed[0] as ActionData<string>).data;
                const ebMerkleRoot = (promiseResult.data!.succeed[1] as ActionData<string>).data;
    
                if(vbMerkleRoot == ebMerkleRoot){
                    this.status = STATUS.MerklerootMatch;
                    return result;
                } else {
                    this.status = STATUS.MerklerootNomatch;
                    return result;
                }
                // this.status = STATUS.EthereumLockedConfirmed;
                // return result;
            }
        } else {
            this.status = STATUS.BridgeNoLocked;
            return result;
        }
        return result;
    }

    private async bridgeNoLockedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        const vbMerkleRootPromise = this.vechainBridge.getMerkleRoot();
        const ebMerkleRootPromise = this.ethereumBridge.getMerkleRoot();
        const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vbMerkleRootPromise,ebMerkleRootPromise]));
        if(promiseResult.error){
            result.error = promiseResult.error;
            return result;
        }

        const vbMerkleRoot = (promiseResult.data!.succeed[0] as ActionData<string>).data;
        const ebMerkleRoot = (promiseResult.data!.succeed[1] as ActionData<string>).data;

        if(vbMerkleRoot == ebMerkleRoot){
            this.status = STATUS.MerklerootMatch;
            return result;
        } else {
            this.status = STATUS.MerklerootNomatch;
            return result;
        }
    }

    private async merklerootMatchHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const vbLockedResult = await this.vechainBridge.getLockedStatus();
        if(vbLockedResult.error){
            result.error = vbLockedResult.error;
            return result;
        }
        this.status = vbLockedResult.data == true ? STATUS.VeChainLockedUnconfirmed : STATUS.VeChainNoLocked;
        return result;
    }

    private async merklerootNoMatchHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const vbLockedResultPromise = this.vechainBridge.getLockedStatus();
        const ebLockedResultPromise = this.ethereumBridge.getLockedStatus();
        const vbMerkleRootPromise = this.vechainBridge.getMerkleRoot();
        const ebMerkleRootPromise = this.ethereumBridge.getMerkleRoot();

        const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vbLockedResultPromise,ebLockedResultPromise,vbMerkleRootPromise,ebMerkleRootPromise]));
        if(promiseResult.error){
            result.error = promiseResult.error;
            return result;
        }
        const vbStatus = (promiseResult.data!.succeed[0] as ActionData<boolean>).data!
        const ebStatus = (promiseResult.data!.succeed[1] as ActionData<boolean>).data!
        const vbMerkleroot = (promiseResult.data!.succeed[2] as ActionData<string>).data!
        const ebMerkleroot = (promiseResult.data!.succeed[3] as ActionData<string>).data!

        if(vbStatus == false && ebStatus == true){
            const parentMerklerootResult = await this.snapshootModel.getSnapshootByRoot(vbMerkleroot);
            if(parentMerklerootResult.error){
                result.error = parentMerklerootResult.error;
                return result;
            }
            if(parentMerklerootResult.data!.parentMerkleRoot == ebMerkleroot){
                this.status = STATUS.VeChainUpdateUnconfirmed;
            }
        }

        return result;
    }

    private async vechainNoLockedHandle():Promise<ActionResult>{
        let result = new ActionData();
        const retryLimit = 5;
        let retryCount = 0;

        try {
            while(retryCount <= retryLimit){
                await sleep(10 * 1000);
                const getMerkleRootRsult = await this.vechainBridge.getMerkleRoot();
                if(getMerkleRootRsult.error){
                    console.warn(`Get vechain Merkleroot error: ${getMerkleRootRsult.error}`);
                    continue;
                }
                const root = getMerkleRootRsult.data!;

                const getLockBridgeProposalResult = await this.vechainVerifier.getLockBridgeProposal(root);
                if(getLockBridgeProposalResult.error){
                    console.warn(`Get vechain LockBridgeProposal error: ${getLockBridgeProposalResult.error}`);
                    continue;
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
                        this.status = STATUS.VeChainLockTxSend;
                        return result;
                    }
                }
                const lockBridgeResult =  await this.vechainVerifier.lockBridge(root);
                if(lockBridgeResult.error){
                    console.warn(`Lock vechain Bridge error: ${lockBridgeResult.error}`);
                    continue;
                }
                const receipt = await getReceipt(this.connex,this.config.vechain.expiration,lockBridgeResult.data!);
                console.info(`Send vechain lock bridge, txid:${lockBridgeResult.data!}`);
                if(receipt.reverted == true){
                    console.warn(`Send vechain lock bridge transaction reverted, txid:${lockBridgeResult.data!}`)
                    continue;
                }
                this.status = STATUS.VeChainLockTxSend;
                return result;
            }
            result.error = new Error(`Lock vechain bridge retry exceeded`);
        } catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }

    private async vechainLockTxSendHandle():Promise<ActionResult>{
        let result = new ActionResult();
        this.status = STATUS.Entry;

        const getStatusResult = await this.vechainBridge.getLockedStatus();
        if(getStatusResult.error == undefined){
            if(getStatusResult.data == true){
                this.status = STATUS.VeChainLockedUnconfirmed;
            }
        }
        return result;
    }

    private async vechainLockedUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const vbLastLockedResult = await this.vechainBridge.getLastLocked();
            if(vbLastLockedResult.error){
                result.error = vbLastLockedResult.error;
                return result;
            }

            if(vbLastLockedResult.data == undefined){
                this.status = STATUS.Entry;
            }
            const confirmTxResult = await this.vechainVerifier.checkTxStatus(vbLastLockedResult.data!.txid,vbLastLockedResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.VeChainLockedUnconfirmed;
                await sleep(BridgePackTaskOld.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.VeChainLockedConfirmed;
                return result;
            }

        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async vechainLockedConfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const ebLockedResult = await this.ethereumBridge.getLockedStatus();
            if(ebLockedResult.error){
                result.error = ebLockedResult.error;
                return result;
            }
            if(ebLockedResult.data == false){
                this.status = STATUS.EthereumNoLocked;
                return result;
            } else {
                const ebLastLockedResult = await this.ethereumBridge.getLastLocked();
                if(ebLastLockedResult.error){
                    result.error = ebLastLockedResult.error;
                    return result;
                }
                const confirmTxResult = await this.ethereumVerifier.checkTxStatus(ebLastLockedResult.data!.txhash,ebLastLockedResult.data!.blocknum);
                if(confirmTxResult.error){
                    result.error = confirmTxResult.error;
                    return result;
                }
                if(confirmTxResult.data == "pending"){
                    this.status = STATUS.EthereumLockedUnconfirmed;
                    return result;
                }
                if(confirmTxResult.data == "confirmed"){
                    this.status = STATUS.EthereumLockedConfirmed;
                    return result;
                }
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private async ethereumNoLockedHandle():Promise<ActionResult>{
        let result = new ActionResult();
        const retryLimit = 5;
        let retryCount = 0;
        let beginBlock = (await this.web3.eth.getBlock('latest')).number

        while(retryCount <= retryLimit){
            await sleep(10 * 1000);

            const getMerkleRootRsult = await this.ethereumBridge.getMerkleRoot();
            if(getMerkleRootRsult.error){
                console.warn(`Get ethereum Merkleroot error:${getMerkleRootRsult.error}`);
                continue;
            }
            const root = getMerkleRootRsult.data!;

            const getEthereumProposalResult = await this.ethereumVerifier.getLockBridgeProposal(root);
            if(getEthereumProposalResult.error){
                result.error = getEthereumProposalResult.error;
                console.warn(`Get ethereum Proposal error:${getEthereumProposalResult.error}`);
                continue;
            }

            if(getEthereumProposalResult.data && getEthereumProposalResult.data.executed){
                this.status = STATUS.EthereumLockedUnconfirmed;
                await sleep(BridgePackTaskOld.loopsleep);
                return result;
            }

            const getVeChainProposalResult = await this.vechainVerifier.getLockBridgeProposal(root);
            if(getVeChainProposalResult.error || getVeChainProposalResult.data == undefined){
                this.status = STATUS.Entry;
                return result;
            }

            const proposal = getVeChainProposalResult.data;
            if(proposal.executed == false){
                this.status = STATUS.VeChainNoLocked; 
                return result;
            }

            let needSendLockTx = await this.needSendEthereumTx(root,beginBlock);
            if(needSendLockTx){
                try {
                    const lockBridgeResult = await this.ethereumVerifier.lockBridge(root,proposal.signatures);
                    if(lockBridgeResult.error){
                        console.warn(`Lock ethereum bridge error: ${lockBridgeResult.error}`);
                        continue;
                    } else {
                        this.status = STATUS.EthereumLockTxSend;
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

    private async ethereumLockTxSendHandle():Promise<ActionResult>{
        let result = new ActionResult();
        this.status = STATUS.EthereumNoLocked;

        const getStatusResult = await this.ethereumBridge.getLockedStatus();
        if(getStatusResult.error == undefined){
            if(getStatusResult.data == true){
                this.status = STATUS.EthereumLockedUnconfirmed;
            }
        }
        return result;
    }

    private async ethereumLockedUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const ebLastLockedResult = await this.ethereumBridge.getLastLocked();
            if(ebLastLockedResult.error){
                result.error = ebLastLockedResult.error;
                return result;
            }

            const confirmTxResult = await this.ethereumVerifier.checkTxStatus(ebLastLockedResult.data!.txhash,ebLastLockedResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.EthereumLockedUnconfirmed;
                await sleep(BridgePackTaskOld.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.EthereumLockedConfirmed;
                return result;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async ethereumLockedConfirmed():Promise<ActionResult>{
        let result = new ActionResult();

        const vbLockedPromise = this.vechainBridge.getLockedStatus();
        const ebLockedPromise = this.ethereumBridge.getLockedStatus();
        const promiseResult = await PromiseActionResult.PromiseActionResult(Promise.all([vbLockedPromise,ebLockedPromise]));
        if(promiseResult.error){
            result.error = promiseResult.error;
            return result;
        }

        const vBridgeLockStatus = (promiseResult.data!.succeed[0] as ActionData<boolean>).data;
        const eBridgeLockStatus = (promiseResult.data!.succeed[1] as ActionData<boolean>).data;

        if(vBridgeLockStatus == false){
            this.status = STATUS.VeChainNoLocked;
            return result;
        } else if(eBridgeLockStatus == false){
            this.status = STATUS.EthereumNoLocked;
            return result;
        } else {
            this.status = STATUS.BridgeLocked;
            return result;
        }
    }

    private async bridgeLockedHandle():Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        const retryLimit = 5;
        let retryCount = 0;
        let newSnapshoot:BridgeSnapshoot|undefined;

        try {
            while(retryCount <= retryLimit){
                await sleep(5 * 1000);
                retryCount++;

                if(newSnapshoot == undefined){
                    const getMerkleRootRsult = await this.vechainBridge.getMerkleRoot();
                    if(getMerkleRootRsult.error){
                        console.warn(`Get vechain merkleroot error:${getMerkleRootRsult.error}`);
                        continue;
                    }
                    const root = getMerkleRootRsult.data!;
                    const buildNewSnResult = await this.buildNewSnapshoot(root);
                    if(buildNewSnResult.error){
                        console.warn(`Build new snapshoot error:${buildNewSnResult.error}`);
                        continue;
                    }
                    newSnapshoot = buildNewSnResult.data!;
                }

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

                const updateRootResult = await this.vechainVerifier.updateBridgeMerkleRoot(newSnapshoot.parentMerkleRoot,newSnapshoot.merkleRoot);
                if(updateRootResult.error){
                    continue;
                }
                const receipt = await getReceipt(this.connex,this.config.vechain.expiration,updateRootResult.data!);
                console.info(`send vechain update merkleroot, txid:${updateRootResult.data!}`);
                if(receipt.reverted == true){
                    console.warn(`send update merkleroot transaction reverted, txid:${updateRootResult.data!}`)
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
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.VeChainUpdateUnconfirmed;
                result.data = vbLastSnapshootResult.data!.sn;
                await sleep(BridgePackTaskOld.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.VeChainUpdateConfirmed;
                let index = sn.chains.findIndex(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;});
                if(index == -1){
                    let chainInfo = vbLastSnapshootResult.data!.sn.chains.find(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;})!;
                    chainInfo.endBlockNum = vbLastSnapshootResult.data!.blocknum;
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
                if(confirmTxResult.data == "pending"){
                    this.status = STATUS.EthereumUpdateUnconfirmed;
                    await sleep(BridgePackTaskOld.loopsleep);
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
        let beginBlock = await this.web3.eth.getBlockNumber();

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

            let needSendLockTx = await this.needSendEthereumTx(root,beginBlock);
             if(needSendLockTx){
                 try {
                     const updateResult = await this.ethereumVerifier.updateBridgeMerkleRoot(parent,proposal.hash,proposal.signatures);
                     console.info(`send ethereum update merkleroot, txid:${updateResult.data!}`);
                     if(updateResult.error){
                         console.warn(`send ethereum update merkleroot error: ${updateResult.error}`);
                         continue;
                     } else {
                         this.status = STATUS.EthereumUpdateTxSend;
                         return result;
                     }
                 } catch (error) {
                    result.error = error;
                 }
             } else {
                 break;
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
            if(confirmTxResult.data == "pending"){
                this.status = STATUS.EthereumUpdateUnconfirmed;
                result.data = ebLastSnapshootResult.data!.sn;
                await sleep(BridgePackTaskOld.loopsleep);
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.EthereumUpdateConfirmed;
                let index = sn.chains.findIndex(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;});
                if(index == -1){
                    let chainInfo = ebLastSnapshootResult.data!.sn.chains.find(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;})!;
                    chainInfo.endBlockNum = ebLastSnapshootResult.data!.blocknum;
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
        const swaptxsaveResult = await this.BridgeTxModel.saveBridgeTxs(getTxsResult.data || []);
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

enum STATUS {
    Entry = "Entry",
    BridgeNoLocked = "BridgeNoLocked",
    MerklerootMatch = "MerklerootMatch",
    MerklerootNomatch = "MerklerootNomatch",
    SyncingMerkleRoot = "SyncingMerkleRoot",
    SyncingMerkleRootFinish = "SyncingMerkleRootFinish",
    VeChainNoLocked = "VeChainNoLocked",
    VeChainLockedUnconfirmed = "VeChainLockedUnconfirmed",
    VeChainLockTxSend = "VeChainLockTxSend",
    VeChainLockedConfirmed = "VeChainLockedConfirmed",
    EthereumNoLocked = "EthereumNoLocked",
    EthereumLockTxSend = "EthereumLockTxSend",
    EthereumLockedUnconfirmed = "EthereumLockedUnconfirmed",
    EthereumLockedConfirmed = "EthereumLockedConfirmed",
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