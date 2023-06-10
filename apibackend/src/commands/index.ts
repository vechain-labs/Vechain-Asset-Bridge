import * as Yargs from 'yargs';
import * as fileIO from 'fs';
import { TokenInfo } from '../common/utils/types/tokenInfo';
import path from 'path';
import { Driver, SimpleNet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import Web3 from 'web3';
import { DataSource } from 'typeorm';
import schedule from "node-schedule";
import { VeChainBridgeTxScanner } from "../vechainBridgeTxScanner";
import { EthereumBridgeTxScanner } from "../ethereumBridgeTxScanner";
import { FTSnapshootScanner } from "../ftSnapshootScanner";
import { compileContract } from "myvetools/dist/utils";
import { Contract as VContract } from 'myvetools';
import { Contract as EContract } from 'web3-eth-contract';

class BridgeApiBackend{
    constructor(env:any){
        let taskIsBusy = false;

        const scanVeChainScanner = new VeChainBridgeTxScanner(env);
        const scanEthereumScanner = new EthereumBridgeTxScanner(env);
        const snapshootScanner = new FTSnapshootScanner(env);

        const rule = new schedule.RecurrenceRule();
        rule.second = [0,10,20,30,40,50];

        const taskJob = schedule.scheduleJob(rule, async() =>{
            if(taskIsBusy == false){
                taskIsBusy = true;
                const scanvechainResult = await scanVeChainScanner.run();
                if(scanvechainResult.error){
                    console.error(`ScanVeChain Error: ${scanvechainResult.error}`);
                    taskIsBusy = false;
                    return;
                }

                const scanethereumResult = await scanEthereumScanner.run();
                if(scanethereumResult.error){
                    console.error(`ScanEthereum Error: ${scanethereumResult.error}`);
                    taskIsBusy = false;
                    return;
                }

                const snapshootResult = await snapshootScanner.run();
                if(snapshootResult.error){
                    console.error(`Snapshoot Error: ${snapshootResult.error}`);
                    taskIsBusy = false;
                    return;
                }
                taskIsBusy = false;
            }
        });
        taskJob.invoke();
    }
}

const argv = Yargs.scriptName('apibackend')
.usage('<cmd> [args]')
.command('node [args]', '',(yargs) => {
  yargs.positional('config',{
    alias:'c',
    type:'string',
    default:''
  });
  yargs.positional('datadir',{
    alias:'d',
    type:'string',
    default:''
  });
}).help().argv;

let environment:any = {};

async function run(argv:any) {
    initEnv(argv);
    await initBlockChain(argv);
    await initDatabase(argv);

    console.info(`
    ******************** VeChain Asset Bridge API Backend ********************
    | VeChain Info    | ${environment.config.vechain.chainName} ${environment.config.vechain.chainId} ${environment.config.vechain.nodeHost}
    | Ethereum Info   | ${environment.config.ethereum.chainName}  ${environment.config.ethereum.chainId}  ${environment.config.ethereum.nodeHost}
    | VeChain Bridge Core     | ${environment.config.vechain.contracts.bridgeCore}
    | Ethereunm Bridge Core   | ${environment.config.ethereum.contracts.bridgeCore}
    | Database                | ${environment.database}
    *******************************************************************
  `);

  new BridgeApiBackend(environment);
}

function initEnv(argv:any) {
    var configPath = (argv.config || "" as string).trim();
    if(fileIO.existsSync(configPath)){
        try{
            const config = require(configPath);
            config.serveName = "VeChain Asset Bridge Api Backend";
            environment.config = config;
            environment.tokenInfo = new Array<TokenInfo>();
        }catch(error){
            console.error(`Read config faild,error:${error}`);
            process.exit();
        }
    } else {
        console.error(`Can't load configfile ${configPath}`);
        process.exit();
    }

    var dataPath = (argv.datadir || "" as string).trim();
    if(dataPath != undefined || dataPath != ""){
        try{
            fileIO.mkdirSync(dataPath,{recursive:true});
            environment.datadir = dataPath;
        }catch(error){
            console.error(`Init database faild, error: ${error}`);
            process.exit();
        }
    } else {
        console.error(`Not set data directory`);
        process.exit();
    }
}

async function initBlockChain(argv:any){
    await initConnex();
    await initWeb3();
    await initContracts();
}

async function initConnex() {
    try {
      const driver = await Driver.connect(new SimpleNet(environment.config.vechain.nodeHost as string));
      environment.connex = new Framework(driver);
    } catch (error) {
      console.error(`Init connex faild`);
      process.exit();
    }
}

async function initWeb3() {
    try {
      const web3 = new Web3(new Web3.providers.HttpProvider(environment.config.ethereum.nodeHost));
      environment.web3 = web3;
    } catch (error) {
      console.error(`Init web3 faild`);
      process.exit();
    }
}

async function initContracts() {
    environment.contractdir = path.join(__dirname,"../common/contracts");
    environment.contracts = {vechain:{},ethereum:{}};

    const bridgeCorePath = path.join(environment.contractdir,'/common/Contract_BridgeCore.sol');
    const bridgeCoreAbi = JSON.parse(compileContract(bridgeCorePath,'BridgeCore','abi'));

    environment.contracts.vechain.bridgeCore = new VContract({abi:bridgeCoreAbi,connex:environment.connex,address:environment.config.vechain.contracts.bridgeCore});
    environment.contracts.ethereum.bridgeCore = new environment.web3.eth.Contract(bridgeCoreAbi,environment.config.ethereum.contracts.bridgeCore);

    const ftBridgePath = path.join(environment.contractdir,'/common/Contract_FTBridge.sol');
    const ftBridgeAbi = JSON.parse(compileContract(ftBridgePath,'FTBridge','abi'));

    environment.contracts.vechain.ftBridge = new VContract({abi:ftBridgeAbi,connex:environment.connex,address:environment.config.vechain.contracts.ftBridge});
    environment.contracts.ethereum.ftBridge = new environment.web3.eth.Contract(ftBridgeAbi,environment.config.ethereum.contracts.ftBridge);
    
    const vechainBridgeTokensAddr = (await (environment.contracts.vechain.ftBridge as VContract).call('bridgeTokens')).decoded[0] as string;
    const ethereumBridgeTokensAddr = await (environment.contracts.ethereum.ftBridge as EContract).methods.bridgeTokens().call();

    const ftBridgeTokensPath = path.join(environment.contractdir,'/common/Contract_FTBridgeTokens.sol');
    const ftBridgeTokensAbi = JSON.parse(compileContract(ftBridgeTokensPath,'FTBridgeTokens','abi'));

    environment.contracts.vechain.ftBridgeTokens = new VContract({abi:ftBridgeTokensAbi,connex:environment.connex,address:vechainBridgeTokensAddr});
    environment.contracts.ethereum.ftBridgeTokens = new environment.web3.eth.Contract(ftBridgeTokensAbi,ethereumBridgeTokensAddr);
}

async function initDatabase(argv:any) {
    const databaseName = "vechain_asset_bridge_api.sqlite3";
    const databastPath = path.join(environment.datadir,databaseName);
    try {
      let dataSource = new DataSource({
        type:"sqlite",
        database:databastPath,
        enableWAL:environment.config.dbconfig && environment.config.dbconfig.enableWAL != undefined ? environment.config.dbconfig.enableWAL : true,
        entities:[path.join(__dirname,"../common/model/entities/**.entity{.ts,.js}")],
        synchronize:true
      });
      dataSource = await dataSource.initialize();
      environment.dataSource = dataSource;
      environment.database = databastPath;
    } catch (error) {
      console.error(`Init database ${databastPath} faild, error: ${error}`);
      process.exit();
    }
}

run(argv);