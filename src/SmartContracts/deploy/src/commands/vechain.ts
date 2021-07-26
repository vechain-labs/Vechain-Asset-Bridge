import {Command, flags} from '@oclif/command';
const path = require('path');
import * as fileIO from 'fs';
import { Framework } from "@vechain/connex-framework";
import { Driver, SimpleNet } from '@vechain/connex-driver';

export default class VeChain extends Command {

  static flags = {
    baseinfo:flags.boolean({char:"i"}),
    deploy:flags.boolean({char:"d"})
  }

  private dConfig:any = {};
  private connex!: Framework;
  private dConfigPath = path.join(__dirname,"../config/config.json");
  private chainId = "";
  private nettype = "";


  async run(){
    const { args, flags } = this.parse(VeChain);

    if(flags.baseinfo){
      console.log("----------BaseInfo----------");
      console.log("BlockChain: VeChainThor");
      console.log(`ChainTag: ${this.chainId}(${this.nettype})`);
      console.log("-------------End------------");
      process.exit();
    }

    if(flags.deploy){
      while(true){
        let msg = `choose deploy contracts:
                   1. bridge contract
                   2. verifier contract
                   3. add token `
      }
    }
  }

  async init():Promise<any>{
    if(!fileIO.existsSync(this.dConfigPath)){
      console.error(`can't load config ${this.dConfigPath}`);
      process.exit();
    }
    this.dConfig = require(this.dConfigPath);
    const driver = await Driver.connect(new SimpleNet(this.dConfig.vechain.nodeHost as string));
    this.connex = new Framework(driver);

    this.chainId = "0x" + (await this.connex!.thor.block(0).get())!.id.substr(64).toLocaleLowerCase();
    this.nettype = "unknow";

    switch(this.chainId){
      case "0x4a":
        this.nettype = "main";
        break;
      case "0x27":
        this.nettype = "test";
        break;
      case "0xf6":
        this.nettype = "solo";
        break;
      default:
        break;
    }
  }
}
