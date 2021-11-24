import {Command, flags} from '@oclif/command';
import * as fileIO from 'fs';
import * as ReadlineSync from 'readline-sync';
import { Keystore } from 'thor-devkit';
const path = require('path');

export var environment:any = {};

export default class Deploy extends Command {
  static description = 'describe the command here'

  static flags = {
    keystore:flags.string()
  }

  static args = []

  async run() {
    const {args, flags} = this.parse(Deploy);
    const loadPrikey = await this.loadPriKey(flags);
  }

  private async loadPriKey(flags:any):Promise<string>{
    if(flags.keystore){
      var keystorePath = flags.keystore.trim();
      keystorePath = keystorePath.substring(0,1) == '\'' ? keystorePath.substring(1) : keystorePath;
      keystorePath = keystorePath.substring(keystorePath.length - 1,1) == '\'' ? keystorePath.substring(0,keystorePath.length - 1) : keystorePath;
      if(fileIO.existsSync(keystorePath)){
        try {
          const ks = JSON.parse(fileIO.readFileSync(keystorePath,"utf8"));
          const pwd = ReadlineSync.question(`keystore password:`, { hideEchoBack: true });
          const prikey = await Keystore.decrypt((ks as any), pwd); 
          return prikey.toString('hex');
        } catch (error) {
          console.error(`Keystore or password invalid. ${error}`);
          process.exit();
        }
      } else {
        console.error(`Can not load keystore file.`);
        process.exit();
      }
    } else {
      console.error(`Can't load deployer private key`);
      process.exit();
    }
  }
}
