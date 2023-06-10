import * as Yargs from 'yargs';
import * as fileIO from 'fs';
import { TokenInfo } from '../common/utils/types/tokenInfo';
import path from 'path';
import { Driver, SimpleNet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import Web3 from 'web3';
import { DataSource } from 'typeorm';
import ApiServer from '../apiServer';

const argv = Yargs.scriptName('apiserve')
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

    const port = environment.config.port || 18050;
    const app = new ApiServer(environment);
    app.listen(port);

  console.info(`
    ******************** VeChain Asset Bridge API Serve ********************
    | VeChain Info    | ${environment.config.vechain.chainName} ${environment.config.vechain.chainId} ${environment.config.vechain.nodeHost}
    | Ethereum Info   | ${environment.config.ethereum.chainName}  ${environment.config.ethereum.chainId}  ${environment.config.ethereum.nodeHost}
    | VeChain Bridge Core     | ${environment.config.vechain.contracts.bridgeCore}
    | Ethereunm Bridge Core   | ${environment.config.ethereum.contracts.bridgeCore}
    | Database                | ${environment.database}
    | Http Port | http://localhost:${port}
    *******************************************************************
  `);
}

function initEnv(argv:any) {
    var configPath = (argv.config || "" as string).trim();
  if(fileIO.existsSync(configPath)){
    try{
      const config = require(configPath);
      config.serveName = "VeChain Asset Bridge Api Serve";
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

async function initBlockChain(argv:any) {
    await initConnex();
    await initWeb3();
    environment.contractdir = path.join(__dirname,"../../../src/SmartContracts/contracts");
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

run(argv);
