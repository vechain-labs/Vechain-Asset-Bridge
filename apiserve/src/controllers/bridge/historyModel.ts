import { getManager, getRepository } from "typeorm";
import { SnapshootEntity } from "../../common/model/entities/snapshoot.entity";
import { SnapshootModel } from "../../common/model/snapshootModel";
import TokenInfoModel from "../../common/model/tokenInfoModel";
import { ActionData } from "../../common/utils/components/actionResult";
import { BridgeSnapshoot } from "../../common/utils/types/bridgeSnapshoot";
import { BaseBridgeTx } from "../../common/utils/types/bridgeTx";
import { TokenInfo } from "../../common/utils/types/tokenInfo";
import { HistoryMeta } from "../../utils/types/historyMeta";

export default class HistoryModel {
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.snapsshootModel = new SnapshootModel(env);
        this.tokenInfoModel = new TokenInfoModel();
    }

    public async getOnGoingHistory(chainname:string,chainid:string,account:string,limit:number = 20,offset:number = 0):Promise<ActionData<Array<HistoryMeta>>>{
        let result = new ActionData<Array<HistoryMeta>>();
        result.data = new Array();
        let snapshootCache = new Array<BridgeSnapshoot>();
        let tokenInfos = new Array<TokenInfo>();
        try {

            const lastSNResult = await this.snapsshootModel.getLastSnapshoot();
            if(lastSNResult.error){
                result.error = lastSNResult.error;
                return result;
            }

            const tokenInfoResult = await this.tokenInfoModel.getTokenInfos();
            if(tokenInfoResult.error){
                result.error = tokenInfoResult.error;
                return result;
            }
            tokenInfos = tokenInfoResult.data!;

            const sChainInfo = lastSNResult.data!.chains.find(item => {return item.chainName == chainname && item.chainId == chainid;})!;
            const tChainInfo = lastSNResult.data!.chains.find(item => {return item.chainName != chainname && item.chainId != chainid;})!;

            const sql = `
            select *,( select exists ( select 1 from hashevent as e where e.chainname = bridgeTx.chainname and e.chainid = bridgeTx.chainid and bridgeTx.swaptxhash = e.hash)) as "status"
            from bridgeTx
            where bridgeTx.type = 1
                    and not exists ( select 1 from bridgeTx as t where t.swaptxhash = bridgeTx.swaptxhash and t.type = 2 )
                    and (
                    ( bridgeTx.chainname = $0 and bridgeTx.chainid = $1 and lower(bridgeTx."from") = lower($2) )
                    and 
                        not exists (select 1 from hashevent as e where e.chainname = bridgeTx.chainname and e.chainid = bridgeTx.chainid and lower(bridgeTx.swaptxhash) = lower(e.hash))
                    )
                    or ( bridgeTx.chainname = $3 and bridgeTx.chainid = $4 and lower(bridgeTx.recipient) = lower($2)
                    )
            order by bridgeTx."timestamp" desc
            limit $5
            offset $6;`;
            const parameters:any[] = [sChainInfo.chainName,sChainInfo.chainId,account.toLowerCase(),tChainInfo.chainName,tChainInfo.chainId,limit,offset];

            const datas = await getManager().query(sql,parameters);
            if(datas != undefined && datas.length > 0){
                for(const data of datas){
                    let history:HistoryMeta = {
                        bridgeTxId:String(data.bridgetxid),
                        merkleRoot:"",
                        from:{
                            chainName:"",
                            chainId:"",
                            name:"",
                            symbol:"",
                            decimals:0,
                            contract:"",
                            nativeCoin:false,
                            tokenType:0
                        },
                        to:{
                            chainName:"",
                            chainId:"",
                            name:"",
                            symbol:"",
                            decimals:0,
                            contract:"",
                            nativeCoin:false,
                            tokenType:0
                        },
                        sender:String(data.from),
                        swapTx:String(data.txid),
                        receiver:String(data.recipient),
                        claimTx:"",
                        swapAmount:BigInt(data.amount),
                        reward:BigInt(data.reward),
                        claimAmount:BigInt(data.amountout),
                        rewardFee:BigInt(data.amount) - BigInt(data.amountout),
                        swapCount:BigInt(data.swapcount),
                        status:Number(data.status)
                    }

                    const getSnResult = await this.getSnapshootByBlockNum(data.chainname,data.chainid,data.blocknum,snapshootCache);
                    if(getSnResult.error){
                        result.error = getSnResult.error;
                        return result;
                    }
                    if(getSnResult.data != null){
                        history.merkleRoot = getSnResult.data.merkleRoot;
                        history.status = 1;
                    } else {
                        history.status = 0;
                    }

                    const fromToken = tokenInfos.find(t => {return t.chainName == data.chainname && t.chainId == data.chainid && t.tokenAddr.toLowerCase() == data.token.toLowerCase();})!;
                    const toToken = tokenInfos.find(t => {return t.chainName == fromToken.targetChainName && t.chainId == fromToken.targetChainId && t.targetTokenAddr.toLowerCase() == fromToken.tokenAddr.toLowerCase()})!;

                    history.from = {
                        chainName:fromToken.chainName,
                        chainId:fromToken.chainId,
                        name:fromToken.name,
                        symbol:fromToken.symbol,
                        decimals:fromToken.decimals,
                        contract:fromToken.tokenAddr,
                        nativeCoin:fromToken.nativeCoin,
                        tokenType:fromToken.tokenType
                    };
                    history.to = {
                        chainName:toToken.chainName,
                        chainId:toToken.chainId,
                        name:toToken.name,
                        symbol:toToken.symbol,
                        decimals:toToken.decimals,
                        contract:toToken.tokenAddr,
                        nativeCoin:toToken.nativeCoin,
                        tokenType:toToken.tokenType
                    };
                    result.data.push(history);
                }
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getCompletedHistory(chainname:string,chainid:string,account:string,limit:number = 20,offset:number = 0):Promise<ActionData<Array<HistoryMeta>>>{
        let result = new ActionData<Array<HistoryMeta>>();
        result.data = new Array();
        let snapshootCache = new Array<BridgeSnapshoot>();
        let tokenInfos = new Array<TokenInfo>();
        try {

            const lastSNResult = await this.snapsshootModel.getLastSnapshoot();
            if(lastSNResult.error){
                result.error = lastSNResult.error;
                return result;
            }

            const tokenInfoResult = await this.tokenInfoModel.getTokenInfos();
            if(tokenInfoResult.error){
                result.error = tokenInfoResult.error;
                return result;
            }
            tokenInfos = tokenInfoResult.data!;

            const sql = `
            select *,
            (select exists (select 1 from bridgeTx as t where t.type = 2 and t.swaptxhash = bridgeTx.swaptxhash)) as "isclaim"
            from bridgeTx
            where (
            bridgeTx.type = 1 and bridgeTx.chainname = $0 and bridgeTx.chainid = $1 and lower(bridgeTx."from") = lower($2)
            and exists (select 1 from hashevent as e where e.chainname = bridgeTx.chainname and e.chainid = bridgeTx.chainid and e.hash = bridgeTx.swaptxhash) 
            ) 
            or (
            bridgeTx.type = 2 and bridgeTx.chainname = $0 and bridgeTx.chainid = $1 and lower(bridgeTx.recipient) = lower($2)
            )
            order by bridgeTx."timestamp" desc
            limit $3
            offset $4;`

            const parameters:any[] = [chainname,chainid,account,limit,offset];
            const datas = await getManager().query(sql,parameters);
            if(datas != undefined && datas.length > 0){
                for(const data of datas){
                    let history:HistoryMeta = {
                        bridgeTxId:String(data.bridgetxid),
                        merkleRoot:"",
                        from:{
                            chainName:"",
                            chainId:"",
                            name:"",
                            symbol:"",
                            decimals:0,
                            contract:"",
                            nativeCoin:false,
                            tokenType:0
                        },
                        to:{
                            chainName:"",
                            chainId:"",
                            name:"",
                            symbol:"",
                            decimals:0,
                            contract:"",
                            nativeCoin:false,
                            tokenType:0
                        },
                        sender:"",
                        swapTx:"",
                        receiver:"",
                        claimTx:"",
                        swapAmount:BigInt(0),
                        reward:BigInt(0),
                        rewardFee:BigInt(0),
                        claimAmount:BigInt(0),
                        swapCount:BigInt(0),
                        status:1
                    }
                    const originToken = tokenInfos.find(t => {return t.chainName == data.chainname && t.chainId == data.chainid && t.tokenAddr.toLowerCase() == data.token.toLowerCase();})!;
                    const targetToken = tokenInfos.find(t => {return t.chainName == originToken.targetChainName && t.chainId == originToken.targetChainId && t.targetTokenAddr.toLowerCase() == originToken.tokenAddr.toLowerCase()})!;
                    if(Number(data.type == 1)){
                        history.sender = String(data.from);
                        history.swapTx = String(data.txid);
                        history.receiver = String(data.recipient);
                        history.swapAmount = BigInt(data.amount);
                        history.reward = BigInt(data.reward);
                        history.rewardFee = BigInt(data.amount) - BigInt(data.amountout);
                        history.claimAmount = BigInt(data.amountout);
                        history.swapCount = BigInt(data.swapcount);
                        history.status = 1;

                        history.from = {
                            chainName:originToken.chainName,
                            chainId:originToken.chainId,
                            name:originToken.name,
                            symbol:originToken.symbol,
                            decimals:originToken.decimals,
                            contract:originToken.tokenAddr,
                            nativeCoin:originToken.nativeCoin,
                            tokenType:originToken.tokenType
                        }
                        history.to = {
                            chainName:targetToken.chainName,
                            chainId:targetToken.chainId,
                            name:targetToken.name,
                            symbol:targetToken.symbol,
                            decimals:targetToken.decimals,
                            contract:targetToken.tokenAddr,
                            nativeCoin:targetToken.nativeCoin,
                            tokenType:targetToken.tokenType
                        }

                        const getSnResult = await this.getSnapshootByBlockNum(data.chainname,data.chainid,data.blocknum,snapshootCache);
                        if(getSnResult.error){
                            result.error = getSnResult.error;
                            return result;
                        }
                        if(getSnResult.data != null){
                            history.merkleRoot = getSnResult.data.merkleRoot;
                        }

                        if(Number(data.isclaim) == 1){
                            const sql1 = `
                            select *
                            from bridgeTx
                            where bridgeTx.type = 2 and bridgeTx.chainname = $0 and bridgeTx.chainid = $1 and lower(bridgeTx.swaptxhash) = lower($3)
                            `;
                            const parameters1:any[] = [targetToken.chainName,targetToken.chainId,data.swaptxhash];
                            const datas1 = await getManager().query(sql1,parameters1);
                            if(datas1 != undefined && datas1.length > 0){
                                history.claimTx = String(datas1[0].txid);
                                history.status = 2;
                            }
                        }
                    } else {
                        history.from = {
                            chainName:targetToken.chainName,
                            chainId:targetToken.chainId,
                            name:targetToken.name,
                            symbol:targetToken.symbol,
                            decimals:targetToken.decimals,
                            contract:targetToken.tokenAddr,
                            nativeCoin:targetToken.nativeCoin,
                            tokenType:targetToken.tokenType
                        }
                        history.to = {
                            chainName:originToken.chainName,
                            chainId:originToken.chainId,
                            name:originToken.name,
                            symbol:originToken.symbol,
                            decimals:originToken.decimals,
                            contract:originToken.tokenAddr,
                            nativeCoin:originToken.nativeCoin,
                            tokenType:originToken.tokenType
                        }

                        history.claimTx = String(data.txid);
                        history.receiver = String(data.recipient);
                        history.reward = BigInt(data.reward);

                        const sql1 = `
                        select *
                        from bridgeTx
                        where bridgeTx.type = 1 and bridgeTx.chainname = $0 and bridgeTx.chainid = $1 and lower(bridgeTx.swaptxhash) = lower($3)
                        `;
                        const parameters1:any[] = [targetToken.chainName,targetToken.chainId,data.swaptxhash];
                        const datas1 = await getManager().query(sql1,parameters1);
                        if(datas1 != undefined && datas1.length > 0){
                            history.swapTx = String(datas1[0].txid);
                            history.sender = String(datas1[0].from);
                            history.swapAmount = BigInt(datas1[0].amount);
                            history.rewardFee = BigInt(datas1[0].amount) - BigInt(datas1[0].amountout);
                            history.claimAmount = BigInt(datas1[0].amountout);
                            history.swapCount = BigInt(datas1[0].swapcount);
                            history.status = 2;

                            const getSnResult = await this.getSnapshootByBlockNum(datas1[0].chainname,datas1[0].chainid,datas1[0].blocknum,snapshootCache);
                            if(getSnResult.error){
                                result.error = getSnResult.error;
                                return result;
                            }
                            if(getSnResult.data != null){
                                history.merkleRoot = getSnResult.data.merkleRoot;
                            }
                        }
                    }
                    result.data.push(history);
                }
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getTokenList():Promise<ActionData<Array<TokenInfo>>>{
        return await this.tokenInfoModel.getTokenInfos();
    }

    public async getSnapshootByBlockNum(chainname:string,chainid:string,blockNum:number,cache?:BridgeSnapshoot[]):Promise<ActionData<BridgeSnapshoot|undefined>> {
        let result = new ActionData<BridgeSnapshoot|undefined>();
        if(cache != undefined){
            const csn = cache.find(sn => {
                const chainInfo = sn.chains.find(i => {return i.chainName == chainname && i.chainId == chainid;})!;
                return chainInfo.beginBlockNum >= blockNum && chainInfo.endBlockNum <= blockNum;
            });
            if(csn != undefined){
                result.data = csn;
                return result;
            }
        }

        if(chainname == this.config.vechain.chainName && chainid == this.config.vechain.chainId){
            const data = await getRepository(SnapshootEntity)
                .createQueryBuilder()
                .where('begin_blocknum_0 <= :num',{num:blockNum})
                .andWhere('end_blocknum_0 >= :num',{num:blockNum})
                .getOne();
            if(data != undefined){
                let sn:BridgeSnapshoot = {
                    merkleRoot:data.merkleRoot,
                    chains:[
                        {chainName:data.chainName_0,chainId:data.chainId_0,beginBlockNum:data.beginBlockNum_0,endBlockNum:data.endBlockNum_0},
                        {chainName:data.chainName_1,chainId:data.chainId_1,beginBlockNum:data.beginBlockNum_1,endBlockNum:data.endBlockNum_1}
                    ]
                }
                if(cache != undefined){
                    cache.push(sn);
                }
                result.data = sn;
            }
        } else {
            const data = await getRepository(SnapshootEntity)
                .createQueryBuilder()
                .where('begin_blocknum_1 <= :num',{num:blockNum})
                .andWhere('end_blocknum_1 >= :num',{num:blockNum})
                .getOne();
            if(data != undefined){
                let sn:BridgeSnapshoot = {
                    merkleRoot:data.merkleRoot,
                    chains:[
                        {chainName:data.chainName_0,chainId:data.chainId_0,beginBlockNum:data.beginBlockNum_0,endBlockNum:data.endBlockNum_0},
                        {chainName:data.chainName_1,chainId:data.chainId_1,beginBlockNum:data.beginBlockNum_1,endBlockNum:data.endBlockNum_1}
                    ]
                }
                if(cache != undefined){
                    cache.push(sn);
                }
                result.data = sn;
            }
        }
        return result;
    }

    private env:any;
    private config:any;
    private snapsshootModel:SnapshootModel;
    private tokenInfoModel:TokenInfoModel;
}