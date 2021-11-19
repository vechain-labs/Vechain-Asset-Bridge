import {Command, flags} from '@oclif/command'
import * as fileIO from 'fs';
import Environment from '../environment';
const path = require('path');
import * as ReadlineSync from 'readline-sync';
import { Keystore } from 'thor-devkit';

export var environment:any = {};

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

    if(flags.config){
      var configPath = flags.config.trim();
      configPath = configPath.substring(0,1) == '\'' ? configPath.substring(1) : configPath;
      configPath = configPath.substring(configPath.length - 1,1) == '\'' ? configPath.substring(0,configPath.length - 1) : configPath;
      if(fileIO.existsSync(configPath)){
        try {
          const config = require(configPath);
          config.serveName = "VeChain Asset Bridge Node";
          environment = new Environment(config);
        } catch (error) {
          console.error(`Read config faild.`);
          process.exit();
        }
      }
    } else {
      console.error(`Not set node config`);
      process.exit();
    }

    const databaseName = "vechain_asset_bridge_node.sqlite3";
    var datadir = path.join(__dirname,databaseName);
    if(flags.datadir){
      try {
        var fdir = flags.datadir.trim();
        fdir = fdir.substring(0,1) == '\'' ? fdir.substring(1) : fdir;
        fdir = fdir.substring(fdir.length - 1,1) == '\'' ? fdir.substring(0,fdir.length - 1) : fdir;
        fileIO.mkdirSync(fdir,{recursive:true});
        datadir = path.join(fdir,databaseName);
      } catch (error) {
        console.error(`Create data directory faild`);
        process.exit();
      }
    }
    environment.dbConfig = {
      type:"sqlite",
      database:datadir,
      enableWAL:true
    }

    if(flags.nodekey){
      var keystorePath = flags.nodekey.trim();
      keystorePath = keystorePath.substring(0,1) == '\'' ? keystorePath.substring(1) : keystorePath;
      keystorePath = keystorePath.substring(keystorePath.length - 1,1) == '\'' ? keystorePath.substring(0,keystorePath.length - 1) : keystorePath;
    } else {
      console.error(`Not set node keystore`);
      process.exit();
    }
  }

  private async loadNodeKey(keypath:string):Promise<any> {
    if(fileIO.existsSync(keypath)){
      try {
        const ks = JSON.parse(fileIO.readFileSync(keypath,"utf8"));
        const pwd = ReadlineSync.question(`keystore password:`, { hideEchoBack: true });
        const prikey = await Keystore.decrypt((ks as any), pwd);
        fileIO.writeFileSync()

      } catch (error) {
        console.error(`Keystore or password invalid.`);
        process.exit();
      }
    } else {
      console.error(`Can not load keystore file.`);
      process.exit();
    }
  }
}
