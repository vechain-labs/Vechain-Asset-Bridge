
import { createConnection } from "typeorm";
import { ActionResult } from "../common/utils/components/actionResult";
import { tokenid, TokenInfo } from "../common/utils/types/tokenInfo";
import IActiveSupportServices from "../Api/utils/iActiveSupportService";
import { environment } from ".";
import { Driver, SimpleNet,SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import * as Devkit from 'thor-devkit';
import { Verifier } from "../common/utils/types/verifier";

export default class ActiveSupportServices implements IActiveSupportServices{
    public async activieSupportServices():Promise<ActionResult> {
        let result = new ActionResult();

        try {
            //this.initTokenList();
            environment.tokenInfo = new Array<TokenInfo>();
            environment.verifiers = new Array<Verifier>();
            await this.initDB();
            await this.initConnex();
            await this.initWeb3js();
        } catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }

    private async initDB(){
        const dbConfig = environment.config.dbConfig;
        const entitiesDir = environment.entityPath;
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
        const masterNode = Devkit.HDNode.fromMnemonic((environment.config.mnemonic as string).split(' '));
        const account = masterNode.derive(5);
        const wallet = new SimpleWallet();
        wallet.import(account.privateKey!.toString('hex'));
        const driver = await Driver.connect(new SimpleNet(environment.config.vechain.nodeHost as string),wallet);
        environment.connex = new Framework(driver);
        environment.wallet = wallet;
    }

    private async initWeb3js(){
        environment.web3 = new Web3(new Web3.providers.HttpProvider(environment.config.ethereum.nodeHost));
        const masterNode = Devkit.HDNode.fromMnemonic((environment.config.mnemonic as string).split(' '));
        const account = masterNode.derive(5);
        const privateKey = account.privateKey!.toString('hex');
        (environment.web3 as Web3).eth.accounts.wallet.add(privateKey);
    }
}