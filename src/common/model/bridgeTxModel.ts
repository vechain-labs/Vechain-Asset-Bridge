import { Between, Equal, getManager, getRepository } from "typeorm";
import { ActionData, ActionResult } from "../utils/components/actionResult";
import { BridgeSnapshoot } from "../utils/types/bridgeSnapshoot";
import { BridgeTx } from "../utils/types/bridgeTx";
import { swapID, BridgeTxEntity } from "./entities/bridgeTx.entity";

export default class BridgeTxModel{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
    }

    public async saveBridgeTxs(txs:BridgeTx[]):Promise<ActionResult>{
        let result = new ActionResult();

        try {
            await getManager().transaction(async transactionalEntityManager => {
                for(const swapTx of txs){
                    let entity = new BridgeTxEntity();
                    entity.swapid = swapID(swapTx.chainName,swapTx.chainId,swapTx.blockNumber,swapTx.txid,swapTx.clauseIndex,swapTx.index,swapTx.account,swapTx.token);
                    entity.chainName = swapTx.chainName,
                    entity.chainId = swapTx.chainId,
                    entity.blockNumber = swapTx.blockNumber,
                    entity.blockId = swapTx.blockId,
                    entity.txid = swapTx.txid,
                    entity.clauseIndex = swapTx.clauseIndex,
                    entity.index = swapTx.index,
                    entity.account = swapTx.account,
                    entity.token = swapTx.token,
                    entity.amount = '0x' + swapTx.amount.toString(16),
                    entity.reward = '0x' + swapTx.amount.toString(16),
                    entity.timestamp = swapTx.timestamp,
                    entity.type = swapTx.type == "swap" ? 1 : 2;
                    entity.valid = true;
                    await transactionalEntityManager.save(entity);
                }
            })
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async getLastBridgeTx(chainName:string,chainId:string):Promise<ActionData<BridgeTx>>{
        let result = new ActionData<BridgeTx>();

        try {
            let data = await getRepository(BridgeTxEntity)
            .findOne({
                chainName:Equal(chainName),
                chainId:Equal(chainId),
                valid:Equal(true)
            },{
                order:{
                    timestamp:"DESC"
                }
            });
            if(data != undefined){
                let swap:BridgeTx = {
                    chainName:data.chainName,
                    chainId:data.chainId,
                    blockNumber:data.blockNumber,
                    blockId:data.blockId,
                    txid:data.txid,
                    clauseIndex:data.clauseIndex,
                    index:data.index,
                    account:data.account,
                    token:data.token,
                    amount:BigInt(data.amount),
                    reward:BigInt(data.reward),
                    timestamp:data.timestamp,
                    type:data.type == 1 ? "swap" : "claim"
                };
                result.data = swap;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getClaimTxs(chainName:string,chainId:string,account:string,token?:string,begin?:number,end?:number,limit:number = 50,offset:number = 0):Promise<ActionData<BridgeTx[]>>{
        let result = new ActionData<BridgeTx[]>();
        result.data = new Array();

        try {
            let query = getRepository(BridgeTxEntity)
            .createQueryBuilder()
            .where("chainname = :name",{name:chainName})
            .andWhere("chainid = :id",{id:chainId})
            .andWhere("account = :account",{account:account.toLowerCase()})
            .andWhere("type = 2")
            .andWhere("valid = true")
            .orderBy("timestamp","DESC")
            .offset(offset)
            .limit(limit);

            if(begin != undefined){
                query.andWhere("blocknumber >= :begin", {begin:begin})
            }

            if(end != undefined){
                query.andWhere("blocknumber <= :end", {end:end})
            }

            if(token != undefined){
                query.andWhere("token = :token",{token:token.toLowerCase()})
            }

            const data = await query.getMany();
        
            for(const item of data){
                let swaptx:BridgeTx = {
                    chainName:item.chainName,
                    chainId:item.chainId,
                    blockNumber:item.blockNumber,
                    blockId:item.blockId,
                    txid:item.txid,
                    clauseIndex:item.clauseIndex,
                    index:item.index,
                    account:item.account,
                    token:item.token,
                    amount:BigInt(item.amount),
                    reward:BigInt(item.reward),
                    timestamp:item.timestamp,
                    type:item.type == 1 ? "swap" : "claim"
                    };
                result.data.push(swaptx);
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getSwapTxs(chainName:string,chainId:string,account:string,token?:string,begin?:number,end?:number,limit?:number,offset:number = 0):Promise<ActionData<BridgeTx[]>>{
        let result = new ActionData<BridgeTx[]>();
        result.data = new Array();

        try {
            let query = getRepository(BridgeTxEntity)
            .createQueryBuilder()
            .where("chainname = :name",{name:chainName})
            .andWhere("chainid = :id",{id:chainId})
            .andWhere("account = :account",{account:account.toLowerCase()})
            .andWhere("type = 1")
            .andWhere("valid = true")
            .orderBy("timestamp","DESC")
            .offset(offset)
            .limit(limit);

            if(begin != undefined){
                query.andWhere("blocknumber >= :begin", {begin:begin})
            }

            if(end != undefined){
                query.andWhere("blocknumber <= :end", {end:end})
            }

            if(token != undefined){
                query.andWhere("token = :token",{token:token.toLowerCase()})
            }

            const data = await query.getMany();

            for(const item of data){
                let swaptx:BridgeTx = {
                    chainName:item.chainName,
                    chainId:item.chainId,
                    blockNumber:item.blockNumber,
                    blockId:item.blockId,
                    txid:item.txid,
                    clauseIndex:item.clauseIndex,
                    index:item.index,
                    account:item.account,
                    token:item.token,
                    amount:BigInt(item.amount),
                    reward:BigInt(item.reward),
                    timestamp:item.timestamp,
                    type:item.type == 1 ? "swap" : "claim"
                    };
                result.data.push(swaptx);
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getSwapTxsBySnapshoot(sn:BridgeSnapshoot,limit?:number,offset:number = 0):Promise<ActionData<BridgeTx[]>>{
        let result = new ActionData<BridgeTx[]>();
        result.data = new Array();

        try {
            for(const chain of sn.chains){
                let query = getRepository(BridgeTxEntity)
                .createQueryBuilder()
                .where("chainname = :name",{name:chain.chainName})
                .andWhere("chainid = :id",{id:chain.chainId})
                .andWhere("blocknumber >= :begin",{begin:chain.beginBlockNum})
                .andWhere("blocknumber <= :end",{end:chain.endBlockNum - 1})
                .andWhere("valid = true")
                .limit(limit)
                .offset(offset)
                const data = await query.getMany();
                for(const item of data){
                    let swaptx:BridgeTx = {
                        chainName:item.chainName,
                        chainId:item.chainId,
                        blockNumber:item.blockNumber,
                        blockId:item.blockId,
                        txid:item.txid,
                        clauseIndex:item.clauseIndex,
                        index:item.index,
                        account:item.account,
                        token:item.token,
                        amount:BigInt(item.amount),
                        reward:BigInt(item.reward),
                        timestamp:item.timestamp,
                        type:item.type == 1 ? "swap" : "claim"
                        };
                    result.data.push(swaptx);
                }
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async removeByBlockIds(chainName:string,chainId:string,blockIds:string[]):Promise<ActionResult>{
        let result = new ActionResult();

        try {
            await getManager().transaction(async transactionalEntityManager => {
                for(const blockId of blockIds){
                    await transactionalEntityManager.update(
                        BridgeTxEntity,
                        {blockId:blockId,chainName:chainName,chainId:chainId},
                        {valid:false})
                }
            });
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private env:any;
    private config:any;
}