import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import path from "path";
import fs from 'fs';
import assert from 'assert';
import Web3 from "web3";
import { Framework } from "@vechain/connex-framework";
import * as Devkit from 'thor-devkit';
import { BridgeSyncTask } from "../../src/ValidationNode/bridgeSyncTask";
import { tokenid, TokenInfo } from "../../src/common/utils/types/tokenInfo";
import { createConnection } from "typeorm";

export class BridgeSyncTaskTestCase{
    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};
    public wallet = new SimpleWallet();
    public web3!:Web3;
    public connex!: Framework;
    public task!:BridgeSyncTask;
    public env:any;

    // private privateKeys = [
    //     "0x99f0500549792796c14fed62011a51081dc5b5e68fe8bd8a13b86be829c4fd36",
    //     "0x7b067f53d350f1cf20ec13df416b7b73e88a1dc7331bc904b92108b1e76a08b1",
    //     "0xf4a1a17039216f535d42ec23732c79943ffb45a089fbb78a14daad0dae93e991",
    //     "0x35b5cc144faca7d7f220fca7ad3420090861d5231d80eb23e1013426847371c4",
    //     "0x10c851d8d6c6ed9e6f625742063f292f4cf57c2dbeea8099fa3aca53ef90aef1",
    //     "0x2dd2c5b5d65913214783a6bd5679d8c6ef29ca9f2e2eae98b4add061d0b85ea0",
    //     "0xe1b72a1761ae189c10ec3783dd124b902ffd8c6b93cd9ff443d5490ce70047ff",
    //     "0x35cbc5ac0c3a2de0eb4f230ced958fd6a6c19ed36b5d2b1803a9f11978f96072",
    //     "0xb639c258292096306d2f60bc1a8da9bc434ad37f15cd44ee9a2526685f592220",
    //     "0x9d68178cdc934178cca0a0051f40ed46be153cf23cb1805b59cc612c0ad2bbe0"
    // ]

    public async init(){
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);
            let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
            for (let index = 0; index < 10; index++) {
                let account = masterNode.derive(index);
                this.wallet.import(account.privateKey!.toString('hex'));
            }
            try {
                this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));
                const driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string), this.wallet);
                this.connex = new Framework(driver);

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

                const dbConfig = {
                    type:"sqlite",
                    database:"/Users/moglu/Developer/dataCenter/sqlite/bridge_data/asset_bridge_test.sqlite3",
                    enableWAL:false
                }
                const entitiesDir = path.join(__dirname,"../../src/common/model/entities/**.entity{.ts,.js}");
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
                    tokenInfo:tokenInfo,
                    contractdir:path.join(__dirname,"../../src/SmartContracts/contracts")
                }

                this.task = new BridgeSyncTask(this.env);
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
    let testcase = new BridgeSyncTaskTestCase();

    before(async() =>{
        await testcase.init();
    });

    it('task job run', async()=>{
        await testcase.run();
    });
});