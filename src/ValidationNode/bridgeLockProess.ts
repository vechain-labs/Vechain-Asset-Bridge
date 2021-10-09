import { Framework } from "@vechain/connex-framework";
import { ActionData, ActionResult } from "../common/utils/components/actionResult";
import { SnapshootModel } from "../common/model/snapshootModel";
import { VeChainBridgeHead } from "../common/vechainBridgeHead";
import { EthereumBridgeHead } from "../common/ethereumBridgeHead";
import { VeChainBridgeVerifiter } from "../common/vechainBridgeVerifier";
import { EthereumBridgeVerifier } from "../common/ethereumBridgeVerifier";
import { ZeroRoot } from "../common/utils/types/bridgeSnapshoot";
import { keccak256 } from "thor-devkit";
import { SimpleWallet } from "@vechain/connex-driver";
import { getReceipt } from "myvetools/dist/connexUtils";
import { sleep } from "../common/utils/sleep";

export class BridgeLockProcess{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = this.env.connex;
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.ethereumBridge = new EthereumBridgeHead(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.vechainVerifier = new VeChainBridgeVerifiter(this.env);
        this.ethereumVerifier = new EthereumBridgeVerifier(this.env);
        this.wallet = this.env.wallet;
        this.status = STATUS.Entry;
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();

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

        const root = getLocalMerkleRootResult.data!.merkleRoot;

        if(getMerkleRootResult.data!.toLocaleLowerCase() != root){
            result.error = new Error(`MerklerootNomatch,localRoot:${root} bridgeRoot:${getMerkleRootResult.data!}`);
            return result;
        }

        console.info(`LocalRoot:${root} bridgeRoot:${getMerkleRootResult.data!}`);
        const beginTs = (new Date()).getTime();
        console.info(`Bridge lock process begin at ${beginTs} (${(new Date()).toString()})`);

        while(true){
            if(beginTs + this.processTimeout < (new Date()).getTime()){
                result.error = new Error("BridgeLockProcess timeout");
                console.error(`BridgeLockProcess timeout`)
                return result;
            }
            await sleep(5 * 1000);

            console.info(`Status ${this.status}`);
            let runResult = new ActionResult();

            switch(this.status){
                case STATUS.Entry:
                    runResult = await this.entryHandle();
                    break;
                case STATUS.VeChainNoLocked:
                    runResult = await this.veChaiVeChainNoLockedHandle(root);
                    break;
                case STATUS.VeChainLockTxSent:
                    runResult = await this.veChainLockTxSentHandle();
                    break;
                case STATUS.VeChainLockedUnconfirmed:
                    runResult = await this.veChainLockedUnconfirmedHandle();
                    break;
                case STATUS.VeChainLockedConfirmed:
                    runResult = await this.veChainLockedConfirmedHandle();
                    break;
                case STATUS.EthereumNoLocked:
                    runResult = await this.ethereumNoLockedHandle(root);
                    break;
                case STATUS.EthereumLockTxSent:
                    runResult = await this.ethereumLockTxSentHandle();
                    break;
                case STATUS.EthereumLockedUnconfirmed:
                    runResult = await this.ethereumLockedUnconfirmedHandle();
                    break;
                case STATUS.EthereumLockedConfirmed:
                    runResult = await this.ethereumLockedConfirmed();
                    break;
                case STATUS.Finished:
                    console.info(`Bridge lock process end at ${(new Date()).getTime()} (${(new Date()).toString()})`);
                    this.status = STATUS.Entry;
                    return result;
            }
            if(runResult.error != undefined){
                console.debug(`run result error ${runResult.error}`)
            }
        }
    }

    private async entryHandle():Promise<ActionResult>{
        let result = new ActionResult();

        console.info("Check VeChain Bridge Status");
        const vbLockedResult = await this.vechainBridge.getLockedStatus();
        if(vbLockedResult.error){
            result.error = vbLockedResult.error;
            return result;
        }
        if(vbLockedResult.data == false){
            this.status = STATUS.VeChainNoLocked;
            return result;
        } else {
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
            if(confirmTxResult.data == "pendding"){
                this.status = STATUS.VeChainLockedUnconfirmed;
                return result;
            } else if(confirmTxResult.data == "confirmed"){
                this.status = STATUS.VeChainLockedConfirmed;
                return result;
            }
        }
        return result;
    }

    private async veChaiVeChainNoLockedHandle(root:string):Promise<ActionResult>{
        let result = new ActionResult();
        const retryLimit = 5;
        let retryCount = 0;

        try {
            while(retryCount <= retryLimit){
                await sleep(10 * 1000);
                retryCount++;
                const getLockBridgeProposalResult = await this.vechainVerifier.getLockBridgeProposal(root);
                if(getLockBridgeProposalResult.error){
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
                        this.status = STATUS.VeChainLockTxSent;
                        return result;
                    }
                }

                const lockBridgeResult =  await this.vechainVerifier.lockBridge(root);
                if(lockBridgeResult.error){
                    continue;
                }
                const receipt = await getReceipt(this.connex,this.config.vechain.expiration,lockBridgeResult.data!);
                console.info(`send lock bridge, txid:${lockBridgeResult.data!}`);
                if(receipt.reverted == true){
                    console.info(`send lock bridge transaction reverted, txid:${lockBridgeResult.data!}`)
                    continue;
                }
                this.status = STATUS.VeChainLockTxSent;
                return result;
            }
            result.error = new Error(`lock vechain bridge retry exceeded`);
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async veChainLockTxSentHandle():Promise<ActionResult>{
        let result = new ActionResult();
        this.status = STATUS.VeChainNoLocked;

        const getStatusResult = await this.vechainBridge.getLockedStatus();
        if(getStatusResult.error == undefined){
            if(getStatusResult.data == true){
                this.status = STATUS.VeChainLockedUnconfirmed;
            }
        }
        return result;
    }

    private async veChainLockedUnconfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const vbLastLockedResult = await this.vechainBridge.getLastLocked();
            if(vbLastLockedResult.error){
                result.error = vbLastLockedResult.error;
                return result;
            }

            if(vbLastLockedResult.data == undefined){
                this.status = STATUS.VeChainNoLocked;
            }
            const confirmTxResult = await this.vechainVerifier.checkTxStatus(vbLastLockedResult.data!.txid,vbLastLockedResult.data!.blocknum);
            if(confirmTxResult.error){
                result.error = confirmTxResult.error;
                return result;
            }
            if(confirmTxResult.data == "pendding"){
                this.status = STATUS.VeChainLockedUnconfirmed;
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

    private async veChainLockedConfirmedHandle():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            console.info("Check Ethereum Bridge Status");
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
                if(confirmTxResult.data == "pendding"){
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

    private async ethereumNoLockedHandle(root:string):Promise<ActionResult>{
        let result = new ActionResult();
        const retryLimit = 5;
        let retryCount = 0;

        while(retryCount <= retryLimit){
            await sleep(10 * 1000);

            const getEthereumProposalResult = await this.ethereumVerifier.getLockBridgeProposal(root);
            if(getEthereumProposalResult.error){
                result.error = getEthereumProposalResult.error;
                return result;
            }

            if(getEthereumProposalResult.data && getEthereumProposalResult.data.executed){
                this.status = STATUS.EthereumLockedUnconfirmed;
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

            let needSendLockTx:boolean = true;
            /** 
             * DOTO: Check which verifier need to send ethereum bridge lock transaction.
             * needSendLockTx = {};
             */
            if(needSendLockTx){
                try {
                    const lockBridgeResult = await this.ethereumVerifier.lockBridge(root,proposal.signatures);
                    if(lockBridgeResult.error){
                        continue;
                    } else {
                        this.status = STATUS.EthereumLockTxSent;
                        return result;
                    }
                } catch (error) {
                    result.error = error;
                }
            }
            retryCount++;
        }
        result.error = new Error(`lock vechain bridge retry exceeded`);
        return result;
    }

    private async ethereumLockTxSentHandle():Promise<ActionResult>{
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
            if(confirmTxResult.data == "pendding"){
                this.status = STATUS.EthereumLockedUnconfirmed;
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
        this.status = STATUS.Finished;
        return new ActionData<string>();;
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
    private vechainBridge:VeChainBridgeHead;
    private vechainVerifier:VeChainBridgeVerifiter;
    private ethereumBridge:EthereumBridgeHead;
    private ethereumVerifier:EthereumBridgeVerifier;
    private connex!:Framework;
    private snapshootModel!:SnapshootModel;
    private readonly processTimeout = 60 * 30 * 1000;
    private wallet!:SimpleWallet;
    private status:STATUS;
}

enum STATUS {
        Entry = "Entry",
        VeChainNoLocked = "VeChainNoLocked",
        VeChainLockedUnconfirmed = "VeChainLockedUnconfirmed",
        VeChainLockTxSent = "VeChainLockTxSent",
        VeChainLockedConfirmed = "VeChainLockedConfirmed",
        EthereumNoLocked = "EthereumNoLocked",
        EthereumLockTxSent = "EthereumLockTxSent",
        EthereumLockedUnconfirmed = "EthereumLockedUnconfirmed",
        EthereumLockedConfirmed = "EthereumLockedConfirmed",
        Finished = "Finished"
}