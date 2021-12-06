
import { createConnection } from "typeorm";
import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import IActiveSupportServices from "./utils/iActiveSupportService";
import { ActionResult } from "./common/utils/components/actionResult";
import { TokenInfo } from "./common/utils/types/tokenInfo";
import path from "path";
import { environment } from ".";

export default class ActiveSupportServices implements IActiveSupportServices{
    public async activieSupportServices():Promise<ActionResult> {
        let result = new ActionResult();

        try {
            environment.tokenInfo = new Array<TokenInfo>();
            await this.initDB();
            await this.initConnex();
            await this.initWeb3js();
            await this.initContracts();
        } catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }

    private async initDB(){
        const dbConfig = environment.config.dbConfig;
        const entitiesDir = path.join(__dirname,"./common/model/entities/**.entity{.ts,.js}");
        const connectionOptions:any = dbConfig;
        connectionOptions.entities = [entitiesDir];
        const connection = await createConnection(connectionOptions);
        if(connection.isConnected){
            await connection.synchronize();
        } else {
            throw new Error(`DataBase [db:${JSON.stringify(environment.config.dbConfig)}] initialize faild`);
        }
    }

    private async initConnex(){
        const driver = await Driver.connect(new SimpleNet(environment.config.vechain.nodeHost as string));
        environment.connex = new Framework(driver);
    }

    private async initWeb3js(){
        environment.web3 = new Web3(new Web3.providers.HttpProvider(environment.config.ethereum.nodeHost));
    }

    private async initContracts(){
        environment.contractdir = path.join(__dirname,"./common/contracts/");
    }
}