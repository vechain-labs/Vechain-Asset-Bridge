import Router from "koa-router";
import { type } from "os";
import BridgeTxModel from "../../common/model/bridgeTxModel";
import { SnapshootModel } from "../../common/model/snapshootModel";
import TokenInfoModel from "../../common/model/tokenInfoModel";
import BridgeStorage from "../../common/utils/bridgeStorage";
import { ActionData } from "../../common/utils/components/actionResult";
import { BridgeSnapshoot } from "../../common/utils/types/bridgeSnapshoot";
import { SwapBridgeTx } from "../../common/utils/types/bridgeTx";
import { HashEvent } from "../../common/utils/types/hashEvent";
import { TokenInfo } from "../../common/utils/types/tokenInfo";
import ConvertJSONResponeMiddleware from "../../middleware/convertJSONResponeMiddleware";
import { BaseMiddleware } from "../../utils/baseMiddleware";
import { SystemDefaultError } from "../../utils/error";
import { HistoryMeta } from "../../utils/types/historyMeta";
import HistoryModel from "./historyModel";


export default class BridgeController extends BaseMiddleware{
    public history:Router.IMiddleware;
    public merkleproof:Router.IMiddleware;
    public packstep:Router.IMiddleware;
    public tokens:Router.IMiddleware;

    constructor(env:any){
        super(env);
        this.config = env.config;
        this.historyModel = new HistoryModel(env);
        this.bridgeTxModel = new BridgeTxModel(env);
        this.snapshootModel = new SnapshootModel(env);
        this.tokenInfoModel = new TokenInfoModel();

        this.history = async (ctx:Router.IRouterContext,next: () => Promise<any>) => {
            let chainName = String(ctx.query.chainname).toLowerCase();
            let chainId = String(ctx.query.chainid).toLowerCase();
            let address = String(ctx.query.address).toLowerCase();
            let filter = String(ctx.query.filter).toLowerCase();
            let limit = ctx.query.limit != undefined ? Number(ctx.query.limit) : 20;
            let offset = ctx.query.offset != undefined ? Number(ctx.query.offset) : 0;

            if(filter == 'ongoing'){
                const ongoingListResult = await this.historyModel.getOnGoingHistory(chainName,chainId,address,limit,offset);
                if(ongoingListResult.error){
                    ConvertJSONResponeMiddleware.errorJSONResponce(ctx,SystemDefaultError.INTERNALSERVERERROR);
                }
                this.convertToHistoryToJson(ctx,ongoingListResult.data!);
            } else if(filter == 'completed'){
                const completedListResult = await this.historyModel.getCompletedHistory(chainName,chainId,address,limit,offset);
                if(completedListResult.error){
                    ConvertJSONResponeMiddleware.errorJSONResponce(ctx,SystemDefaultError.INTERNALSERVERERROR);
                }
                this.convertToHistoryToJson(ctx,completedListResult.data!);
            } else {
                ConvertJSONResponeMiddleware.errorJSONResponce(ctx,new Error('Filter Invalid'));
            }
        }

        this.merkleproof = async (ctx:Router.IRouterContext,next: () => Promise<any>) => {
            let bridgeTxid = String(ctx.query.bridgetxid).toLowerCase();
            const getClaimMetaResult = await this.getClaimMeta(bridgeTxid);
            if(getClaimMetaResult.error){
                ConvertJSONResponeMiddleware.errorJSONResponce(ctx,getClaimMetaResult.error);
            } else {
                this.convertClaimMetaToJson(ctx,getClaimMetaResult.data!);
            }
        }

        this.packstep = async (ctx:Router.IRouterContext,next:() => Promise<any>) => {
            ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,{step:env.config.packstep});
        }

        this.tokens = async (ctx:Router.IRouterContext,next:() => Promise<any>) => {
            const tokensResult = await this.historyModel.getTokenList();
            if(tokensResult.error){
                ConvertJSONResponeMiddleware.errorJSONResponce(ctx,SystemDefaultError.INTERNALSERVERERROR);
            }
            this.convertTokensToJson(ctx,tokensResult.data!);
        }
    }

    private convertToHistoryToJson(ctx:Router.IRouterContext,history:Array<HistoryMeta>){
        let body = { history: new Array()};
        for(const item of history){
            let his = {
                bridgeTxId:item.bridgeTxId,
                merkleRoot:item.merkleRoot,
                from:{
                    chainName:item.from.chainName,
                    chainId:item.from.chainId,
                    name:item.from.name,
                    symbol:item.from.symbol,
                    decimals:item.from.decimals,
                    contract:item.from.nativeCoin ? "" : item.from.contract,
                    nativeCoin:item.from.nativeCoin,
                    tokenType:item.from.tokenType,
                    reward:Number(item.reward)
                },
                to:{
                    chainName:item.to.chainName,
                    chainId:item.to.chainId,
                    name:item.to.name,
                    symbol:item.to.symbol,
                    decimals:item.to.decimals,
                    contract:item.to.contract,
                    nativeCoin:item.to.nativeCoin,
                    tokenType:item.to.tokenType,
                },
                sender:item.sender,
                receiver:item.receiver,
                swapTx:item.swapTx,
                claimTx:item.claimTx,
                swapAmount:'0x' + item.swapAmount.toString(16),
                rewardFee:'0x' + item.rewardFee.toString(16),
                claimAmount:'0x' + item.claimAmount.toString(16),
                swapCount:'0x' + item.swapCount.toString(16),
                status:item.status
            }

            if(his.from.chainName == 'vechain' && his.from.nativeCoin){
                his.from.name = 'VET',
                his.from.symbol = 'VET'
                his.from.contract = "";
            }

            if(his.to.chainName == 'ethereum' && his.to.nativeCoin){
                his.to.name = 'VET',
                his.to.symbol = 'VET'
                his.to.contract = "";
            }

            if(his.from.chainName == 'ethereum' && his.from.nativeCoin){
                his.from.name = 'ETH',
                his.from.symbol = 'ETH'
                his.from.contract = "";
            }

            if(his.to.chainName == 'ethereum' && his.to.nativeCoin){
                his.to.name = 'ETH',
                his.to.symbol = 'ETH'
                his.to.contract = "";
            }

            body.history.push(his);
        }
        ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,body);
    }

    private convertClaimMetaToJson(ctx:Router.IRouterContext,claim:ClaimMeta){
        let body = {
            meta:{
                root:claim.root,
                token:claim.token,
                receipt:claim.receipt,
                amount:'0x' + claim.amount.toString(16),
                swapCount:'0x' + claim.swapCount.toString(16),
                merkleProof:claim.merkleProof
            }
        }
        ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,body);
    }

    private convertTokensToJson(ctx:Router.IRouterContext,tokens:Array<TokenInfo>){
        let body = {
            tokens:Array()
        }

        for(const token of tokens){
            let t = {
                chainName:token.chainName,
                chainId:token.chainId,
                name:token.name,
                symbol:token.symbol,
                decimals:token.decimals,
                contract:token.tokenAddr,
                nativeCoin:token.nativeCoin,
                tokenType:token.tokenType,
            }

            if(t.chainName == 'vechain' && t.nativeCoin){
                t.name = 'VET',
                t.symbol = 'VET'
                t.contract = "";
            }

            if(t.chainName == 'ethereum' && t.nativeCoin){
                t.name = 'ETH',
                t.symbol = 'ETH'
                t.contract = "";
            }
            body.tokens.push(t);
        }
        ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,body);
    }

    private async getClaimMeta(bridgeTxId:string):Promise<ActionData<ClaimMeta>>{
        let result = new ActionData<ClaimMeta>();

        const getBridgeTxResult = await this.bridgeTxModel.getBridgeTxById(bridgeTxId);
        
        if(getBridgeTxResult.error){
            result.error = getBridgeTxResult.error;
            return result;
        } else if(getBridgeTxResult.data == undefined || getBridgeTxResult.data.type == 2){
            result.error = new Error("Can't found the bridge transaction");
            return result;
        }
        const bridgeTx = getBridgeTxResult.data as SwapBridgeTx;

        const getSNResult = await this.historyModel.getSnapshootByBlockNum(bridgeTx.chainName,bridgeTx.chainId,bridgeTx.blockNumber);
        if(getSNResult.error){
            result.error = getSNResult.error;
            return result;
        } else if(getSNResult.data == undefined){
            result.error = new Error("The bridgetx is in process");
            return result;
        }
        const sn = getSNResult.data;

        const getHashEventsResult = await this.getSubmitEventsBySn(sn);
        if(getHashEventsResult.error){
            result.error = getHashEventsResult.error;
            return result;
        }
        const events = getHashEventsResult.data!;

        const storage = new BridgeStorage();
        const appid = events.length > 0 ? events[0].appid : "";
        storage.buildTree(appid,sn,events);
        const treeRoot = storage.getMerkleRoot();
        if(treeRoot.toLowerCase() != sn.merkleRoot.toLowerCase()){
            result.error = new Error('Merkleroot hash mismatching');
        }
        
        const merkleProof = storage.getMerkleProof(appid,bridgeTx.swapTxHash);

        const tokenInfoResult = await this.tokenInfoModel.getTokenInfos();
            if(tokenInfoResult.error){
                result.error = tokenInfoResult.error;
                return result;
            }

        const targetToken = tokenInfoResult.data!.find(t => {return t.targetChainName == bridgeTx.chainName && t.targetChainId == bridgeTx.chainId && t.targetTokenAddr.toLowerCase() == bridgeTx.token.toLowerCase();})!;

        result.data = {
            root:sn.merkleRoot,
            token:targetToken.nativeCoin ? "" : targetToken.tokenAddr,
            receipt:bridgeTx.recipient,
            amount:bridgeTx.amountOut,
            swapCount:bridgeTx.swapCount,
            merkleProof:merkleProof
        }
        return result;
    }

    private async getSubmitEventsBySn(sn:BridgeSnapshoot):Promise<ActionData<HashEvent[]>>{
        let result = new ActionData<HashEvent[]>();
        result.data = new Array();

        const vechain = sn.chains.find( item => {return item.chainName == this.config.vechain.chainName && item.chainId == this.config.vechain.chainId})!;
        const ethereum = sn.chains.find( item => {return item.chainName == this.config.ethereum.chainName && item.chainId == this.config.ethereum.chainId})!;

        const getVHashEventsResult = await this.snapshootModel.getHashEventsByRange(vechain.chainName,vechain.chainId,{blockNum:{from:vechain.beginBlockNum,to:vechain.endBlockNum}});
        const getEHashEventsResult = await this.snapshootModel.getHashEventsByRange(ethereum.chainName,ethereum.chainId,{blockNum:{from:ethereum.beginBlockNum,to:ethereum.endBlockNum}});

        if(getVHashEventsResult.error){
            result.error = getVHashEventsResult.error;
            return result;
        }

        if(getEHashEventsResult.error){
            result.error.getEHashEventsResult.error;
            return result;
        }

        result.data = result.data.concat(getVHashEventsResult.data!); 
        result.data = result.data.concat(getEHashEventsResult.data!); 

        return result;
    }

    private historyModel:HistoryModel;
    private bridgeTxModel:BridgeTxModel;
    private snapshootModel:SnapshootModel;
    private tokenInfoModel:TokenInfoModel;
    private config:any;
}

type ClaimMeta = {
    root:string,
    token:string,
    receipt:string,
    amount:BigInt,
    swapCount:BigInt,
    merkleProof:string[]
}