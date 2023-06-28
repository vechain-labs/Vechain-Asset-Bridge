import { DataSource } from "typeorm";
import { ActionData, ActionResult } from "../../common/utils/components/actionResult";
import { FaucetEntity } from "./faucet.entity";

export default class faucetModel {
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.dataSource = env.dataSource;
    }

    public async getfaucetHistory(chainName:string,chainId:string,tokenAddr:string,beginTs:number,endTs:number,receiver:string):Promise<ActionData<faucetMeta[]>> {
        let result = new ActionData<faucetMeta[]>();
        result.data = new Array<faucetMeta>();
        
        const query = this.dataSource.getRepository(FaucetEntity)
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
                const faucet:faucetMeta = {
                    chainName:entity.chainName,
                    chainId:entity.chainId,
                    tokenAddr:entity.tokenAddr,
                    receiver:entity.receiver,
                    amount:BigInt(entity.amount),
                    timestamp:entity.timestamp
                }
                result.data.push(faucet);
            }
        } catch (error) {
            result.error = new Error(`getfaucetHistory faild: ${JSON.stringify(error)}`);
        }

        return result;
    }

    public async savefaucet(chainName:string,chainId:string,tokenAddr:string,receiver:string,amount:bigint,txid:string):Promise<ActionResult> {
        let result = new ActionResult();

        try {
            const entity:FaucetEntity = {
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
                .into(FaucetEntity)
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

export type faucetMeta = {
    chainName:string,
    chainId:string,
    tokenAddr:string,
    receiver:string,
    amount:bigint,
    timestamp:number
}