import {Command, flags} from '@oclif/command'
import * as fileIO from 'fs';
import Environment from '../environment';
const path = require('path');
import * as ReadlineSync from 'readline-sync';
import { Keystore } from 'thor-devkit';
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver';
import { TokenInfo } from '../common/utils/types/tokenInfo';
import { Verifier } from '../common/utils/types/verifier';
import { createConnection } from 'typeorm';
import { Framework } from '@vechain/connex-framework';
import Web3 from 'web3';
import BridgeValidationNode from '../vnode';

export var environment:any = {};environment.configPath = path.join(__dirname,"../../config");
export default class Node extends Command {
  static description = ''

  static examples = []

  static flags = {
    config:flags.string(),
    datadir:flags.string(),
    keystore:flags.string()
  }

  static args = []

  async run() {
    const {args, flags} = this.parse(Node);

    await this.intiEnv(flags);
    await this.initDatabase(flags);
    await this.initBlockChain(flags);

    console.info(`
    ******************** VeChain Asset Bridge Info ********************
    | VeChain ChainId Info    | ${environment.config.vechain.chainName} ${environment.config.vechain.chainId} ${environment.config.vechain.nodeHost}
    | Ethereum ChainId Info   | ${environment.config.ethereum.chainName}  ${environment.config.ethereum.chainId}  ${environment.config.ethereum.nodeHost}
    | Node Key Address        | ${(environment.wallet as SimpleWallet).list[0].address}
    | Database                | ${environment.database}
    *******************************************************************
    `);

    const node = new BridgeValidationNode(environment);
  }

  private async intiEnv(flags:any):Promise<any> {
    if(flags.config){
      var configPath = flags.config.trim();
      configPath = configPath.substring(0,1) == '\'' ? configPath.substring(1) : configPath;
      configPath = configPath.substring(configPath.length - 1,1) == '\'' ? configPath.substring(0,configPath.length - 1) : configPath;
      if(fileIO.existsSync(configPath)){
        try {
          const config = require(configPath);
          config.serveName = "VeChain Asset Bridge Node";
          environment = new Environment(config);
          environment.tokenInfo = new Array<TokenInfo>();
          environment.verifiers = new Array<Verifier>();
        } catch (error) {
          console.error(`Read config faild.`);
          process.exit();
        }
      } else {
        console.error(`Can't load configfile ${configPath}`);
        process.exit();
      }
    } else {
      console.error(`Not set node config`);
      process.exit();
    }
  }

  private async initDatabase(flags:any):Promise<any> {
    const databaseName = "vechain_asset_bridge_node.sqlite3";
    environment.datadir = "";
    if(flags.datadir){
      try {
        var fdir = flags.datadir.trim();
        fdir = fdir.substring(0,1) == '\'' ? fdir.substring(1) : fdir;
        fdir = fdir.substring(fdir.length - 1,1) == '\'' ? fdir.substring(0,fdir.length - 1) : fdir;
        fileIO.mkdirSync(fdir,{recursive:true});
        environment.datadir = fdir;
        environment.database = path.join(fdir,databaseName);
        const connectionOptions:any = {
          type:"sqlite",
          database:environment.database,
          enableWAL:environment.config.dbconfig && environment.config.dbconfig.enableWAL != undefined ? environment.config.dbconfig.enableWAL : true,
          entities:[path.join(__dirname,"../common/model/entities/**.entity{.ts,.js}")]
        }

        console.debug(`connectionOptions:` + JSON.stringify(connectionOptions));

        const connection = await createConnection(connectionOptions);
        if(connection.isConnected){
          await connection.synchronize();
        } else {
          console.error(`DataBase [db:${environment.database}] initialize faild`);
          process.exit();
        }
      } catch (error) {
        console.error(`Init database faild.`);
        console.debug(`Init database faild, error: ${error}`);
        process.exit();
      }
    } else {
      console.error(`Not set data directory`);
      process.exit();
    }
  }

  private async initBlockChain(flags:any):Promise<any> {
    environment.configPath = path.join(environment.datadir,"/.config/");
    environment.contractdir = path.join(__dirname,"../common/contracts/");
    let prikey = "";

    if(flags.keystore){
      var keystorePath = flags.keystore.trim();
      keystorePath = keystorePath.substring(0,1) == '\'' ? keystorePath.substring(1) : keystorePath;
      keystorePath = keystorePath.substring(keystorePath.length - 1,1) == '\'' ? keystorePath.substring(0,keystorePath.length - 1) : keystorePath;
      prikey = await this.loadNodeKey(keystorePath);
    } else if (fileIO.existsSync(path.join(environment.configPath,"node.key"))){
      const key = fileIO.readFileSync(path.join(environment.configPath,"node.key")).toString('utf8').toLocaleLowerCase();
      if(key.length == 64 && /^[0-9a-f]*$/i.test(prikey)){
        prikey = key;
      } else {
        console.error(`Can't load node key`);
        process.exit();
      }
    }

    if(prikey.length != 64){
      console.error(`Not set node key`);
      process.exit();
    }
    await this.initConnex(prikey);
    await this.initWeb3(prikey);
  }

  private async loadNodeKey(keypath:string):Promise<string> {
    if(fileIO.existsSync(keypath)){
      try {
        const ks = JSON.parse(fileIO.readFileSync(keypath,"utf8"));
        const pwd = ReadlineSync.question(`keystore password:`, { hideEchoBack: true });
        const prikey = await Keystore.decrypt((ks as any), pwd); 

        if(!fileIO.existsSync(environment.configPath)){
          fileIO.mkdirSync(environment.configPath);
        }
        fileIO.writeFileSync(path.join(environment.configPath,"node.key"),prikey.toString('hex'));
        return prikey.toString('hex');
      } catch (error) {
        console.error(`Keystore or password invalid. ${error}`);
        process.exit();
      }
    } else {
      console.error(`Can not load keystore file.`);
      process.exit();
    }
  }

  private async initConnex(priKey:string):Promise<any> {
    try {
      const wallet  = new SimpleWallet();
      wallet.import(priKey);
      environment.wallet = wallet;
      const driver = await Driver.connect(new SimpleNet(environment.config.vechain.nodeHost as string),environment.wallet);
      environment.connex = new Framework(driver);
    } catch (error) {
      console.error(`Init connex faild`);
      process.exit(); 
    }
  }

  private async initWeb3(priKey:string):Promise<any>{
    try {
      const web3 = new Web3(new Web3.providers.HttpProvider(environment.config.ethereum.nodeHost));
      web3.eth.accounts.wallet.add(priKey);
      environment.web3 = web3;
    } catch (error) {
      console.error(`Init web3 faild`);
      process.exit(); 
    }
  }
}
