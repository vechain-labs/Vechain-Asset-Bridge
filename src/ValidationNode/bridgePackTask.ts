import { Framework } from "@vechain/connex-framework";
import { EthereumBridgeHead } from "./server/ethereumBridgeHead";
import { EthereumBridgeVerifier } from "./server/ethereumBridgeVerifier";
import LedgerModel from "./server/model/ledgerModel";
import { SnapshootModel } from "./server/model/snapshootModel";
import { VeChainBridgeHead } from "./server/vechainBridgeHead";
import { VeChainBridgeVerifiter } from "./server/vechainBridgeVerifier";
import { ActionData, ActionResult, PromiseActionResult } from "./utils/components/actionResult";
import { BridgeSnapshoot, ZeroRoot } from "./utils/types/bridgeSnapshoot";
import { TokenInfo } from "./utils/types/tokenInfo";
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

        const bridgeLockedResult = await this.checkBridgesStatus();
        if(bridgeLockedResult.error){
            result.copyBase(bridgeLockedResult);
            return result;
        }

        if(bridgeLockedResult.data!.vechain == false){
            const lockResult = await this.lockVeChainBridge();
            result.copyBase(lockResult);
            return result;
        } 
        
        if(bridgeLockedResult.data!.ethereum == false){
            //send lock ethereum bridge tx
        }

        return result;
    }

    private async getLastSyncSnapshoot():Promise<ActionData<BridgeSnapshoot>>{
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
                    endBlockNum:this.config.ethereum.startBlockNum},
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

    private async checkBridgesStatus():Promise<ActionData<{vechain:boolean,ethereum:boolean}>>{
        let result = new ActionData<{vechain:boolean,ethereum:boolean}>();
        let limit = 0;

        while(limit<=this.tryLimit){
            sleep.sleep(10);
            limit++;
            const vechainResult = await this.vechainBridge.getLockedStatus();
            const ethereumResult = await this.ethereumBridge.getLockedStatus();

            if(vechainResult.error || ethereumResult.error){
                continue;
            }

        }
        result.error = new Error(`check bridge status retry timeout`);
        return result;
    }

    private async lockVeChainBridge():Promise<ActionResult>{
        let result = new ActionResult();
        let limit = 0;
        let txid = "";

        while(limit<=this.tryLimit){
            sleep.sleep(10);
            limit++;
            const vechainResult = await this.vechainBridge.getLockedStatus();
            if(vechainResult.error){
                continue;
            }

            if(vechainResult.data! == true){
                return result;
            }

            if(txid == ""){
                const getLastRootResut = await this.vechainBridge.getMerkleRoot();
                if(getLastRootResut.error){
                    continue;
                }
    
                const root = getLastRootResut.data!;
                const sendLockTxResult = await this.vechainVerifier.lockBridge(root);
                if(sendLockTxResult.error){
                    continue;
                }
                txid = sendLockTxResult.data!;
            }

            const comfirmResult = await this.vechainVerifier.confirmTx(txid);
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

    private async lockEthereumBridge():Promise<ActionResult>{
        let result = new ActionResult();
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


                // const sendLockTxResult = await this.vechainVerifier.lockBridge(root);
                // if(sendLockTxResult.error){
                //     continue;
                // }
                // txid = sendLockTxResult.data!;
            }

            // const comfirmResult = await this.vechainVerifier.confirmTx(txid);
            // if(comfirmResult.error){
            //     continue;
            // }

            // if(comfirmResult.data == "confirmed"){
            //     return result;
            // } else if(comfirmResult.data == "reverted" || comfirmResult.data == "timeout"){
            //     txid = "";
            //     continue;
            // }
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