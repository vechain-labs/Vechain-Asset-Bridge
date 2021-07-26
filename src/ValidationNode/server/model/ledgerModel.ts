import { getManager, getRepository } from "typeorm";
import { ActionData, ActionResult } from "../../utils/components/actionResult";
import { BridgeLedger } from "../../utils/types/bridgeLedger";
import { LedgerEntity } from "./entities/ledger.entity";

export default class LedgerModel {

    constructor(env:any){
        this.env = env;
        this.config = env.config;
    }

    public async load(root:string):Promise<ActionData<BridgeLedger[]>>{
        let result = new ActionData<BridgeLedger[]>();
        result.data = new Array<BridgeLedger>();

        try {
            let data = await getRepository(LedgerEntity)
                .find({where:{merkleRoot:root.toLowerCase()}});
            for(const item of data){
                let ledger:BridgeLedger = {
                    root:item.merkleRoot,
                    ledgerid:item.ledgerid,
                    chainName:item.chainName,
                    chainId:item.chainId,
                    account:item.account,
                    token:item.token,
                    balance:BigInt(item.balance)
                };
                result.data.push(ledger);
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async save(root:string,ledgers:BridgeLedger[]):Promise<ActionResult>{
        let result = new ActionResult();
        const step = 100;

        try {
            await getManager().transaction(async transactionalEntityManager =>{
                for(const ledger of ledgers){
                    let entity = new LedgerEntity();
                    entity.ledgerid = ledger.ledgerid.toLowerCase();
                    entity.merkleRoot = root.toLowerCase();
                    entity.snapshootid = entity.merkleRoot + entity.ledgerid;
                    entity.chainName = ledger.chainName.toLocaleString();
                    entity.chainId = ledger.chainId.toLowerCase();
                    entity.account = ledger.account.toLowerCase();
                    entity.token = ledger.token.toLowerCase();
                    entity.balance = '0x' + ledger.balance.toString(16)
                    await transactionalEntityManager.save(entity);
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