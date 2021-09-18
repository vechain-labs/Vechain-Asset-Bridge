import { Framework } from "@vechain/connex-framework";
import { EthereumBridgeHead } from "./server/ethereumBridgeHead";
import { EthereumBridgeVerifier } from "./server/ethereumBridgeVerifier";
import LedgerModel from "./server/model/ledgerModel";
import { SnapshootModel } from "./server/model/snapshootModel";
import { VeChainBridgeHead } from "./server/vechainBridgeHead";
import { VeChainBridgeVerifiter } from "./server/vechainBridgeVerifier";
import { ActionData, ActionResult, PromiseActionResult } from "../common/utils/components/actionResult";
import { BridgeSnapshoot, ZeroRoot } from "../common/utils/types/bridgeSnapshoot";
import { TokenInfo } from "../common/utils/types/tokenInfo";
const sleep = require('sleep');

export class BridgePackTask{

    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = this.env.connex;
        this.tokenInfo = this.env.tokenInfo;
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.ethereumBridge = new EthereumBridgeHead(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.ledgerModel = new LedgerModel(this.env);
        this.vechainVerifier = new VeChainBridgeVerifiter(this.env);
        this.ethereumVerifier = new EthereumBridgeVerifier(this.env);
    }

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();

        console.info(`Check bridge status`);
        const bridgeLockedResult = await this.checkBridgesStatus();
        if(bridgeLockedResult.error){
            result.copyBase(bridgeLockedResult);
            return result;
        }

        console.info(`VeChain Bridge status:${bridgeLockedResult.data!.vechain},Ethereum Bridge state: ${bridgeLockedResult.data!.ethereum}`);

        if(bridgeLockedResult.data!.vechain == false){
            const lockResult = await this.lockVeChainBridge();
            if(lockResult.error){
                result.copyBase(lockResult);
                return result;
            }
            console.info(`VeChain Bridge locked at ${lockResult.data!.lockBlock}`);
        }
        
        // if(bridgeLockedResult.data!.ethereum == false){
        //     const lockResult = await this.lockEthereumBridge();
        //     if(lockResult.error){
        //         result.copyBase(lockResult);
        //         return result;
        //     }
        //     console.info(`Ethereum Bridge locked at ${lockResult.data!.lockBlock}`);
        // }

        return result;
    }

    private async checkBridgesStatus():Promise<ActionData<{vechain:boolean,ethereum:boolean}>>{
        let result = new ActionData<{vechain:boolean,ethereum:boolean}>();
        let limit = 0;

        while(limit<=this.tryLimit){
            limit++;
            try {
                const vechainResult = await this.vechainBridge.getLockedStatus();
                const ethereumResult = await this.ethereumBridge.getLockedStatus();
                if(vechainResult.error != undefined || ethereumResult.error != undefined){
                    console.error(vechainResult.error != undefined ? JSON.stringify(vechainResult.error) : JSON.stringify(ethereumResult.error));
                    sleep.sleep(10);
                    continue;
                }
                result.data = {vechain:vechainResult.data!,ethereum:ethereumResult.data!};
                return result;
            } catch (error) {
                result.error = error;
            }
        }
        result.error = new Error(`check bridge status retry timeout`);
        return result;
    }

    private async lockVeChainBridge():Promise<ActionData<{lockBlock:number}>>{
        let result = new ActionData<{lockBlock:number}>();

        let limit1 = 0;
        let txid = "";

        while(limit1<=this.tryLimit){
            if(limit1 == 0){
                sleep.sleep(10);
            }
            limit1++;

            console.info(`Get locked status.`);
            const vechainResult = await this.vechainBridge.getLockedStatus();
            if(vechainResult.error){
                continue;
            }

            if(vechainResult.data! == true){
                console.info(`Get lastlocked block.`);
                const getLastLockedBlockResult = await this.vechainBridge.getLastLockedBlock();
                if(getLastLockedBlockResult.error){
                    continue;
                }
                txid = getLastLockedBlockResult.data!.txid;
                break;
            } else {
                console.info(`Get last merkleroot`);
                const getLastRootResut = await this.vechainBridge.getMerkleRoot();
                if(getLastRootResut.error){
                    continue;
                }
                const root = getLastRootResut.data!;
                console.info(`Last merkleroot ${root}`);

                console.info(`Send lockbridge transaction`);
                const sendLockTxResult = await this.vechainVerifier.lockBridge(root);
                if(sendLockTxResult.error){
                    continue;
                }
                txid = sendLockTxResult.data!;
                console.info(`Lockbridge transaction ${txid}`);
                break;
            }
        }

        let limit2 = 0;

        if(txid != undefined){
            while(limit2<=this.tryLimit){
                if(limit2 == 0){
                    sleep.sleep(10);
                }
                limit2++;
                
                const comfirmResult = await this.vechainVerifier.confirmTx(txid);
                if(comfirmResult.error){
                    continue;
                }
    
                if(comfirmResult.data == "confirmed"){
                    const receipt =  await this.connex.thor.transaction(txid).getReceipt();
                    result.data = {lockBlock:receipt!.meta.blockNumber};
                    return result;
                } else if(comfirmResult.data == "reverted"){
                    result.error = new Error(`transaction ${txid} reverted`);
                } else {
                    result.error = new Error(`confirmTx ${txid} expired`);
                }
            }
            result.error = new Error(`confirmTx ${txid} timeout`);
        } else {
            result.error = new Error(`can't lock vechain bridge`);
        }
        
        return result;
    }

    private async lockEthereumBridge():Promise<ActionData<{lockBlock:number}>>{
        let result = new ActionData<{lockBlock:number}>();
        result.data = {lockBlock:0};
        let limit = 0;
        let txid = "";

        while(limit<=this.tryLimit){
            sleep.sleep(10);
            limit++;
            const ethereumResult = await this.ethereumBridge.getLockedStatus();
            if(ethereumResult.error){
                continue;
            }

            if(ethereumResult.data! == true){
                const getLastLockedBlockResult = await this.ethereumBridge.getLastLockedBlock();
                if(getLastLockedBlockResult.error){
                    result.copyBase(getLastLockedBlockResult);
                }
                result.data = {lockBlock:getLastLockedBlockResult.data!.blocknum};
                return result;
            }

            if(txid == ""){
                const getLastRootResut = await this.vechainBridge.getMerkleRoot();
                if(getLastRootResut.error){
                    continue;
                }
    
                const root = getLastRootResut.data!;
                const lockProposalResult = await this.vechainVerifier.getLockBridgeProposal(root);
                if(lockProposalResult.error){
                    continue;
                }

                const lockProposal = lockProposalResult.data!;
                if(lockProposal.executed == false){
                    continue;
                }
                
                const lockEthereumResult = await this.ethereumVerifier.lockBridge(root,lockProposal.signatures);
                if(lockEthereumResult.error){
                    continue;
                }
                txid = lockEthereumResult.data!;
                
            }

            const comfirmResult = await this.ethereumVerifier.confirmTx(txid);
            if(comfirmResult.error){
                continue;
            }

            if(comfirmResult.data == "confirmed"){
                return result;
            } else if(comfirmResult.data == "reverted" || comfirmResult.data == "timeout"){
                txid = "";
                continue;
            }
        }
        result.error = new Error(`lock ethereum bridge retry timeout`);
        return result;
    }

    private env:any;
    private config:any;
    private vechainBridge:VeChainBridgeHead;
    private vechainVerifier:VeChainBridgeVerifiter;
    private ethereumBridge:EthereumBridgeHead;
    private ethereumVerifier:EthereumBridgeVerifier;
    private connex!:Framework;
    private tokenInfo!:Array<TokenInfo>;
    private snapshootModel!:SnapshootModel;
    private ledgerModel!:LedgerModel;
    private readonly tryLimit = 6 * 5;
}