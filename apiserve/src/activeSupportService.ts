import { environment } from ".";
import { DataSource } from "typeorm";
import path from "path";
import IActiveSupportServices from "./utils/iActiveSupportService";
import Web3 from "web3";
import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import { ActionResult } from "./common/utils/components/actionResult";
import { TokenInfo } from "./common/utils/types/tokenInfo";

export default class ActiveSupportServices implements IActiveSupportServices{
    public async activieSupportServices():Promise<ActionResult> {
        let result = new ActionResult();
        try {
            const dbConfig = environment.config.dbConfig;
            const entitiesDir = path.join(__dirname,"./common/model/entities/**.entity{.ts,.js}");
            let dataSource = new DataSource({
                type:dbConfig.type,
                database:dbConfig.database,
                enableWAL:Boolean(dbConfig.enableWAL ||  false),
                entities:[entitiesDir],
                synchronize:true
            });
            dataSource = await dataSource.initialize();
            environment.dataSource = dataSource;
        } catch (error) {
            let errorMsg = `DataBase [db:${JSON.stringify(environment.config.dbConfig)}] initialize faild`;
            console.error(errorMsg)
            result.error = errorMsg;
            return result;
        }
        this.initBridgeEnv();
        environment.tokenInfo = new Array<TokenInfo>();

        return result;
    }

    private async initBridgeEnv(){
        const web3 = new Web3(new Web3.providers.HttpProvider(environment.config.ethereum.nodeHost));
        const driver = await Driver.connect(new SimpleNet(environment.config.vechain.nodeHost as string));
        const connex = new Framework(driver);

        environment.connex = connex;
        environment.web3 = web3;
        environment.contractdir = path.join(__dirname,"../../../src/SmartContracts/contracts");
        environment.bridgePack = false;
    }
}