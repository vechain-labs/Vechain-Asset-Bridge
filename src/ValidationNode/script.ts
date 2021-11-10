
import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import path from "path";
import Web3 from "web3";
import { BridgePackTask } from "../../src/ValidationNode/bridgePackTask";
import fs from 'fs';
import * as Devkit from 'thor-devkit';
import { tokenid, TokenInfo } from "../../src/common/utils/types/tokenInfo";
import { createConnection } from "typeorm";
import { BridgeSyncTask } from "./bridgeSyncTask";


class BridgeValidationScript{
    public configPath = path.join(__dirname, '../../config/config_node.json');
    public config: any = {};
    public web3!:Web3;
    public connex!: Framework;
    public task!:BridgePackTask;
    public env:any;
    private wallet!:SimpleWallet;

    public async init(){
        if(fs.existsSync(this.configPath)){
            this.config = require(this.configPath);
            const masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
            const account = masterNode.derive(5);
            try {
                this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));
                this.web3.eth.accounts.wallet.add(account.privateKey!.toString('hex'));
                this.wallet = new SimpleWallet();
                this.wallet.import(account.privateKey!.toString('hex'));
                const driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string), this.wallet);
                this.connex = new Framework(driver);

                const tokenInfo = this.initToken();
                await this.initDataBase();

                this.env = {
                    config:this.config,
                    connex:this.connex,
                    web3:this.web3,
                    tokenInfo:tokenInfo,
                    contractdir:path.join(__dirname,"../../src/SmartContracts/contracts"),
                    wallet:this.wallet
                }
            } catch (error) {
                console.error(`init faild: ${error}`);
            }
        } else {
            console.error(`can't load ${this.configPath}`);
        }
    }

    public async run(){
        const syncTask = new BridgeSyncTask(this.env);
        const syncResult = await syncTask.taskJob();
        if(syncResult.error){
            console.error(`Sync Bridge Data Faild, ${syncResult.error}`);
            process.exit();
        }
        console.info(`Sync Bridge Data Finish`);

        const packTask = new BridgePackTask(this.env);
        const packResult = await packTask.taskJob();
        if(packResult.error){
            console.error(`Pack Bridge Data Faild, ${syncResult.error}`);
            process.exit();
        }
        console.info(`Pack Bridge Data Finish`);
        process.exit();
    }

    private initToken():Array<TokenInfo>{
        let tokenInfo:Array<TokenInfo> = [
            {
                tokenid:"",
                chainName:this.config.vechain.chainName,
                chainId:this.config.vechain.chainId,
                name:"VVET",
                symbol:"VVET",
                decimals:18,
                address:this.config.vechain.contracts.vVet,
                nativeCoin:false,
                tokenType:"1",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            },
            {
                tokenid:"",
                chainName:this.config.vechain.chainName,
                chainId:this.config.vechain.chainId,
                name:"VETH",
                symbol:"VETH",
                decimals:18,
                address:this.config.vechain.contracts.vEth,
                nativeCoin:false,
                tokenType:"2",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            },
            {
                tokenid:"",
                chainName:this.config.ethereum.chainName,
                chainId:this.config.ethereum.chainId,
                name:"WVET",
                symbol:"WVET",
                decimals:18,
                address:this.config.ethereum.contracts.wVet,
                nativeCoin:false,
                tokenType:"2",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            },
            {
                tokenid:"",
                chainName:this.config.ethereum.chainName,
                chainId:this.config.ethereum.chainId,
                name:"WVET",
                symbol:"WETH",
                decimals:18,
                address:this.config.ethereum.contracts.wEth,
                nativeCoin:false,
                tokenType:"1",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            }
        ]

        for(let token of tokenInfo){
            token.tokenid = tokenid(token.chainName,token.chainId,token.address);
        }
        tokenInfo[0].targetTokenId = tokenInfo[2].tokenid;
        tokenInfo[2].targetTokenId = tokenInfo[0].tokenid;
        tokenInfo[1].targetTokenId = tokenInfo[3].tokenid;
        tokenInfo[3].targetTokenId = tokenInfo[1].tokenid;

        return tokenInfo;
    }

    private async initDataBase(){
        const dbConfig = {
            type:this.config.dbConfig.type,
            database:this.config.dbConfig.database,
            enableWAL:this.config.dbConfig.enableWAL
        }
        const entitiesDir = path.join(__dirname,"../../src/common/model/entities/**.entity{.ts,.js}");
        const connectionOptions:any = dbConfig;
        connectionOptions.entities = [entitiesDir];
        const connection = await createConnection(connectionOptions);

        if(connection.isConnected){
            await connection.synchronize();
        }
    }
}

export async function main() {
    const script = new BridgeValidationScript();
    await script.init();
    await script.run();
}

main();