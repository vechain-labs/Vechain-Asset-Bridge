
import { createConnection } from "typeorm";
import { Driver, SimpleNet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import IActiveSupportServices from "./utils/iActiveSupportService";
import { ActionResult } from "./common/utils/components/actionResult";
import { TokenInfo } from "./common/utils/types/tokenInfo";
import path from "path";
import { environment } from ".";
import { BridgeSnapshoot } from "./common/utils/types/bridgeSnapshoot";
import { compileContract } from "myvetools/dist/utils";
import { Contract as VContract } from 'myvetools';
import { Contract as EContract } from 'web3-eth-contract';

export default class ActiveSupportServices implements IActiveSupportServices{
    public async activieSupportServices():Promise<ActionResult> {
        let result = new ActionResult();
        this.env = environment;
        this.config = environment.config;

        try {
            this.env.tokenInfo = new Array<TokenInfo>();
            await this.initDB();
            await this.initConnex();
            await this.initWeb3js();
            await this.initContracts();
            this.env.genesisSnapshoot = this.genesisSnapshoot();
        } catch (error) {
            result.error = error;
            return result;
        }
        return result;
    }

    private async initDB(){
        const dbConfig = this.config.dbConfig;
        const entitiesDir = path.join(__dirname,"./common/model/entities/**.entity{.ts,.js}");
        const connectionOptions:any = dbConfig;
        connectionOptions.entities = [entitiesDir];
        const connection = await createConnection(connectionOptions);
        if(connection.isConnected){
            await connection.synchronize();
        } else {
            throw new Error(`DataBase [db:${JSON.stringify(this.config.dbConfig)}] initialize faild`);
        }
    }

    private async initConnex(){
        const driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string));
        this.env.connex = new Framework(driver);
    }

    private async initWeb3js(){
        this.env.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));
    }

    private async initContracts(){
        this.env.contractdir = path.join(__dirname,"./common/contracts/");
        this.env.contracts = {vechain:{},ethereum:{}};
    
        const bridgeCorePath = path.join(this.env.contractdir,'/common/Contract_BridgeCore.sol');
        const bridgeCoreAbi = JSON.parse(compileContract(bridgeCorePath,'BridgeCore','abi'));

        this.env.contracts.vechain.bridgeCore = new VContract({abi:bridgeCoreAbi,connex:this.env.connex,address:this.config.vechain.contracts.bridgeCore});
        this.env.contracts.ethereum.bridgeCore = new this.env.web3.eth.Contract(bridgeCoreAbi,this.config.ethereum.contracts.bridgeCore);

        const ftBridgePath = path.join(this.env.contractdir,'/common/Contract_FTBridge.sol');
        const ftBridgeAbi = JSON.parse(compileContract(ftBridgePath,'FTBridge','abi'));

        this.env.contracts.vechain.ftBridge = new VContract({abi:ftBridgeAbi,connex:this.env.connex,address:this.config.vechain.contracts.ftBridge});
        this.env.contracts.ethereum.ftBridge = new this.env.web3.eth.Contract(ftBridgeAbi,this.config.ethereum.contracts.ftBridge);
        
        const vechainBridgeTokensAddr = (await (this.env.contracts.vechain.ftBridge as VContract).call('bridgeTokens')).decoded[0] as string;
        const ethereumBridgeTokensAddr = await (this.env.contracts.ethereum.ftBridge as EContract).methods.bridgeTokens().call();

        const ftBridgeTokensPath = path.join(this.env.contractdir,'/common/Contract_FTBridgeTokens.sol');
        const ftBridgeTokensAbi = JSON.parse(compileContract(ftBridgeTokensPath,'FTBridgeTokens','abi'));

        this.env.contracts.vechain.ftBridgeTokens = new VContract({abi:ftBridgeTokensAbi,connex:this.env.connex,address:vechainBridgeTokensAddr});
        this.env.contracts.ethereum.ftBridgeTokens = new this.env.web3.eth.Contract(ftBridgeTokensAbi,ethereumBridgeTokensAddr);

        
    }

    private genesisSnapshoot():BridgeSnapshoot {
        return {
          merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000001",
          chains:[{
            chainName:this.config.vechain.chainName,
            chainId:this.config.vechain.chainId,
            beginBlockNum:this.config.vechain.startBlockNum,
            endBlockNum:this.config.vechain.startBlockNum
          },{
            chainName:this.config.ethereum.chainName,
            chainId:this.config.ethereum.chainId,
            beginBlockNum:this.config.ethereum.startBlockNum,
            endBlockNum:this.config.ethereum.startBlockNum
          }]
        }
    }

    private env:any;
    private config:any;
}