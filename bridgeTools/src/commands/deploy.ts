import {Command, flags} from '@oclif/command';
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as fileIO from 'fs';
import { Contract } from 'myvetools';
import * as ReadlineSync from 'readline-sync';
import { Keystore, secp256k1,address } from 'thor-devkit';
import { compileContract } from "myvetools/dist/utils";
const path = require('path');
import Web3 from 'web3';
import { getReceipt } from 'myvetools/dist/connexUtils';

export var environment:any = {};
environment.config = {};
environment.contractdir = path.join(__dirname,"../common/contracts/");
environment.configPath = path.join(__dirname,"../../config/config_tools.json");
environment.contract = {};
export default class Deploy extends Command {
  static description = 'describe the command here'

  static flags = {
    keystore:flags.string(),
    config:flags.string()
  }

  static args = []

  async run() {
    const {args, flags} = this.parse(Deploy);
    await this.initConfig(flags);
    await this.loadPriKey(flags);
    await this.connNodes();
    await this.initContracts();
    console.info(`
******************** VeChain Asset Bridge Tools Info ********************
| VeChain ChainId Info    | ${environment.config.vechain.chainName} ${environment.config.vechain.chainId} ${environment.config.vechain.nodeHost}
| Ethereum ChainId Info   | ${environment.config.ethereum.chainName}  ${environment.config.ethereum.chainId}  ${environment.config.ethereum.nodeHost}
| Node Key Address        | ${environment.master}
*******************************************************************
    `);
    while(true){
      const operations = ReadlineSync.question(`
Operations:
0. Quit
1. Deploy VeChain Bridge & Verifier Contract.
2. Deploy Ethereum Bridge & Verifier Contract.
3. Deploy and register token to bridge.
4. Add Verifier.
enter operation: 
`);
      switch(operations){
        case "0":
          console.info("Quit Bridge Tools");
          process.exit();
        case "1":
          await this.deployVeChainBridge();
          break;
        case "2":
          await this.deployEthereumBridge();
          break;
        case "3":
          await this.deployToken();
          break;
        default:
          console.error(`Invalid operation.`);
          break;
      }
    }
  }

  private async initConfig(flags:any):Promise<any>{
    if(flags.config){
      var configPath = flags.config.trim();
      configPath = configPath.substring(0,1) == '\'' ? configPath.substring(1) : configPath;
      configPath = configPath.substring(configPath.length - 1,1) == '\'' ? configPath.substring(0,configPath.length - 1) : configPath;
      if(fileIO.existsSync(configPath)){
        environment.config = require(configPath);
      } else {
        console.error(`Read config faild.`);
        process.exit();
      }
    } else {
      if(fileIO.existsSync(environment.configPath)){
        environment.config = require(environment.configPath);
      }
    }
  }

  private async loadPriKey(flags:any):Promise<any>{
    if(flags.keystore){
      var keystorePath = flags.keystore.trim();
      keystorePath = keystorePath.substring(0,1) == '\'' ? keystorePath.substring(1) : keystorePath;
      keystorePath = keystorePath.substring(keystorePath.length - 1,1) == '\'' ? keystorePath.substring(0,keystorePath.length - 1) : keystorePath;
      if(fileIO.existsSync(keystorePath)){
        try {
          const ks = JSON.parse(fileIO.readFileSync(keystorePath,"utf8"));
          const pwd = ReadlineSync.question(`keystore password:`, { hideEchoBack: true });
          const prikey = await Keystore.decrypt((ks as any), pwd);
          const pubKey = secp256k1.derivePublicKey(prikey)
          const addr = address.fromPublicKey(pubKey);
          environment.prieky = prikey.toString('hex');
          environment.master = addr;
        } catch (error) {
          console.error(`Keystore or password invalid. ${error}`);
          process.exit();
        }
      } else {
        console.error(`Can not load keystore file.`);
        process.exit();
      }
    } else {
      console.error(`Can't load master private key`);
      process.exit();
    }
  }

  private async connNodes():Promise<any>{
    await this.connVeChainNode();
    await this.connEthereumNode();
  }

  private async initContracts():Promise<any>{
    environment.contract = {
      vechain:{},
      ethereum:{}
    }
    const bridgeFilePath = path.join(environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));

    if(environment.config.vechain.contracts.v2eBridge != undefined || ""){
      environment.contract.vechain.bridgeContract = new Contract({ abi: bridgeAbi, connex: environment.connex, address: environment.config.vechain.contracts.v2eBridge});
    }

    if(environment.config.ethereum.contracts.e2vBridge != undefined || ""){
      environment.contract.ethereum.bridgeContract = new (environment.web3 as Web3).eth.Contract(bridgeAbi,environment.config.ethereum.contracts.e2vBridge);
    }

    const vBridgeVerifierPath = path.join(environment.contractdir, "/vechainthor/Contract_V2EBridgeVerifier.sol");
    const vBridgeVerifierAbi = JSON.parse(compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'abi',[environment.contractdir]));
    if(environment.config.vechain.contracts.v2eBridgeVerifier != undefined || ""){
      environment.contract.vechain.verifierContract = new Contract({ abi: vBridgeVerifierAbi, connex: environment.connex, address: environment.config.vechain.contracts.v2eBridgeVerifier});
    }

    const eBridgeVerifierPath = path.join(environment.contractdir, "/ethereum/Contract_E2VBridgeVerifier.sol");
    const eBridgeVerifierAbi = JSON.parse(compileContract(eBridgeVerifierPath,"E2VBridgeVerifier","abi",[environment.contractdir]));
    if(environment.config.ethereum.contracts.v2eBridgeVerifier != undefined || ""){
      environment.contract.ethereum.verifierContract = new (environment.web3 as Web3).eth.Contract(eBridgeVerifierAbi,environment.config.ethereum.contracts.v2eBridgeVerifier);
    }
  }

  private async connVeChainNode():Promise<any>{
    try {
      let vechaiHost = "";
      if(environment.config.vechain.nodeHost != undefined || ""){
        vechaiHost = environment.config.vechain.nodeHost;
      } else {
        vechaiHost = ReadlineSync.question(`VeChain Node Host:`);
      }
      const wallet  = new SimpleWallet();
      wallet.import(environment.prieky);
      environment.wallet = wallet;
      const driver = await Driver.connect(new SimpleNet(vechaiHost),environment.wallet);
      environment.connex = new Framework(driver);
      const chainId = '0x' + environment.connex.thor.genesis.id.substring(64);
      environment.config.vechain = {
          nodeHost:vechaiHost,
          chainName:"vechain",
          chainId:chainId,
          confirmHeight:6,
          expiration:180
      }
    } catch (error) {
      console.error(`Connect VeChain Node Faild. error:${error}`);
      process.exit();
    }
  }

  private async connEthereumNode():Promise<any>{
    try {
      let ethereumHost = "";
      if(environment.config.ethereum.nodeHost != undefined || ""){
        ethereumHost = environment.config.ethereum.nodeHost;
      } else {
        ethereumHost = ReadlineSync.question(`Ethereum Node Host:`);
      }
      const web3 = new Web3(new Web3.providers.HttpProvider(ethereumHost));
      web3.eth.accounts.wallet.add(environment.prieky);
      environment.web3 = web3;
      const chainId = await environment.web3.eth.getChainId();
      environment.config.ethereum = {
          nodeHost:ethereumHost,
          chainName:"ethereum",
          chainId:chainId,
          confirmHeight:3,
          expiration:24
      }
    } catch (error) {
      console.error(`Connect Ethereum Node Faild. error:${error}`);
      process.exit();
    }
  }

  private async deployVeChainBridge():Promise<any>{
    const bridgeFilePath = path.join(environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));
    const bridgeBin = compileContract(bridgeFilePath, 'BridgeHead', 'bytecode');
    const bridgeContract = new Contract({ abi: bridgeAbi, connex: environment.connex, bytecode: bridgeBin });
    
    const vBridgeVerifierPath = path.join(environment.contractdir, "/vechainthor/Contract_V2EBridgeVerifier.sol");
    const vBridgeVerifierAbi = JSON.parse(compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'abi',[environment.contractdir]));
    const vBridgeVerifierBin = compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'bytecode',[environment.contractdir]);
    const v2eBridgeVerifier = new Contract({ abi: vBridgeVerifierAbi, connex: environment.connex, bytecode: vBridgeVerifierBin});
    
    environment.contract.vechain = {
      bridgeContract:bridgeContract,
      bridgeVerifier:v2eBridgeVerifier
    }

    try {
      console.info(`deploy vechain bridge contract.`);
      const clause1 = bridgeContract.deploy(0,environment.config.vechain.chainName,environment.config.vechain.chainId);
      const txrep1 = await (environment.connex as Framework).vendor.sign('tx',[clause1])
        .signer((environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt1 = await getReceipt(environment.connex,6,txrep1.txid);
      if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
        console.error('deploy vechain bridge faild');
        process.exit();
      }
      bridgeContract.at(receipt1.outputs[0].contractAddress);

      console.info(`deploy vechain bridge verifier contract.`);
      const clause2 = v2eBridgeVerifier.deploy(0);
      const txrep2 = await (environment.connex as Framework).vendor.sign('tx',[clause2])
        .signer((environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt2 = await getReceipt(environment.connex,6,txrep2.txid);
      if (receipt2 == null || receipt2.reverted || receipt2.outputs[0].contractAddress == undefined) {
        console.error('deploy vechain verifiter faild');
        process.exit();
      }
      v2eBridgeVerifier.at(receipt2.outputs[0].contractAddress);
      environment.config.vechain.startBlockNum = receipt2.meta.blockNumber;

      console.info(`set verifier address.`);
      const clause3 = bridgeContract.send("setVerifier",0,v2eBridgeVerifier.address);
      const txrep3 = await (environment.connex as Framework).vendor.sign('tx',[clause3])
        .signer((environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt3 = await getReceipt(environment.connex,6,txrep3.txid);
      if (receipt3 == null || receipt3.reverted) {
        console.error('vechain bridge setVerifier faild');
        process.exit();
      }

      console.info(`set bridge address.`);
      const clause4 = v2eBridgeVerifier.send("setBridge",0,bridgeContract.address);
      const txrep4 = await (environment.connex as Framework).vendor.sign('tx',[clause4])
        .signer((environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt4 = await getReceipt(environment.connex,6,txrep4.txid);
      if (receipt4 == null || receipt4.reverted) {
        console.error('vechain bridge verifier setBridge faild');
        process.exit();
      }

      environment.config.vechain.contracts = {
        v2eBridge:bridgeContract.address,
        v2eBridgeVerifier:v2eBridgeVerifier.address
      };

      console.info(`
Deploy Finish.
VeChain bridge: ${bridgeContract.address} blockNum:${receipt3.meta.blockNumber} deployTx:${receipt3.meta.txID}
VeChain verifier: ${v2eBridgeVerifier.address} blockNum:${receipt4.meta.blockNumber} deployTx:${receipt4.meta.blockNumber}
    `);

    } catch (error) {
      console.error(`Deploy VeChain bridge & verifier faild. error: ${error}`);
      process.exit();
    }
  }

  private async deployEthereumBridge():Promise<any>{
    const bridgeFilePath = path.join(environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));
    const bridgeBin = compileContract(bridgeFilePath, 'BridgeHead', 'bytecode');
    let bridgeContract = new (environment.web3 as Web3).eth.Contract(bridgeAbi);

    const eBridgeVerifierPath = path.join(environment.contractdir, "/ethereum/Contract_E2VBridgeVerifier.sol");
    const eBridgeVerifierAbi = JSON.parse(compileContract(eBridgeVerifierPath,"E2VBridgeVerifier","abi",[environment.contractdir]));
    const eBridgeVerifierBin = compileContract(eBridgeVerifierPath, 'E2VBridgeVerifier', 'bytecode',[environment.contractdir]);
    let e2vBridgeVerifier = new (environment.web3 as Web3).eth.Contract(eBridgeVerifierAbi);

    try {
      //get Gas Price
      const gasPrice = await (environment.web3 as Web3).eth.getGasPrice();
      

      console.log(`deploy ethereum bridge contract.`);
      let bridgeMeta:any = {};
      const deployBridge = bridgeContract.deploy({data:bridgeBin,arguments:[environment.config.ethereum.chainName,environment.config.ethereum.chainId]});
      const deployBridgeGas = await deployBridge.estimateGas({
        from:(environment.wallet as SimpleWallet).list[0].address
      });
      bridgeContract = await deployBridge.send({
        from:(environment.wallet as SimpleWallet).list[0].address,
        gas:deployBridgeGas,
        gasPrice:gasPrice
      }).on("receipt",function(receipt){
        bridgeMeta = {
          deploy:{
            blockNum:receipt.blockNumber,
            deployTx:receipt.transactionHash
          }
        }
      });

      console.log(`deploy ethereum bridge verifier contract.`);
      let verifierMeta:any = {};
      const deployVerifier = e2vBridgeVerifier.deploy({data:eBridgeVerifierBin});
      const deployVerifierGas = await deployVerifier.estimateGas({
        from:(environment.wallet as SimpleWallet).list[0].address
      });
      e2vBridgeVerifier = await deployVerifier.send({
        from:(environment.wallet as SimpleWallet).list[0].address,
        gas:deployVerifierGas,
        gasPrice:gasPrice
      }).on("receipt",function(receipt){
        verifierMeta = {
          deploy:{
            blockNum:receipt.blockNumber,
            deployTx:receipt.transactionHash
          }
        }
        environment.config.ethereum.startBlockNum = receipt.blockNumber
      });

      console.log(`set verifier address.`);
      const setVerifier = bridgeContract.methods.setVerifier(e2vBridgeVerifier.options.address);
      const setVerifierGas = await setVerifier.estimateGas({
        from:(environment.wallet as SimpleWallet).list[0].address
      });
      await setVerifier.send({
        from:(environment.wallet as SimpleWallet).list[0].address,
        gas:setVerifierGas,
        gasPrice:gasPrice
      });

      console.log(`set bridge address`);
      const setBridge = e2vBridgeVerifier.methods.setBridge(bridgeContract.options.address);
      const setBridgeGas = await setBridge.estimateGas({
        from:(environment.wallet as SimpleWallet).list[0].address
      });
      await setBridge.send({
        from:(environment.wallet as SimpleWallet).list[0].address,
        gas:setBridgeGas,
        gasPrice:gasPrice
      });

      environment.config.ethereum.contracts = {
        e2vBridge:bridgeContract.options.address,
        e2vBridgeVerifier:e2vBridgeVerifier.options.address
      }

      console.info(`
Deploy finish.
Ethereum bridge: ${bridgeContract.options.address} blockNum:${bridgeMeta.deploy.blockNum} deployTx:${bridgeMeta.deploy.deployTx}
Ethereum verifier: ${e2vBridgeVerifier.options.address} blockNum:${verifierMeta.deploy.blockNum} deployTx:${verifierMeta.deploy.deployTx}
    `);

    } catch (error) {
      console.error(`Deploy Ethereum bridge & verifier faild. error: ${error}`);
      process.exit();
    }
  }

  private async deployToken():Promise<any>{
    try {
      const blockchain = ReadlineSync.question(`Choose Blockchain(vechain | ethereum):`).trim();
      if(blockchain == "vechain"){
        await this.deployTokenToVeChain();
      } else if(blockchain == "ethereum"){
        await this.deployTokenToEthereum();
      } else {
        console.error(`Not support blockchain`);
      process.exit();
      }
    } catch (error) {
      console.error(`Deploy Token faild. error:${error}`);
      process.exit();
    }
  }

  private async deployTokenToVeChain():Promise<any>{
    const fTokenFilePath = path.join(environment.contractdir, "/common/Contract_FungibleToken.sol");
    const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
    const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
    const fTokenContract = new Contract({ abi: fTokenAbi, connex: environment.connex, bytecode: fTokenBin });

    const wTokenFilePath = path.join(environment.contractdir, "/common/Contract_BridgeWrappedToken.sol");
    const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
    const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
    const wTokenContract = new (environment.web3 as Web3).eth.Contract(wTokenAbi);

    console.log(`Deploy and register token to VeChain`);
    const value = ReadlineSync.question(`Enter exists token address (empty will deploy new contract):`).trim();
    let originTokenInfo = {
      address:"",
      name:"",
      symbol:"",
      decimals:0,
      nativeCoin:false
    }
    let bridgeWrappedTokenInfo = {
      address:"",
      name:"",
      symbol:"",
      decimals:0
    }

    try {
      if(value.length == 42){
        fTokenContract.at(value);
        const name = String((await fTokenContract.call("name")).decoded[0]);
        const symbol = String((await fTokenContract.call("symbol")).decoded[0]).toLocaleUpperCase();
        const decimals = Number((await fTokenContract.call("decimals")).decoded[0]);
        originTokenInfo = {
          address:value,
          name:name,
          symbol:symbol,
          decimals:decimals,
          nativeCoin:false
        }
      } else {
        const name = ReadlineSync.question(`Token name:`).trim();
        const symbol = ReadlineSync.question(`Token symbol:`).trim().toLocaleUpperCase();
        const decimals = Number(ReadlineSync.question(`Token decimals`).trim());
        originTokenInfo = {
          address:"",
          name:name,
          symbol:symbol,
          decimals:decimals,
          nativeCoin:false
        }
      }
      const nativecoin = ReadlineSync.question(`Is VeChain Native Coin?(y/n)`).trim().toLowerCase();
      originTokenInfo.nativeCoin = nativecoin == "y" ? true : false;
      console.log(`Origin Token address:${originTokenInfo.address} name:${originTokenInfo.name} symbol:${originTokenInfo.symbol} decimals:${originTokenInfo.decimals} NativeCoin:${originTokenInfo.nativeCoin}`);
      let wname = ReadlineSync.question(`Ethereum Bridge Wrapped Token name (default ${"Bridge Wrapped" + originTokenInfo.name}):`).trim();
      let wsymbol = ReadlineSync.question(`Ethereum Bridge Wrapped Token name (default ${"W" + originTokenInfo.symbol.substring(1)}):`).trim();

      bridgeWrappedTokenInfo = {
        address:"",
        name:wname.length > 0 ? wname : "Bridge Wrapped" + originTokenInfo.name,
        symbol:wsymbol.length > 0 ? wsymbol : "W" + originTokenInfo.symbol.substring(1),
        decimals:originTokenInfo.decimals
      }
      console.log(`Bridge Wrapped address:${bridgeWrappedTokenInfo.address} name:${bridgeWrappedTokenInfo.name} symbol:${bridgeWrappedTokenInfo.symbol} decimals:${bridgeWrappedTokenInfo.decimals}`);

      const next = ReadlineSync.question(`Continue to deploy & register token (y/n)`).trim().toLocaleLowerCase();
      if(next == "n"){
        console.info(`Quit deploy`);
        return;
      }

      if(originTokenInfo.address == ""){
        const clause1 = fTokenContract.deploy(0,originTokenInfo.name,originTokenInfo.symbol,originTokenInfo.decimals);
        const txrep = await (environment.connex as Framework).vendor.sign('tx',[clause1])
          .signer((environment.wallet as SimpleWallet).list[0].address)
          .request();
        const receipt = await getReceipt(environment.connex, 5, txrep.txid);
        if(receipt == null || receipt.reverted || receipt.outputs[0].contractAddress == undefined){
          console.error(`deploy token faild.`);
          return;
        }
        originTokenInfo.address = receipt.outputs[0].contractAddress;
      }
    } catch (error) {
      console.error(`deploy token faild.`);
      process.exit();
    }

    
  }

  private async deployTokenToEthereum():Promise<any>{
  }
}
