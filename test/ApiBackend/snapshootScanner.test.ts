import { Framework } from "@vechain/connex-framework";
import path from "path";
import fs from 'fs';
import assert from 'assert';
import { Driver, SimpleNet } from "@vechain/connex-driver";
import { tokenid, TokenInfo } from "../../src/common/utils/types/tokenInfo";
import { createConnection } from "typeorm";
import { SnapshootScanner } from "../../src/ApiBackend/snapshootScanner";

export class VeChainSnapshootScanTestCase {
    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};
    public connex!: Framework;
    public env:any;

    public async init(){
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);

            try {
                const driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string));
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
                    database:"/Users/moglu/Developer/dataCenter/sqlite/bridge_data/asset_bridge_api_test.sqlite3",
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
                    tokenInfo:tokens,
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
    let testcase = new VeChainSnapshootScanTestCase();

    before(async() =>{
        await testcase.init();
    });

    it('task job run', async()=>{
        await testcase.run();
    });
});