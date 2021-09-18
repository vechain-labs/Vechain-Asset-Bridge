import { Between, Equal, getManager, getRepository } from "typeorm";
import { ActionData, ActionResult } from "../../../common/utils/components/actionResult";
import { SwapTx } from "../../../common/utils/types/swapTx";
import { swapID, SwapTxEntity } from "./entities/swapTx.entity";

export default class SwapTxModel{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
    }

    public async loadSwapTx(chainName:string,chainId:string,account:string,begin:number,end:number):Promise<ActionData<SwapTx[]>>{
        let result = new ActionData<SwapTx[]>();
        result.data = new Array();

        try {
            let data = await getRepository(SwapTxEntity)
                .find({
                    chainName:Equal(chainName),
                    chainId:Equal(chainId),
                    account:Equal(account.toLowerCase()),
                    blockNumber:Between(begin,end)
                });
                
            for(const item of data){
                let ledger:SwapTx = {
                    chainName:item.chainName,
                    chainId:item.chainId,
                    blockNumber:item.blockNumber,
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
                result.data.push(ledger);
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async saveSwapTx(txs:SwapTx[]):Promise<ActionResult>{
        let result = new ActionResult();

        try {
            await getManager().transaction(async transactionalEntityManager => {
                for(const swapTx of txs){
                    let entity = new SwapTxEntity();
                    entity.swapid = swapID(swapTx.chainName,swapTx.chainId,swapTx.blockNumber,swapTx.txid,swapTx.clauseIndex,swapTx.index,swapTx.account,swapTx.token);
                    entity.chainName = swapTx.chainName,
                    entity.chainId = swapTx.chainId,
                    entity.blockNumber = swapTx.blockNumber,
                    entity.txid = swapTx.txid,
                    entity.clauseIndex = swapTx.clauseIndex,
                    entity.index = swapTx.index,
                    entity.account = swapTx.account,
                    entity.token = swapTx.token,
                    entity.amount = '0x' + swapTx.amount.toString(16),
                    entity.reward = '0x' + swapTx.amount.toString(16),
                    entity.timestamp = swapTx.timestamp,
                    entity.type = swapTx.type == "swap" ? 1 : 2;
                    await transactionalEntityManager.save(entity);
                }
            })
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async getLastSwapTx(chainName:string,chainId:string):Promise<ActionData<SwapTx>>{
        let result = new ActionData<SwapTx>();

        try {
            let data = await getRepository(SwapTxEntity)
            .findOne({
                chainName:Equal(chainName),
                chainId:Equal(chainId)
            },{
                order:{
                    timestamp:"DESC"
                }
            });
            if(data != undefined){
                let swap:SwapTx = {
                    chainName:data.chainName,
                    chainId:data.chainId,
                    blockNumber:data.blockNumber,
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

    private env:any;
    private config:any;
}