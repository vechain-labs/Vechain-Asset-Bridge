import { BaseMiddleware } from "../../utils/baseMiddleware";
import Router from "koa-router";
import { ClaimMeta } from "../../utils/types/claimMeta";
import { ActionData } from "../../../common/utils/components/actionResult";
import ConvertJSONResponeMiddleware from "../../middleware/convertJSONResponeMiddleware";
import { SnapshootModel } from "../../../common/model/snapshootModel";
import LedgerModel from "../../../common/model/ledgerModel";
import { SwapTx } from "../../../common/utils/types/swapTx";
import { BridgeSnapshoot, ZeroRoot } from "../../../common/utils/types/bridgeSnapshoot";
import { BridgeLedger } from "../../../common/utils/types/bridgeLedger";
import SwapTxModel from "../../../common/model/swapTxModel";
import { TokenInfo } from "../../../common/utils/types/tokenInfo";
import { SystemDefaultError } from "../../utils/error";
import BridgeStorage from "../../../common/bridgeStorage";

export default class BridgeController extends BaseMiddleware{
    public claimList:Router.IMiddleware;
    public merkleproof:Router.IMiddleware;

    constructor(env:any){
        super(env);

        this.claimList = async (ctx:Router.IRouterContext,next: () => Promise<any>) => {
            let chainName = String(ctx.query.chainname).toLowerCase();
            let chainId = String(ctx.query.chainid).toLowerCase();
            let address = String(ctx.query.address).toLowerCase();

            const buildClaimListResult = await this.buildClaimList(chainName,chainId,address);
            if(buildClaimListResult.error){
                ConvertJSONResponeMiddleware.errorJSONResponce(ctx,SystemDefaultError.INTERNALSERVERERROR);
            }else{
                this.convertToClaimListToJson(ctx,buildClaimListResult.data!);
            }
        }

        this.merkleproof = async (ctx:Router.IRouterContext,next: () => Promise<any>) => {
            let chainName = String(ctx.query.chainname).toLowerCase();
            let chainId = String(ctx.query.chainid).toLowerCase();
            let token = String(ctx.query.token).toLowerCase();
            let account = String(ctx.query.address).toLowerCase();

            const getMerkleProofResult = await this.getMerkleProof(chainName,chainId,account,token);
            if(getMerkleProofResult.error){
                ConvertJSONResponeMiddleware.errorJSONResponce(ctx,SystemDefaultError.INTERNALSERVERERROR);
            }else{
                this.convertToMerkleProofToJson(ctx,getMerkleProofResult.data!);
            }
        }
    }

    private convertToClaimListToJson(ctx:Router.IRouterContext,list:Array<ClaimMeta>){
        let body = {
            claimList:new Array()
        }

        for(const meta of list){
            const data = {
                merkleRoot:meta.merkleRoot,
                from:{
                    chainName:meta.from.chainName,
                    chainId:meta.from.chainId,
                    name:meta.from.name,
                    symbol:meta.from.symbol,
                    decimals:meta.from.decimals,
                    address:meta.from.address,
                    nativeCoin:meta.from.nativeCoin,
                    tokenType:meta.from.tokenType
                },
                to:{
                    chainName:meta.to.chainName,
                    chainId:meta.to.chainId,
                    name:meta.to.name,
                    symbol:meta.to.symbol,
                    decimals:meta.to.decimals,
                    address:meta.to.address,
                    nativeCoin:meta.to.nativeCoin,
                    tokenType:meta.to.tokenType
                },
                sendingTxs:meta.sendingTxs,
                receivingTx:meta.receivingTx,
                totalAmount:"0x"+meta.totalAmount.toString(16),
                status:meta.status
            }
            body.claimList.push(data);
        }

        ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,body);
    }

    private async buildClaimList(chainName:string,chainId:string,account:string):Promise<ActionData<ClaimMeta[]>>{
        let result = new ActionData<ClaimMeta[]>();
        result.data = new Array<ClaimMeta>();

        const baseInfoResult = await this.getBaseInfo(chainName,chainId,account);
        if(baseInfoResult.error){
            result.error = baseInfoResult.error;
            return result;
        }
        const sn = baseInfoResult.data!.sn;
        const ledgers = baseInfoResult.data!.ledgers;

        const getInProcessListResult = await this.getInProcessClaimList(chainName,chainId,account,sn);
        if(getInProcessListResult.error){
            result.error = getInProcessListResult.error;
            return result;
        }

        const getClaimListResult = await this.getClaimList(sn,ledgers);
        if(getClaimListResult.error){
            result.error = getClaimListResult.error;
            return result;
        }

        result.data = result.data.concat(getInProcessListResult.data!,getClaimListResult.data!);
        return result;
    }

    private async getBaseInfo(chainName:string,chainId:string,account:string):Promise<ActionData<{sn:BridgeSnapshoot,ledgers:BridgeLedger[]}>>{
        let result = new ActionData<{sn:BridgeSnapshoot,ledgers:BridgeLedger[]}>();
        result.data = {sn:{merkleRoot:ZeroRoot(),parentMerkleRoot:ZeroRoot(),chains:[]},ledgers:[]};
        
        const getLastSnapshootResult = await (new SnapshootModel(this.environment)).getLastSnapshoot();
        if(getLastSnapshootResult.error){
            result.error = getLastSnapshootResult.error;
            return result;
        }
        result.data.sn = getLastSnapshootResult.data!;

        const getLedgersResult = await (new LedgerModel(this.environment)).loadSnByAccount(result.data.sn.merkleRoot,chainName,chainId,account);
        if(getLedgersResult.error){
            result.error = getLedgersResult.error;
            return result;
        }
        result.data.ledgers = getLedgersResult.data!;
        return result;
    }

    private async getInProcessClaimList(chainName:string,chainId:string,account:string,sn:BridgeSnapshoot,limit:number = 50,offset:number = 0):Promise<ActionData<ClaimMeta[]>>{
        let result = new ActionData<ClaimMeta[]>();
        result.data = new Array<ClaimMeta>();

        const sourceChainInfo = sn.chains.find(chain => {return chain.chainName != chainName && chain.chainId != chainId})!;
        const getSwapTxsResult = await (new SwapTxModel(this.environment)).getSwapTxs(sourceChainInfo.chainName,sourceChainInfo.chainId,account,undefined,sourceChainInfo.endBlockNum,undefined,limit,offset);
        if(getSwapTxsResult.error){
            result.error = getSwapTxsResult.error;
            return result;
        }

        let claimList = new Array<ClaimMeta>();
        for(const swapTx of getSwapTxsResult.data!){
            let targetMeta = claimList.find(target =>{ return target.to.chainName == chainName && target.to.chainId == chainId && target.from.address.toLowerCase() == swapTx.token.toLowerCase();});
            if(targetMeta == undefined){
                let fromToken = (this.environment.tokenInfo as Array<TokenInfo>).find(token => {return token.chainName == sourceChainInfo.chainName && token.chainId == sourceChainInfo.chainId && token.address.toLowerCase() == swapTx.token.toLowerCase()})!;
                let toToken = (this.environment.tokenInfo as Array<TokenInfo>).find(token => {return token.tokenid == fromToken.targetTokenId;})!;
                let newMeta:ClaimMeta = {
                    merkleRoot:"",
                    from:fromToken,
                    to:toToken,
                    sendingTxs:[swapTx.txid],
                    receivingTx:"",
                    totalAmount:swapTx.amount,
                    status:0
                }
                claimList.push(newMeta);
            } else {
                targetMeta.sendingTxs.push(swapTx.txid);
                targetMeta.totalAmount = targetMeta.totalAmount + swapTx.amount;
            }
        }
        result.data = claimList;
        return result;
    }

    private async getClaimList(sn:BridgeSnapshoot,ledgers:BridgeLedger[]):Promise<ActionData<ClaimMeta[]>>{
        let result = new ActionData<ClaimMeta[]>();
        result.data = new Array<ClaimMeta>();

        let claimList = new Array<ClaimMeta>();
        for(const ledger of ledgers){
            const toToken = (this.environment.tokenInfo as Array<TokenInfo>).find(token => {return token.chainName == ledger.chainName && token.chainId == ledger.chainId && token.address.toLowerCase() == ledger.token.toLowerCase()})!;
            const fromToken = (this.environment.tokenInfo as Array<TokenInfo>).find(token => {return token.tokenid == toToken.targetTokenId;})!;
            const toChainInfo = sn.chains.find(chain =>{return chain.chainName == toToken.chainName && chain.chainId == toToken.chainId})!;
            const fromChainInfo = sn.chains.find(chain =>{return chain.chainName == fromToken.chainName && chain.chainId == fromToken.chainId})!;
            let newMeta:ClaimMeta = {
                merkleRoot:sn.merkleRoot,
                from:fromToken,
                to:toToken,
                sendingTxs:[],
                receivingTx:"",
                totalAmount:ledger.balance,
                status:1
            }

            const getClaimTxsResult = await (new SwapTxModel(this.environment)).getClaimTxs(ledger.chainName,ledger.chainId,ledger.account,ledger.token,undefined,undefined,2,0);
            if(getClaimTxsResult.error){
                result.error = getClaimTxsResult.error;
                return result;
            }

            if(getClaimTxsResult.data!.length == 0){
                const getSwapTxResult = await (new SwapTxModel(this.environment)).getSwapTxs(fromToken.chainName,fromToken.chainId,ledger.account,fromToken.address,undefined,undefined,10,0);
                if(getSwapTxResult.error){
                    result.error = getSwapTxResult.error;
                    return result;
                }
                for(const swaptx of getSwapTxResult.data!){
                    newMeta.sendingTxs.push(swaptx.txid);
                    newMeta.status = 1;
                }
            } else if(getClaimTxsResult.data!.length == 1){
                const claimTx = getClaimTxsResult.data![0];
                if(claimTx.blockNumber >= toChainInfo.endBlockNum){
                    const getSwapTxResult = await (new SwapTxModel(this.environment)).getSwapTxs(fromToken.chainName,fromToken.chainId,ledger.account,fromToken.address,undefined,fromChainInfo.endBlockNum,10,0);
                    if(getSwapTxResult.error){
                        result.error = getSwapTxResult.error;
                        return result;
                    }
                    for(const swaptx of getSwapTxResult.data!){
                        newMeta.sendingTxs.push(swaptx.txid);
                    }
                    newMeta.receivingTx = claimTx.txid;
                    newMeta.status = 2;
                } else {
                    const getSwapTxResult = await (new SwapTxModel(this.environment)).getSwapTxs(fromToken.chainName,fromToken.chainId,ledger.account,fromToken.address,fromChainInfo.beginBlockNum,fromChainInfo.endBlockNum,10,0);
                    if(getSwapTxResult.error){
                        result.error = getSwapTxResult.error;
                        return result;
                    }
                    for(const swaptx of getSwapTxResult.data!){
                        newMeta.sendingTxs.push(swaptx.txid);
                    }
                    newMeta.receivingTx = "";
                    newMeta.status = 1;
                }
            } else if(getClaimTxsResult.data!.length == 2){
                const claimTx1 = getClaimTxsResult.data![0];
                const claimTx2 = getClaimTxsResult.data![1];

                if(claimTx1.blockNumber >= toChainInfo.endBlockNum){
                    const getSwapTxResult = await (new SwapTxModel(this.environment)).getSwapTxs(fromToken.chainName,fromToken.chainId,ledger.account,fromToken.address,undefined,fromChainInfo.endBlockNum,10,0);
                    if(getSwapTxResult.error){
                        result.error = getSwapTxResult.error;
                        return result;
                    }
                    const swaptxs = getSwapTxResult.data!.filter(tx => {return tx.timestamp >= claimTx2.timestamp;});
                    for(const swaptx of swaptxs){
                        newMeta.sendingTxs.push(swaptx.txid);
                    }
                    newMeta.receivingTx = claimTx1.txid;
                    newMeta.status = 2;
                } else {
                    const getSwapTxResult = await (new SwapTxModel(this.environment)).getSwapTxs(fromToken.chainName,fromToken.chainId,ledger.account,fromToken.address,fromChainInfo.beginBlockNum,fromChainInfo.endBlockNum,10,0);
                    if(getSwapTxResult.error){
                        result.error = getSwapTxResult.error;
                        return result;
                    }
                    for(const swaptx of getSwapTxResult.data!){
                        newMeta.sendingTxs.push(swaptx.txid);
                    }
                    newMeta.receivingTx = "";
                    newMeta.status = 1;
                }
            }
            claimList.push(newMeta);
        }
        result.data = claimList;
        return result;
    }

    private async getMerkleProof(chainName:string,chainId:string,account:string,token:string):Promise<ActionData<{ledger:BridgeLedger,proof:string[]}>>{
        let result = new ActionData<{ledger:BridgeLedger,proof:string[]}>();

        const getLastSnapshootResult = await (new SnapshootModel(this.environment)).getLastSnapshoot();
        if(getLastSnapshootResult.error){
            result.error = getLastSnapshootResult.error;
            return result;
        }

        const sn = getLastSnapshootResult.data!;
        const getParentSnResult = await (new SnapshootModel(this.environment)).getSnapshootByRoot(sn.parentMerkleRoot);
        if(getParentSnResult.error){
            result.error = getParentSnResult.error;
            return result;
        }
        const parentSn = getParentSnResult.data!;

        const getLedgersResult = await (new LedgerModel(this.environment)).load(parentSn.merkleRoot);
        if(getLedgersResult.error){
            result.error = getLedgersResult.error;
            return result;
        }
        const ledgers = getLedgersResult.data!;

        const getSwapTxsResult = await (new SwapTxModel(this.environment)).getSwapTxsBySnapshoot(sn);
        if(getSwapTxsResult.error){
            result.error = getSwapTxsResult.error;
            return result;
        }
        const swaptxs = getSwapTxsResult.data!;

        let storage = new BridgeStorage(parentSn,this.environment.tokenInfo,ledgers);
        let updateResult = await storage.updateLedgers(swaptxs);
        if(updateResult.error){
            result.error = updateResult.error;
            return result;
        }
        const treenode = storage.buildTree(sn.chains,sn.parentMerkleRoot);
        
        if(treenode.nodeHash != sn.merkleRoot){
            result.error = `syncDataBySnapshoot error:hash mismatching, root: ${sn.merkleRoot} treeNode: ${treenode.nodeHash}`;
            return result;
        }

        const targetLedger = storage.ledgerCache.find(ledger => {return ledger.chainName == chainName 
            && ledger.chainId == chainId && ledger.account.toLowerCase() == account.toLowerCase()});
        if(targetLedger != undefined){
            targetLedger.root = sn.merkleRoot;
            const proof = storage.getMerkleProof(targetLedger);
            const verify = BridgeStorage.verificationMerkleProof(targetLedger,sn.merkleRoot,proof);
            if(verify == false){
                result.error = `Merkleproof invalid`;
                return result;
            }
            result.data = {ledger:targetLedger,proof:proof};
        }
        return result;
    }

    private async convertToMerkleProofToJson(ctx:Router.IRouterContext,data:{ledger:BridgeLedger,proof:string[]}){
        let body = {
            merkleRoot:data.ledger.root || "",
            chainName:data.ledger.chainName,
            chainId:data.ledger.chainId,
            account:data.ledger.account,
            token:data.ledger.token,
            balance:"0x" + data.ledger.balance.toString(16),
            merkleProof:data.proof
        }
        ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,body);
    }
}