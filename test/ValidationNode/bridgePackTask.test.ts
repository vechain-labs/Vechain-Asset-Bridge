import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import path from "path";
import Web3 from "web3";
import { BridgePackTask } from "../../src/ValidationNode/bridgePackTask";
import fs from 'fs';
import * as Devkit from 'thor-devkit';
import { tokenid, TokenInfo } from "../../src/common/utils/types/tokenInfo";
import { createConnection } from "typeorm";
import assert from 'assert';

export class BridgePackTaskTestCase{
    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};
    public wallet = new SimpleWallet();
    public web3!:Web3;
    public connex!: Framework;
    public task!:BridgePackTask;
    public env:any;

    public async init(){
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);
            this.wallet.import("0x2dd2c5b5d65913214783a6bd5679d8c6ef29ca9f2e2eae98b4add061d0b85ea0".substring(2));
            try {
                this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));
                const driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string), this.wallet);
                this.connex = new Framework(driver);

                let tokens:Array<TokenInfo> = [
                    {
                        tokenid:"",
                        chainName:this.config.vechain.chainName,
                        chainId:this.config.vechain.chainId,
                        tokenSymbol:"VVET",
                        tokenAddr:this.config.vechain.contracts.vVet,
                        tokeType:"1",
                        targetToken:""
                    },
                    {
                        tokenid:"",
                        chainName:this.config.vechain.chainName,
                        chainId:this.config.vechain.chainId,
                        tokenSymbol:"VETH",
                        tokenAddr:this.config.vechain.contracts.vEth,
                        tokeType:"2",
                        targetToken:""
                    },
                    {
                        tokenid:"",
                        chainName:this.config.ethereum.chainName,
                        chainId:this.config.ethereum.chainId,
                        tokenSymbol:"WVET",
                        tokenAddr:this.config.ethereum.contracts.wVet,
                        tokeType:"2",
                        targetToken:""
                    },
                    {
                        tokenid:"",
                        chainName:this.config.ethereum.chainName,
                        chainId:this.config.ethereum.chainId,
                        tokenSymbol:"WETH",
                        tokenAddr:this.config.ethereum.contracts.wEth,
                        tokeType:"1",
                        targetToken:""
                    }
                ]

                for(let token of tokens){
                    token.tokenid = tokenid(token.chainName,token.chainId,token.tokenAddr);
                }
                tokens[0].targetToken = tokens[2].tokenid;
                tokens[2].targetToken = tokens[0].tokenid;
                tokens[1].targetToken = tokens[3].tokenid;
                tokens[3].targetToken = tokens[1].tokenid;

                const dbConfig = {
                    type:"sqlite",
                    database:"/Users/moglu/Developer/dataCenter/sqlite/bridge_data/asset_bridge_test.sqlite3",
                    enableWAL:false
                }
                const entitiesDir = path.join(__dirname,"../../src/ValidationNode/server/model/entities/**.entity{.ts,.js}");
                const connectionOptions:any = dbConfig;
                connectionOptions.entities = [entitiesDir];
                const connection = await createConnection(connectionOptions);

                if(connection.isConnected){
                    await connection.synchronize();
                }

                this.env = {
                    config:this.config,
                    connex:this.connex,
                    web3:this.web3,
                    tokenInfo:tokens,
                    contractdir:path.join(__dirname,"../../src/SmartContracts/contracts"),
                    wallet:this.wallet
                }

                this.task = new BridgePackTask(this.env);
            } catch (error) {
                assert.fail(`init faild: ${JSON.stringify(error)}`);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async run(){
        const result = await this.task.taskJob();
        if(result.error){
            assert.fail(JSON.stringify(result.error));
        }
    }
}

describe("Bridge Sync task", ()=>{
    let testcase = new BridgePackTaskTestCase();

    before(async() =>{
        await testcase.init();
    });

    it('task job run', async()=>{
        await testcase.run();
    });
});