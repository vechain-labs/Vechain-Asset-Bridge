import { environment } from ".";
import { createConnection } from "typeorm";
import path from "path";
import IActiveSupportServices from "./utils/iActiveSupportService";
import { ActionResult } from "../common/utils/components/actionResult";
import { tokenid, TokenInfo } from "../common/utils/types/tokenInfo";
import * as Devkit from 'thor-devkit';
import Web3 from "web3";
import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";

export default class ActiveSupportServices implements IActiveSupportServices{
    public async activieSupportServices():Promise<ActionResult> {
        let result = new ActionResult();
        try {
            const dbConfig = environment.config.dbConfig;
            const entitiesDir = environment.entityPath;
            const connectionOptions:any = dbConfig;
            connectionOptions.entities = [entitiesDir];
            const connection = await createConnection(connectionOptions);
            if(connection.isConnected){
                await connection.synchronize();
            } else {
                let errorMsg = `DataBase [db:${JSON.stringify(environment.config.dbConfig)}] initialize faild`;
                console.error(errorMsg)
                result.error = errorMsg;
                return result;
            }
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
        const masterNode = Devkit.HDNode.fromMnemonic((environment.config.mnemonic as string).split(' '));
        const account = masterNode.derive(5);
        const web3 = new Web3(new Web3.providers.HttpProvider(environment.config.ethereum.nodeHost));
        web3.eth.accounts.wallet.add(account.privateKey!.toString('hex'));
        const wallet = new SimpleWallet();
        wallet.import(account.privateKey!.toString('hex'));
        const driver = await Driver.connect(new SimpleNet(environment.config.vechain.nodeHost as string), wallet);
        const connex = new Framework(driver);

        environment.connex = connex;
        environment.web3 = web3;
        environment.contractdir = path.join(__dirname,"../../../src/SmartContracts/contracts");
        environment.wallet = wallet;
        environment.bridgePack = false;
    }
}