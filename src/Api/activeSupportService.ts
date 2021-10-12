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
        this.initTokenList();
        this.initBridgeEnv();

        return result;
    }

    // TODO: load tokenlist from github
    private initTokenList(){
        environment.tokenInfo = new Array<TokenInfo>();
        environment.tokenInfo = [
            {
                tokenid:"",
                chainName:environment.config.vechain.chainName,
                chainId:environment.config.vechain.chainId,
                name:"VVET",
                symbol:"VVET",
                decimals:18,
                address:environment.config.vechain.contracts.vVet,
                nativeCoin:true,
                tokenType:"1",
                targetTokenId:""
            },
            {
                tokenid:"",
                chainName:environment.config.vechain.chainName,
                chainId:environment.config.vechain.chainId,
                name:"VETH",
                symbol:"VETH",
                decimals:18,
                address:environment.config.vechain.contracts.vEth,
                nativeCoin:false,
                tokenType:"2",
                targetTokenId:""
            },
            {
                tokenid:"",
                chainName:environment.config.ethereum.chainName,
                chainId:environment.config.ethereum.chainId,
                name:"WVET",
                symbol:"WVET",
                decimals:18,
                address:environment.config.ethereum.contracts.wVet,
                nativeCoin:false,
                tokenType:"2",
                targetTokenId:""
            },
            {
                tokenid:"",
                chainName:environment.config.ethereum.chainName,
                chainId:environment.config.ethereum.chainId,
                name:"WETH",
                symbol:"WETH",
                decimals:18,
                address:environment.config.ethereum.contracts.wEth,
                nativeCoin:true,
                tokenType:"1",
                targetTokenId:""
            }
        ]

        for(let token of environment.tokenInfo){
            token.tokenid = tokenid(token.chainName,token.chainId,token.address);
        }
        environment.tokenInfo[0].targetTokenId = environment.tokenInfo[2].tokenid;
        environment.tokenInfo[2].targetTokenId = environment.tokenInfo[0].tokenid;
        environment.tokenInfo[1].targetTokenId = environment.tokenInfo[3].tokenid;
        environment.tokenInfo[3].targetTokenId = environment.tokenInfo[1].tokenid;
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