import { BaseMiddleware } from "../../utils/baseMiddleware";
import Router from "koa-router";
import { claimID, ClaimMeta } from "../../utils/types/claimMeta";
import { ActionData } from "../../../common/utils/components/actionResult";
import ConvertJSONResponeMiddleware from "../../middleware/convertJSONResponeMiddleware";
import { SnapshootModel } from "../../../common/model/snapshootModel";
import LedgerModel from "../../../common/model/ledgerModel";
import { BridgeSnapshoot, ZeroRoot } from "../../../common/utils/types/bridgeSnapshoot";
import { BridgeLedger } from "../../../common/utils/types/bridgeLedger";
import { TokenInfo } from "../../../common/utils/types/tokenInfo";
import { SystemDefaultError } from "../../utils/error";
import BridgeStorage from "../../../common/bridgeStorage";
import { BridgeSyncTask } from "../../../ValidationNode/bridgeSyncTask";
import { BridgePackTask } from "../../../ValidationNode/bridgePackTask";
import { BridgeTx } from "../../../common/utils/types/bridgeTx";
import BridgeTxModel from "../../../common/model/bridgeTxModel";
import { EthereumBridgeHead } from "../../../common/ethereumBridgeHead";
import { VeChainBridgeHead } from "../../../common/vechainBridgeHead";

export default class BridgeController extends BaseMiddleware{
    public claimList:Router.IMiddleware;
    public merkleproof:Router.IMiddleware;
    public pack:Router.IMiddleware;
    public packStatus:Router.IMiddleware;

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
            let token = String(ctx.query.token || "").toLowerCase();
            let account = String(ctx.query.address).toLowerCase();

            const getMerkleProofResult = await this.getMerkleProof(chainName,chainId,account,token);
            if(getMerkleProofResult.error){
                ConvertJSONResponeMiddleware.errorJSONResponce(ctx,SystemDefaultError.INTERNALSERVERERROR);
            }else{
                this.convertToMerkleProofToJson(ctx,getMerkleProofResult.data!);
            }
        }

        this.pack = async (ctx:Router.IRouterContext,next: () => Promise<any>) => {
            const syncTask = new BridgeSyncTask(this.environment);
            const packTask = new BridgePackTask(this.environment);

            const ethereumBridgeStatusResult = await (new EthereumBridgeHead(this.environment)).getLockedStatus();
            const vechainBridgeStatusResult = await (new VeChainBridgeHead(this.environment)).getLockedStatus();

            if(ethereumBridgeStatusResult.error == undefined && ethereumBridgeStatusResult.data == true){
                this.environment.bridgePack = true;
                return;
            }
            if(vechainBridgeStatusResult.error == undefined && vechainBridgeStatusResult.data == true){
                this.environment.bridgePack = true;
                return;
            }

            if(this.environment.bridgePack == false){
                this.environment.bridgePack = true;
                syncTask.taskJob().then( action => {
                    console.info(`Sync Bridge Data Finish`);
                    packTask.taskJob().then( action1 => {
                        console.info(`Pack Bridge Data Finish`);
                        this.environment.bridgePack = false;
                    }).catch(error => {
                        console.error(`Pack Bridge Data Faild, ${error}`);
                        this.environment.bridgePack = false;
                    });
                }
                ).catch(error => {
                    console.error(`Sync Bridge Data Faild, ${error}`);
                    this.environment.bridgePack = false;
                });
            }
            ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,{});
        }

        this.packStatus = async (ctx:Router.IRouterContext,next: () => Promise<any>) => {
            const ethereumBridgeStatusResult = await (new EthereumBridgeHead(this.environment)).getLockedStatus();
            const vechainBridgeStatusResult = await (new VeChainBridgeHead(this.environment)).getLockedStatus();
            let status = this.environment.bridgePack;
            if(ethereumBridgeStatusResult.error == undefined && ethereumBridgeStatusResult.data == true){
                status = true;
            }
            if(vechainBridgeStatusResult.error == undefined && vechainBridgeStatusResult.data == true){
                status = true;
            }
            if(ethereumBridgeStatusResult.data == false && vechainBridgeStatusResult.data == false){
                status = false;
            }
            ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,{packing:this.environment.bridgePack});
        }
    }

    private convertToClaimListToJson(ctx:Router.IRouterContext,list:Array<ClaimMeta>){
        let body = {
            claimList:new Array()
        }

        for(const meta of list){
            const data = {
                claimId:meta.claimId,
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
                sendingTxs:new Array(),
                receivingTx:{},
                totalAmount:"0x"+meta.totalAmount.toString(16),
                status:meta.status
            }

            for(const sendingTx of meta.sendingTxs){
                data.sendingTxs.push({
                    txId:sendingTx.txid,
                    amount:"0x" + sendingTx.amount.toString(16),
                    timestamp:sendingTx.timestamp
                });
            }

            if(meta.receivingTx != undefined){
                data.receivingTx = {
                    txId:meta.receivingTx.txid,
                    timestamp:meta.receivingTx.timestamp
                }
            }

            if(data.from.nativeCoin == true){
                if(data.from.symbol == "VVET"){
                    data.from.symbol = "VET";
                    data.from.name = "VET";
                    data.from.address = "";
                } else if(data.from.symbol == "WETH"){
                    data.from.symbol = "ETH";
                    data.from.name = "ETH";
                    data.from.address = "";
                }
            }

            if(data.to.nativeCoin == true){
                if(data.to.symbol == "VVET"){
                    data.to.symbol = "VET";
                    data.to.name = "VET";
                    data.to.address = "";
                } else if(data.to.symbol == "WETH"){
                    data.to.symbol = "ETH";
                    data.to.name = "ETH";
                    data.to.address = "";
                }
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

        const getWattingClaimListResult = await this.getWattingClaimList(chainName,chainId,account,sn,10,0);
        if(getWattingClaimListResult.error){
            result.error = getWattingClaimListResult.error;
            return result;
        }

        const getClaimedListResult = await this.getClaimedList(chainName,chainId,account,sn,5,0);
        if(getClaimedListResult.error){
            result.error = getClaimedListResult.error;
            return result;
        }

        result.data = result.data.concat(getInProcessListResult.data!,getWattingClaimListResult.data!,getClaimedListResult.data!);
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

    private async getMerkleProof(chainName:string,chainId:string,account:string,token:string):Promise<ActionData<{ledger?:BridgeLedger,proof?:string[]}>>{
        let result = new ActionData<{ledger?:BridgeLedger,proof?:string[]}>();

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

        const getSwapTxsResult = await (new BridgeTxModel(this.environment)).getSwapTxsBySnapshoot(sn);
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

        let tokenAdd = token;
        if(tokenAdd == ""){
            let nativeCoinToken = (this.environment.tokenInfo as Array<TokenInfo>).find(token => {return token.chainId == chainId && token.chainName == chainName && token.nativeCoin == true;});
            if(nativeCoinToken == undefined){
                result.error = `Can't found nativecoin on ChainName:${chainName} ChainId:${chainId}`;
                return result;
            }
            tokenAdd = nativeCoinToken.address;
        }

        const targetLedger = storage.ledgerCache.find(ledger => {return ledger.chainName == chainName 
            && ledger.chainId == chainId && ledger.account.toLowerCase() == account.toLowerCase() && ledger.token.toLowerCase() == tokenAdd.toLowerCase()});
        if(targetLedger != undefined){
            targetLedger.root = sn.merkleRoot;
            const proof = storage.getMerkleProof(targetLedger);
            const verify = BridgeStorage.verificationMerkleProof(targetLedger,sn.merkleRoot,proof);
            if(verify == false){
                result.error = `Merkleproof invalid`;
                return result;
            }
            if(token == ""){
                targetLedger.token = "";
            }
            result.data = {ledger:targetLedger,proof:proof};
        } else {
            result.data = {};
        }
        return result;
    }

    private async convertToMerkleProofToJson(ctx:Router.IRouterContext,data:{ledger?:BridgeLedger,proof?:string[]}){
        let body = {};
        if(data.ledger != undefined && data.proof != undefined){
            body = {
                merkleRoot:data.ledger.root || "",
                chainName:data.ledger.chainName,
                chainId:data.ledger.chainId,
                account:data.ledger.account,
                token:data.ledger.token,
                balance:"0x" + data.ledger.balance.toString(16),
                merkleProof:data.proof
            }
        }
        ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,body);
    }

    private async getInProcessClaimList(chainName:string,chainId:string,account:string,sn:BridgeSnapshoot,limit?:number,offset:number = 0):Promise<ActionData<ClaimMeta[]>>{
        let result = new ActionData<ClaimMeta[]>();
        result.data = new Array<ClaimMeta>();

        const swapChainInfo = sn.chains.find(chain => {return chain.chainName != chainName && chain.chainId != chainId})!;
        const getSwapTxsResult = await (new BridgeTxModel(this.environment)).getSwapTxs(swapChainInfo.chainName,swapChainInfo.chainId,account,undefined,swapChainInfo.endBlockNum,undefined,limit,offset);
        if(getSwapTxsResult.error){
            result.error = getSwapTxsResult.error;
            return result;
        }

        let claimList = new Array<ClaimMeta>();
        for(const swapTx of getSwapTxsResult.data!){
            let targetMeta = claimList.find(target =>{ return target.to.chainName == chainName && target.to.chainId == chainId && target.from.address.toLowerCase() == swapTx.token.toLowerCase();});
            if(targetMeta == undefined){
                let fromToken = (this.environment.tokenInfo as Array<TokenInfo>).find(token => {return token.chainName == swapChainInfo.chainName && token.chainId == swapChainInfo.chainId && token.address.toLowerCase() == swapTx.token.toLowerCase()})!;
                let toToken = (this.environment.tokenInfo as Array<TokenInfo>).find(token => {return token.tokenid == fromToken.targetTokenId;})!;
                let newMeta:ClaimMeta = {
                    claimId:"",
                    merkleRoot:ZeroRoot(),
                    account:account,
                    from:fromToken,
                    to:toToken,
                    sendingTxs:[swapTx],
                    receivingTx:undefined,
                    totalAmount:swapTx.amount,
                    status:0,
                    extension:{
                        latestTs:swapTx.timestamp
                    }
                }
                newMeta.claimId = claimID(sn.merkleRoot,newMeta);
                claimList.push(newMeta);
            } else {
                targetMeta.sendingTxs.push(swapTx);
                targetMeta.totalAmount = targetMeta.totalAmount + swapTx.amount;
                targetMeta.extension!.latestTs = swapTx.timestamp >= targetMeta.extension!.latestTs ? swapTx.timestamp : targetMeta.extension!.latestTs;
            }
        }
        result.data = claimList;
        result.data = result.data!.sort((a,b) => {return b.extension!.latestTs - a.extension!.latestTs});
        return result;
    }

    private async getWattingClaimList(chainName:string,chainId:string,account:string,sn:BridgeSnapshoot,limit?:number,offset:number = 0):Promise<ActionData<ClaimMeta[]>>{
        let result = new ActionData<ClaimMeta[]>();
        result.data = new Array<ClaimMeta>();

        const targetTokenList = (this.environment.tokenInfo as Array<TokenInfo>).filter(token => {return token.chainName == chainName && token.chainId == chainId});
        for(const token of targetTokenList){
            const getWattingClaimByTokenResult = await this.getWattingClaimByToken(token,account,sn,limit,offset);
            if(getWattingClaimByTokenResult.error){
                result.error = getWattingClaimByTokenResult.error;
                return result;
            }
            if(getWattingClaimByTokenResult.data != undefined){
                result.data.push(getWattingClaimByTokenResult.data);
            }
        }
        result.data = result.data!.sort((a,b) => {return b.extension!.latestTs - a.extension!.latestTs});

        const ethereumStatusResult = await (new EthereumBridgeHead(this.environment)).getLockedStatus();
        if(ethereumStatusResult.error){
            result.error = ethereumStatusResult.error;
            return result;
        }

        const vechainStatusResult = await (new VeChainBridgeHead(this.environment)).getLockedStatus();
        if(vechainStatusResult.error){
            result.error = vechainStatusResult.error;
            return result;
        }

        if(ethereumStatusResult.data == true || vechainStatusResult.data === true){
            for(let claimMeta of result.data){
                claimMeta.status = 0;
            }
        }

        return result;
    }

    private async getWattingClaimByToken(token:TokenInfo,account:string,sn:BridgeSnapshoot,limit?:number,offset:number = 0):Promise<ActionData<ClaimMeta>>{
        let result = new ActionData<ClaimMeta>();
        const bridgeTxModel = new BridgeTxModel(this.environment);
        const snapshootModel = new SnapshootModel(this.environment);
        
        const swapChainInfo = sn.chains.find(chain => {return chain.chainName != token.chainName && chain.chainId != token.chainId})!;
        const claimChainInfo = sn.chains.find(chain => {return chain.chainName == token.chainName && chain.chainId == token.chainId})!;

        const getLastClaimTxResult = await bridgeTxModel.getClaimTxs(claimChainInfo.chainName,claimChainInfo.chainId,account,token.address,undefined,undefined,1,0);
        if(getLastClaimTxResult.error){
            result.error = getLastClaimTxResult.error;
            return result;
        }
        let beginBlock = undefined;
        if(getLastClaimTxResult.data!.length == 1){
            const lastClaimTx = getLastClaimTxResult.data![0];
            const getLastClaimedSNResult = await snapshootModel.getSnapshootByClaimTx(lastClaimTx,1,0);

            if(getLastClaimedSNResult.error){
                result.error = getLastClaimedSNResult.error;
                return result;
            }

            const lastClaimedSN = getLastClaimedSNResult.data![0];

            if(lastClaimedSN.merkleRoot == sn.merkleRoot){
                return result;
            }

            beginBlock = (lastClaimedSN.chains.find(chain => {return chain.chainName == swapChainInfo.chainName && chain.chainId == swapChainInfo.chainId})!.endBlockNum) - 1;
        }
        const originToken = (this.environment.tokenInfo as Array<TokenInfo>).find(t => {return t.targetTokenId == token.tokenid})!;
        const getSwapTxsResult = await bridgeTxModel.getSwapTxs(swapChainInfo.chainName,swapChainInfo.chainId,account,originToken.address,beginBlock,swapChainInfo.endBlockNum -1,limit,offset);
        if(getSwapTxsResult.data!.length == 0){
            return result;
        }

        let newClaimMeta:ClaimMeta = {
            claimId:"",
            account:account,
            merkleRoot:ZeroRoot(),
            from:originToken,
            to:token,
            sendingTxs:[],
            receivingTx:undefined,
            totalAmount:BigInt(0),
            status:1,
            extension:{
                latestTs:0
            }
        }
        newClaimMeta.claimId = claimID(sn.parentMerkleRoot,newClaimMeta);

        for(const swaptx of getSwapTxsResult.data!){
            newClaimMeta.sendingTxs.push(swaptx);
            newClaimMeta.totalAmount = newClaimMeta.totalAmount + swaptx.amount;
            newClaimMeta.extension.latestTs = newClaimMeta.extension.latestTs <= swaptx.timestamp ? swaptx.timestamp : newClaimMeta.extension.latestTs;
        }
        result.data = newClaimMeta;
        return result;
    }

    private async getClaimedList(chainName:string,chainId:string,account:string,sn:BridgeSnapshoot,limit?:number,offset:number = 0):Promise<ActionData<ClaimMeta[]>>{
        let result = new ActionData<ClaimMeta[]>();
        result.data = new Array<ClaimMeta>();

        const targetTokenList = (this.environment.tokenInfo as Array<TokenInfo>).filter(token => {return token.chainName == chainName && token.chainId == chainId});
        for(const token of targetTokenList){
            const getWattingClaimByTokenResult = await this.getClaimedListByToken(token,account,sn,limit,offset);
            if(getWattingClaimByTokenResult.error){
                result.error = getWattingClaimByTokenResult.error;
                return result;
            }
            if(getWattingClaimByTokenResult.data != undefined && getWattingClaimByTokenResult.data.length > 0){
                result.data = result.data.concat(getWattingClaimByTokenResult.data);
            }
        }
        result.data = result.data!.sort((a,b) => {return b.extension!.latestTs - a.extension!.latestTs});
        return result;
    }

    private async getClaimedListByToken(token:TokenInfo,account:string,sn:BridgeSnapshoot,limit?:number,offset:number = 0):Promise<ActionData<ClaimMeta[]>>{
        let result = new ActionData<ClaimMeta[]>();
        result.data = new Array<ClaimMeta>();

        const bridgeTxModel = new BridgeTxModel(this.environment);
        const swapChainInfo = sn.chains.find(chain => {return chain.chainName != token.chainName && chain.chainId != token.chainId})!;
        const claimChainInfo = sn.chains.find(chain => {return chain.chainName == token.chainName && chain.chainId == token.chainId})!;

        const getClaimTxsResult = await bridgeTxModel.getClaimTxs(claimChainInfo.chainName,claimChainInfo.chainId,account,token.address,undefined,undefined,limit,offset);
        if(getClaimTxsResult.error){
            result.error = getClaimTxsResult.error;
            return result;
        }

        if(getClaimTxsResult.data != undefined && getClaimTxsResult.data.length > 0){
            for(let index = 0; index < getClaimTxsResult.data.length; index++){
                let endClaimTx = getClaimTxsResult.data[index];
                let beginClaimTx = index < getClaimTxsResult.data.length ? getClaimTxsResult.data[index + 1] : undefined;
                const getClaimedListResult = await this.getClaimedListByTokenAndClaim(token,account,beginClaimTx,endClaimTx,10,0);
                if(getClaimedListResult.error){
                    result.error = getClaimedListResult.error;
                    return result;
                }
                if(getClaimedListResult.data != undefined){
                    result.data.push(getClaimedListResult.data);
                }
            }
        }


        return result;
    }

    private async getClaimedListByTokenAndClaim(token:TokenInfo,account:string,beginClaimTx:BridgeTx|undefined,endClaimTx:BridgeTx,limit?:number,offset:number = 0):Promise<ActionData<ClaimMeta>>{
        let result = new ActionData<ClaimMeta>();
        const bridgeTxModel = new BridgeTxModel(this.environment);
        const snapshootModel = new SnapshootModel(this.environment);

        let beginBlock = undefined;
        let endBlock = undefined;

        if(beginClaimTx != undefined){
            const getBeginSNResult = await snapshootModel.getSnapshootByClaimTx(beginClaimTx,1,0);
            if(getBeginSNResult.error){
                result.error = getBeginSNResult.error;
                return result;
            }
            beginBlock = getBeginSNResult.data![0].chains.find(chain => {return chain.chainName != token.chainName && chain.chainId != token.chainId})!.endBlockNum;
        }
        const getEndSNResult = await snapshootModel.getSnapshootByClaimTx(endClaimTx,1,0);
        if(getEndSNResult.error){
            result.error = getEndSNResult.error;
            return result;
        }
        endBlock = getEndSNResult.data![0].chains.find(chain => {return chain.chainName != token.chainName && chain.chainId != token.chainId})!.endBlockNum;

        const swapChainInfo = getEndSNResult.data![0].chains.find(chain => {return chain.chainName != token.chainName && chain.chainId != token.chainId})!;
        const originToken = (this.environment.tokenInfo as Array<TokenInfo>).find(t => {return t.targetTokenId == token.tokenid})!;

        const getSwapTxsResult = await bridgeTxModel.getSwapTxs(swapChainInfo.chainName,swapChainInfo.chainId,account,originToken.address,beginBlock,endBlock,limit,offset);
        if(getSwapTxsResult.error){
            result.error = getSwapTxsResult.error;
            return result;
        }

        if(getSwapTxsResult.data != undefined && getSwapTxsResult.data.length == 0){
            return result;
        }

        const getSnapshootByParentrootResult = await snapshootModel.getSnapshootByRoot(getEndSNResult.data![0].parentMerkleRoot);
        if(getSnapshootByParentrootResult.error){
            result.error = getSnapshootByParentrootResult.error;
            return result;
        }

        result.data = {
            claimId:"",
            merkleRoot:getSnapshootByParentrootResult.data!.merkleRoot,
            account:account,
            from:originToken,
            to:token,
            sendingTxs:[],
            receivingTx:endClaimTx,
            totalAmount:BigInt(0),
            status:2,
            extension:{
                latestTs:endClaimTx.timestamp
            }
        }
        result.data.claimId = claimID(getSnapshootByParentrootResult.data!.merkleRoot,result.data);
        for(const swaptx of getSwapTxsResult.data!){
            result.data.sendingTxs.push(swaptx);
            result.data.totalAmount = result.data.totalAmount + swaptx.amount;
        }

        return result;
    }
}