import { DataSource } from "typeorm";
import { ActionData, ActionResult } from "../../common/utils/components/actionResult";
import { FauectEntity } from "./fauect.entity";

export default class FauectModel {
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.dataSource = env.dataSource;
    }

    public async getFauectHistory(chainName:string,chainId:string,tokenAddr:string,beginTs:number,endTs:number,receiver:string):Promise<ActionData<FauectMeta[]>> {
        let result = new ActionData<FauectMeta[]>();
        result.data = new Array<FauectMeta>();
        
        const query = this.dataSource.getRepository(FauectEntity)
            .createQueryBuilder()
            .where("chainname = :chainname",{chainname:chainName})
            .andWhere("chainid = :chainid",{chainid:chainId})
            .andWhere("tokenAddr = :token",{token:tokenAddr})
            .andWhere("timestamp >= :begin",{begin:beginTs})
            .andWhere("timestamp <= :end",{end:endTs})
            .andWhere("receiver = :rec",{rec:receiver});

        try {
            const data = await query.getMany();
            for(const entity of data){
                const fauect:FauectMeta = {
                    chainName:entity.chainName,
                    chainId:entity.chainId,
                    tokenAddr:entity.tokenAddr,
                    receiver:entity.receiver,
                    amount:BigInt(entity.amount),
                    timestamp:entity.timestamp
                }
                result.data.push(fauect);
            }
        } catch (error) {
            result.error = new Error(`getFauectHistory faild: ${JSON.stringify(error)}`);
        }

        return result;
    }

    public async saveFauect(chainName:string,chainId:string,tokenAddr:string,receiver:string,amount:bigint,txid:string):Promise<ActionResult> {
        let result = new ActionResult();

        try {
            const entity:FauectEntity = {
                indexid:"",
                chainName:chainName,
                chainId:chainId,
                tokenAddr:tokenAddr,
                receiver:receiver,
                amount:receiver,
                timestamp:(new Date()).getTime()
            }
            await this.dataSource.createQueryBuilder()
                .insert()
                .into(FauectEntity)
                .values(entity)
                .execute();
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private env:any;
    private config:any;
    private dataSource:DataSource;
}

export type FauectMeta = {
    chainName:string,
    chainId:string,
    tokenAddr:string,
    receiver:string,
    amount:bigint,
    timestamp:number
}