import { Framework } from "@vechain/connex-framework";
import path from "path";
import fs from 'fs';
import assert from 'assert';
import { Driver, SimpleNet } from "@vechain/connex-driver";
import { tokenid, TokenInfo } from "../../src/common/utils/types/tokenInfo";
import { createConnection } from "typeorm";
import { SnapshootScanner } from "../../src/ApiBackend/snapshootScanner";
import Web3 from "web3";

export class SnapshootScanTestCase {
    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};
    public connex!: Framework;
    public web3!:Web3;
    public env:any;

    public async init(){
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);

            try {
                const driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string));
                this.connex = new Framework(driver);
                this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));

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
                        update:0,
                        updateBlock:""
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
                        update:0,
                        updateBlock:""
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
                        update:0,
                        updateBlock:""
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
                        update:0,
                        updateBlock:""
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
                    database:"/Users/moglu/Developer/dataCenter/sqlite/bridge_data/asset_bridge_api_test.sqlite3",
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
                

            } catch (error) {
                assert.fail(`init faild: ${JSON.stringify(error)}`);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async run(){
        //const result = await (new SnapshootScanner()).run(this.env);
        const result = await (new SnapshootScanner(this.env)).run();
        if(result.error){
            assert.fail(JSON.stringify(result.error));
        }
    }
}

describe("VeChainSnapshootScan task", ()=>{
    let testcase = new SnapshootScanTestCase();

    before(async() =>{
        await testcase.init();
    });

    it('task job run', async()=>{
        await testcase.run();
    });
});