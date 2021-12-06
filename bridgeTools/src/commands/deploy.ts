import {Command, flags} from '@oclif/command';
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as fileIO from 'fs';
import { Contract } from 'myvetools';
import {Contract as EthContract} from 'web3-eth-contract';
import * as ReadlineSync from 'readline-sync';
import { Keystore, secp256k1,address } from 'thor-devkit';
import { compileContract } from "myvetools/dist/utils";
const path = require('path');
import Web3 from 'web3';
import { getReceipt } from 'myvetools/dist/connexUtils';
export default class Deploy extends Command {

  static description = 'describe the command here'

  static flags = {
    keystore:flags.string(),
    config:flags.string()
  }

  static args = []

  private environment:any = {};

  async run() {
    const {args, flags} = this.parse(Deploy);
    await this.initConfig(flags);
    await this.loadPriKey(flags);
    await this.connNodes();
    await this.initContracts();
    console.info(`
******************** VeChain Asset Bridge Tools Info ********************
| VeChain ChainId Info    | ${this.environment.config.vechain.chainName} ${this.environment.config.vechain.chainId} ${this.environment.config.vechain.nodeHost}
| Ethereum ChainId Info   | ${this.environment.config.ethereum.chainName}  ${this.environment.config.ethereum.chainId}  ${this.environment.config.ethereum.nodeHost}
| Node Key Address        | ${this.environment.master}
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
        case "4":
          await this.addVerifier();
          break;
        default:
          console.error(`Invalid operation.`);
          break;
      }
    }
  }

  private async initConfig(flags:any):Promise<any>{
    this.environment.contractdir = path.join(__dirname,"../common/contracts/");
    this.environment.configPath = path.join(__dirname,"../../config/config_tools.json");
    this.environment.config = {};
    this.environment.contract = {
      vechain:{},
      ethereum:{}
    };

    if(flags.config){
      var configPath = flags.config.trim();
      configPath = configPath.substring(0,1) == '\'' ? configPath.substring(1) : configPath;
      configPath = configPath.substring(configPath.length - 1,1) == '\'' ? configPath.substring(0,configPath.length - 1) : configPath;
      if(fileIO.existsSync(configPath)){
        this.environment.config = require(configPath);
      } else {
        console.error(`Read config faild.`);
        process.exit();
      }
    } else {
      if(fileIO.existsSync(this.environment.configPath)){
        this.environment.config = require(this.environment.configPath);
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
          this.environment.prieky = prikey.toString('hex');
          this.environment.master = addr;
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
    this.environment.contract = {
      vechain:{},
      ethereum:{}
    }
    const bridgeFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));

    const vBridgeVerifierPath = path.join(this.environment.contractdir, "/vechainthor/Contract_V2EBridgeVerifier.sol");
    const vBridgeVerifierAbi = JSON.parse(compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'abi',[this.environment.contractdir]));

    const eBridgeVerifierPath = path.join(this.environment.contractdir, "/ethereum/Contract_E2VBridgeVerifier.sol");
    const eBridgeVerifierAbi = JSON.parse(compileContract(eBridgeVerifierPath,"E2VBridgeVerifier","abi",[this.environment.contractdir]));

    this.environment.contract.vechain.bridgeContract = new Contract({ abi: bridgeAbi, connex: this.environment.connex});
    this.environment.contract.ethereum.bridgeContract = new (this.environment.web3 as Web3).eth.Contract(bridgeAbi);
    this.environment.contract.vechain.verifierContract = new Contract({ abi: vBridgeVerifierAbi, connex: this.environment.connex});
    this.environment.contract.ethereum.verifierContract = new (this.environment.web3 as Web3).eth.Contract(eBridgeVerifierAbi);

    if(this.environment.config.vechain.contracts != undefined && this.environment.config.vechain.contracts.v2eBridge != undefined && this.environment.config.vechain.contracts.v2eBridge != ""){
      (this.environment.contract.vechain.bridgeContract as Contract).at(this.environment.config.vechain.contracts.v2eBridge);
    }

    if(this.environment.config.ethereum.contracts != undefined && this.environment.config.ethereum.contracts.e2vBridge != undefined && this.environment.config.ethereum.contracts.e2vBridge != ""){
      (this.environment.contract.ethereum.bridgeContract as EthContract).options.address = this.environment.config.ethereum.contracts.e2vBridge;
    }

    if(this.environment.config.vechain.contracts != undefined && this.environment.config.vechain.contracts.v2eBridgeVerifier != undefined && this.environment.config.vechain.contracts.v2eBridgeVerifier != ""){
      (this.environment.contract.vechain.verifierContract as Contract).at(this.environment.config.vechain.contracts.v2eBridgeVerifier);
    }
    
    if(this.environment.config.ethereum.contracts != undefined && this.environment.config.ethereum.contracts.v2eBridgeVerifier != undefined && this.environment.config.ethereum.contracts.v2eBridgeVerifier != ""){
      (this.environment.contract.ethereum.verifierContract as EthContract).options.address = this.environment.config.ethereum.contracts.v2eBridgeVerifier;
    }
  }

  private async connVeChainNode():Promise<any>{
    try {
      let vechaiHost = "";
      if(this.environment.config.vechain.nodeHost != undefined || ""){
        vechaiHost = this.environment.config.vechain.nodeHost;
      } else {
        vechaiHost = ReadlineSync.question(`VeChain Node Host:`);
      }
      const wallet  = new SimpleWallet();
      wallet.import(this.environment.prieky);
      this.environment.wallet = wallet;
      const driver = await Driver.connect(new SimpleNet(vechaiHost),this.environment.wallet);
      this.environment.connex = new Framework(driver);
      const chainId = '0x' + this.environment.connex.thor.genesis.id.substring(64);
      this.environment.config.vechain = {
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
      if(this.environment.config.ethereum.nodeHost != undefined || ""){
        ethereumHost = this.environment.config.ethereum.nodeHost;
      } else {
        ethereumHost = ReadlineSync.question(`Ethereum Node Host:`);
      }
      const web3 = new Web3(new Web3.providers.HttpProvider(ethereumHost));
      web3.eth.accounts.wallet.add(this.environment.prieky);
      this.environment.web3 = web3;
      const chainId = await this.environment.web3.eth.getChainId();
      this.environment.config.ethereum = {
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
    const bridgeFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));
    const bridgeBin = compileContract(bridgeFilePath, 'BridgeHead', 'bytecode');
    const bridgeContract = new Contract({ abi: bridgeAbi, connex: this.environment.connex, bytecode: bridgeBin });
    
    const vBridgeVerifierPath = path.join(this.environment.contractdir, "/vechainthor/Contract_V2EBridgeVerifier.sol");
    const vBridgeVerifierAbi = JSON.parse(compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'abi',[this.environment.contractdir]));
    const vBridgeVerifierBin = compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'bytecode',[this.environment.contractdir]);
    const v2eBridgeVerifier = new Contract({ abi: vBridgeVerifierAbi, connex: this.environment.connex, bytecode: vBridgeVerifierBin});


    try {
      console.info(`deploy vechain bridge contract.`);
      const chainName = String(this.environment.config.vechain.chainName);
      const chainId = String(this.environment.config.vechain.chainId);
      const clause1 = bridgeContract.deploy(0,chainName,chainId);
      const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx',[clause1])
        .signer((this.environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt1 = await getReceipt(this.environment.connex,6,txrep1.txid);
      if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
        console.error('deploy vechain bridge faild');
        process.exit();
      }
      bridgeContract.at(receipt1.outputs[0].contractAddress);

      console.info(`deploy vechain bridge verifier contract.`);
      const clause2 = v2eBridgeVerifier.deploy(0);
      const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx',[clause2])
        .signer((this.environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt2 = await getReceipt(this.environment.connex,6,txrep2.txid);
      if (receipt2 == null || receipt2.reverted || receipt2.outputs[0].contractAddress == undefined) {
        console.error('deploy vechain verifiter faild');
        process.exit();
      }
      v2eBridgeVerifier.at(receipt2.outputs[0].contractAddress);
      this.environment.config.vechain.startBlockNum = receipt2.meta.blockNumber;

      console.info(`set verifier address.`);
      const clause3 = bridgeContract.send("setVerifier",0,v2eBridgeVerifier.address);
      const txrep3 = await (this.environment.connex as Framework).vendor.sign('tx',[clause3])
        .signer((this.environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt3 = await getReceipt(this.environment.connex,6,txrep3.txid);
      if (receipt3 == null || receipt3.reverted) {
        console.error('vechain bridge setVerifier faild');
        process.exit();
      }

      console.info(`set bridge address.`);
      const clause4 = v2eBridgeVerifier.send("setBridge",0,bridgeContract.address);
      const txrep4 = await (this.environment.connex as Framework).vendor.sign('tx',[clause4])
        .signer((this.environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt4 = await getReceipt(this.environment.connex,6,txrep4.txid);
      if (receipt4 == null || receipt4.reverted) {
        console.error('vechain bridge verifier setBridge faild');
        process.exit();
      }

      this.environment.config.vechain.contracts = {
        v2eBridge:bridgeContract.address, 
        v2eBridgeVerifier:v2eBridgeVerifier.address
      };

      this.environment.contract.vechain = {
        bridgeContract:bridgeContract,
        bridgeVerifier:v2eBridgeVerifier
      };

      console.info(`
Deploy Finish.
VeChain bridge: ${bridgeContract.address} blockNum:${receipt1.meta.blockNumber} deployTx:${receipt1.meta.txID}
VeChain verifier: ${v2eBridgeVerifier.address} blockNum:${receipt2.meta.blockNumber} deployTx:${receipt2.meta.txID}
    `);

    } catch (error) {
      console.error(`Deploy VeChain bridge & verifier faild. error: ${error}`);
      process.exit();
    }
  }

  private async deployEthereumBridge():Promise<any>{
    const bridgeFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi',[this.environment.contractdir]));
    const bridgeBin = compileContract(bridgeFilePath, 'BridgeHead', 'bytecode',[this.environment.contractdir]);
    let bridgeContract = new (this.environment.web3 as Web3).eth.Contract(bridgeAbi);

    const eBridgeVerifierPath = path.join(this.environment.contractdir, "/ethereum/Contract_E2VBridgeVerifier.sol");
    const eBridgeVerifierAbi = JSON.parse(compileContract(eBridgeVerifierPath,"E2VBridgeVerifier","abi",[this.environment.contractdir]));
    const eBridgeVerifierBin = compileContract(eBridgeVerifierPath, 'E2VBridgeVerifier', 'bytecode',[this.environment.contractdir]);
    let e2vBridgeVerifier = new (this.environment.web3 as Web3).eth.Contract(eBridgeVerifierAbi);

    try {
      //get Gas Price
      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();

      console.log(`deploy ethereum bridge contract.`);
      let bridgeMeta:any = {};
      const chainName = String(this.environment.config.ethereum.chainName);
      const chainId = String(this.environment.config.ethereum.chainId);
      const deployBridgeGas = await bridgeContract.deploy({data:bridgeBin,arguments:[chainName,chainId]}).estimateGas({
        from:(this.environment.wallet as SimpleWallet).list[0].address
      });
      bridgeContract = await bridgeContract.deploy({data:bridgeBin,arguments:[chainName,chainId]}).send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
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
        from:(this.environment.wallet as SimpleWallet).list[0].address
      });
      const contract = e2vBridgeVerifier = await deployVerifier.send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
        gas:deployVerifierGas,
        gasPrice:gasPrice
      }).on("receipt",function(receipt){
        verifierMeta = {
          deploy:{
            blockNum:receipt.blockNumber,
            deployTx:receipt.transactionHash
          }
        }
      });
      this.environment.config.ethereum.startBlockNum = verifierMeta.deploy.blockNum;

      console.log(`set verifier address.`);
      const setVerifier = bridgeContract.methods.setVerifier(e2vBridgeVerifier.options.address);
      const setVerifierGas = await setVerifier.estimateGas({
        from:(this.environment.wallet as SimpleWallet).list[0].address
      });
      await setVerifier.send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
        gas:setVerifierGas,
        gasPrice:gasPrice
      });

      console.log(`set bridge address`);
      const setBridge = e2vBridgeVerifier.methods.setBridge(bridgeContract.options.address);
      const setBridgeGas = await setBridge.estimateGas({
        from:(this.environment.wallet as SimpleWallet).list[0].address
      });
      await setBridge.send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
        gas:setBridgeGas,
        gasPrice:gasPrice
      });

      this.environment.config.ethereum.contracts = {
        e2vBridge:bridgeContract.options.address,
        e2vBridgeVerifier:e2vBridgeVerifier.options.address
      };

      this.environment.contract.ethereum = {
        bridgeContract:bridgeContract,
        verifierContract:e2vBridgeVerifier
      };

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
      await this.initVeChainBridge();
      await this.initEthereumBridge();

      const blockchain = ReadlineSync.question(`Choose Blockchain(vechain | ethereum):`).trim();
      if(blockchain == "vechain"){
        await this.deployTokenToVeChain();
      } else if(blockchain == "ethereum"){
        await this.deployTokenToEthereum();
      } else {
        console.error(`Not support blockchain`);
        return;
      }
    } catch (error) {
      console.error(`Deploy Token faild. error:${error}`);
      return;
    }
  }

  private async deployTokenToVeChain():Promise<any>{
    const fTokenFilePath = path.join(this.environment.contractdir, "/common/Contract_FungibleToken.sol");
    const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
    const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
    let fTokenContract = new Contract({ abi: fTokenAbi, connex: this.environment.connex, bytecode: fTokenBin });

    const wTokenFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeWrappedToken.sol");
    const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
    const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
    let wTokenContract = new (this.environment.web3 as Web3).eth.Contract(wTokenAbi);

    console.log(`Deploy and register token to VeChain`);
    const value = ReadlineSync.question(`Enter exists token address (empty will deploy new contract):`).trim();
    let originTokenInfo = {
      address:"",
      name:"",
      symbol:"",
      decimals:0,
      nativeCoin:false,
      beginNum:0
    }
    let bridgeWrappedTokenInfo = {
      address:"",
      name:"",
      symbol:"",
      decimals:0,
      beginNum:0
    }

    try {
      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
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
          nativeCoin:false,
          beginNum:0
        }
      } else {
        const name = ReadlineSync.question(`Token name: `).trim();
        const symbol = ReadlineSync.question(`Token symbol: `).trim().toLocaleUpperCase();
        const decimals = Number(ReadlineSync.question(`Token decimals: `).trim());
        originTokenInfo = {
          address:"",
          name:name,
          symbol:symbol,
          decimals:decimals,
          nativeCoin:false,
          beginNum:0
        }
      }
      const nativecoin = ReadlineSync.question(`Is VeChain Native Coin?(y/n)`).trim().toLowerCase();
      originTokenInfo.nativeCoin = nativecoin == "y" ? true : false;
      
      let wname = ReadlineSync.question(`Ethereum Bridge Wrapped Token name (default ${"Bridge Wrapped " + originTokenInfo.name}):`).trim();
      let wsymbol = ReadlineSync.question(`Ethereum Bridge Wrapped Token name (default ${"W" + originTokenInfo.symbol.substring(1)}):`).trim();

      bridgeWrappedTokenInfo = {
        address:"",
        name:wname.length > 0 ? wname : "Bridge Wrapped " + originTokenInfo.name,
        symbol:wsymbol.length > 0 ? wsymbol : "W" + originTokenInfo.symbol.substring(1),
        decimals:originTokenInfo.decimals,
        beginNum:0
      }
      console.log(`Origin Token address:${originTokenInfo.address} name:${originTokenInfo.name} symbol:${originTokenInfo.symbol} decimals:${originTokenInfo.decimals} NativeCoin:${originTokenInfo.nativeCoin}`);
      console.log(`Bridge Wrapped address:${bridgeWrappedTokenInfo.address} name:${bridgeWrappedTokenInfo.name} symbol:${bridgeWrappedTokenInfo.symbol} decimals:${bridgeWrappedTokenInfo.decimals}`);

      const next = ReadlineSync.question(`Continue to deploy & register token (y/n)`).trim().toLocaleLowerCase();
      if(next == "n"){
        console.info(`Quit deploy`);
        return;
      }

      if(originTokenInfo.address == ""){
        console.log(`Deploy ${originTokenInfo.symbol} token to VeChain.`);
        const clause1 = fTokenContract.deploy(0,originTokenInfo.name,originTokenInfo.symbol,originTokenInfo.decimals);
        const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx',[clause1])
          .signer((this.environment.wallet as SimpleWallet).list[0].address)
          .request();
        const receipt1 = await getReceipt(this.environment.connex, 5, txrep1.txid);
        if(receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined){
          console.error(`Deploy token faild.`);
          return;
        }
        originTokenInfo.address = receipt1.outputs[0].contractAddress;
      }

      console.log(`Deploy ${bridgeWrappedTokenInfo.symbol} token to Ethereum`);
      const deployMethod = wTokenContract.deploy({data:wTokenBin,arguments:[bridgeWrappedTokenInfo.name,bridgeWrappedTokenInfo.symbol,bridgeWrappedTokenInfo.decimals,this.environment.config.ethereum.contracts.e2vBridge]});
      const deployGas = await deployMethod.estimateGas({
        from:(this.environment.wallet as SimpleWallet).list[0].address
      });
      wTokenContract = await deployMethod.send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
        gas:deployGas,
        gasPrice:gasPrice
      });
      bridgeWrappedTokenInfo.address = wTokenContract.options.address;

      console.log(`Register ${originTokenInfo.symbol} to VeChain bridge`);
      const vbestBlock = (this.environment.connex as Framework).thor.status.head.number;
      let clause2;
      if(originTokenInfo.nativeCoin == true){
        clause2 = (this.environment.contract.vechain.bridgeContract as Contract).send("setWrappedNativeCoin",0,originTokenInfo.address,bridgeWrappedTokenInfo.address,vbestBlock,0);
      } else {
        clause2 = (this.environment.contract.vechain.bridgeContract as Contract).send("setToken",0,originTokenInfo.address,1,bridgeWrappedTokenInfo.address,vbestBlock,0);
      }      
      const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx',[clause2])
          .signer((this.environment.wallet as SimpleWallet).list[0].address)
          .request();
      const receipt2 = await getReceipt(this.environment.connex, 5, txrep2.txid);
      if(receipt2 == null || receipt2.reverted){
        console.error(`Register token faild. txid: ${txrep2.txid}`);
        return;
      }

      console.log(`Register ${bridgeWrappedTokenInfo.symbol} token to Ethereum`);
      const eBestBlock = (await (this.environment.web3 as Web3).eth.getBlock('latest')).number;

      const setMethod = (this.environment.contract.ethereum.bridgeContract as EthContract).methods.setToken(bridgeWrappedTokenInfo.address,2,originTokenInfo.address,eBestBlock,0);
      const setGas = await setMethod.estimateGas({
        from:(this.environment.wallet as SimpleWallet).list[0].address
      });
      wTokenContract = await setMethod.send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
        gas:setGas,
        gasPrice:gasPrice
      });

      console.log(`${originTokenInfo.symbol} address: ${originTokenInfo.address}`);
      console.log(`${bridgeWrappedTokenInfo.symbol} address: ${bridgeWrappedTokenInfo.address}`);
    } catch (error) {
      console.error(`deploy & register token faild, error: ${error}`);
    }
  }

  private async deployTokenToEthereum():Promise<any>{
    const fTokenFilePath = path.join(this.environment.contractdir, "/common/Contract_FungibleToken.sol");
    const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
    const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
    let fTokenContract = new (this.environment.web3 as Web3).eth.Contract(fTokenAbi);

    const wTokenFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeWrappedToken.sol");
    const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
    const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
    let wTokenContract = new Contract({ abi: wTokenAbi, connex: this.environment.connex, bytecode: wTokenBin });

    console.log(`Deploy and register token to Ethereum`);
    const value = ReadlineSync.question(`Enter exists token address (empty will deploy new contract):`).trim();
    let originTokenInfo = {
      address:"",
      name:"",
      symbol:"",
      decimals:0,
      nativeCoin:false,
      beginNum:0
    }
    let bridgeWrappedTokenInfo = {
      address:"",
      name:"",
      symbol:"",
      decimals:0,
      beginNum:0
    }

    try {
      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
      if(value.length == 42){
        fTokenContract.options.address = value;
        const name = String((await fTokenContract.methods.name().call()));
        const symbol = String((await fTokenContract.methods.symbol().call())).toLocaleUpperCase();
        const decimals = Number((await fTokenContract.methods.decimals().call()));
        originTokenInfo = {
          address:value,
          name:name,
          symbol:symbol,
          decimals:decimals,
          nativeCoin:false,
          beginNum:0
        }
      } else {
        const name = ReadlineSync.question(`Token name: `).trim();
        const symbol = ReadlineSync.question(`Token symbol: `).trim().toLocaleUpperCase();
        const decimals = Number(ReadlineSync.question(`Token decimals: `).trim());
        originTokenInfo = {
          address:"",
          name:name,
          symbol:symbol,
          decimals:decimals,
          nativeCoin:false,
          beginNum:0
        }
      }
      const nativecoin = ReadlineSync.question(`Is Ethereum Native Coin?(y/n)`).trim().toLowerCase();
      originTokenInfo.nativeCoin = nativecoin == "y" ? true : false;

      let wname = ReadlineSync.question(`VeChain Bridge Wrapped Token name (default ${"Bridge Wrapped " + originTokenInfo.name}):`).trim();
      let wsymbol = ReadlineSync.question(`VeChain Bridge Wrapped Token name (default ${"V" + originTokenInfo.symbol.substring(1)}):`).trim();

      bridgeWrappedTokenInfo = {
        address:"",
        name:wname.length > 0 ? wname : "Bridge Wrapped " + originTokenInfo.name,
        symbol:wsymbol.length > 0 ? wsymbol : "V" + originTokenInfo.symbol.substring(1),
        decimals:originTokenInfo.decimals,
        beginNum:0
      }

      console.log(`Origin Token address:${originTokenInfo.address} name:${originTokenInfo.name} symbol:${originTokenInfo.symbol} decimals:${originTokenInfo.decimals} NativeCoin:${originTokenInfo.nativeCoin}`);
      console.log(`Bridge Wrapped address:${bridgeWrappedTokenInfo.address} name:${bridgeWrappedTokenInfo.name} symbol:${bridgeWrappedTokenInfo.symbol} decimals:${bridgeWrappedTokenInfo.decimals}`);

      const next = ReadlineSync.question(`Continue to deploy & register token (y/n)`).trim().toLocaleLowerCase();
      if(next == "n"){
        console.info(`Quit deploy`);
        return;
      }

      if(originTokenInfo.address == ""){
        console.log(`Deploy ${originTokenInfo.symbol} token to Ethereum.`);
        const gas1 = await fTokenContract.deploy({data:fTokenBin,arguments:[originTokenInfo.name,originTokenInfo.symbol,originTokenInfo.decimals]})
          .estimateGas({
            from:(this.environment.wallet as SimpleWallet).list[0].address
        });
        fTokenContract = await fTokenContract.deploy({data:fTokenBin,arguments:[originTokenInfo.name,originTokenInfo.symbol,originTokenInfo.decimals]})
          .send({
            from:(this.environment.wallet as SimpleWallet).list[0].address,
            gas:gas1,
            gasPrice:gasPrice
        }).on("receipt",function(receipt){
          originTokenInfo.address = receipt.contractAddress!;
        });
      }
      console.log(`Deploy ${bridgeWrappedTokenInfo.symbol} token to VeChain`);
      const clause1 = wTokenContract.deploy(0,bridgeWrappedTokenInfo.name,bridgeWrappedTokenInfo.symbol,bridgeWrappedTokenInfo.decimals,this.environment.config.vechain.contracts.v2eBridge);
      const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx',[clause1])
        .signer((this.environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt1 = await getReceipt(this.environment.connex,5,txrep1.txid);
      if(receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined){
        console.error(`Deploy token faild. txid: ${txrep1.txid}`);
        return;
      }
      bridgeWrappedTokenInfo.address = receipt1.outputs[0].contractAddress;

      console.log(`Register ${originTokenInfo.symbol} to Ethereum bridge`);
      const eBestBlock = (await (this.environment.web3 as Web3).eth.getBlock('latest')).number;
      let setMethod;
      let setGas;
      if(originTokenInfo.nativeCoin == true){
        setMethod = (this.environment.contract.ethereum.bridgeContract as EthContract).methods.setWrappedNativeCoin(originTokenInfo.address,bridgeWrappedTokenInfo.address,eBestBlock,0);
        setGas = await setMethod.estimateGas({
          from:(this.environment.wallet as SimpleWallet).list[0].address
        });
      } else {
        setMethod = (this.environment.contract.ethereum.bridgeContract as EthContract).methods.setToken(originTokenInfo.address,1,bridgeWrappedTokenInfo.address,eBestBlock,0);
        setGas = await setMethod.estimateGas({
          from:(this.environment.wallet as SimpleWallet).list[0].address
        });
      }

      wTokenContract = await setMethod.send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
        gas:setGas,
        gasPrice:gasPrice
      });

      console.log(`Register ${bridgeWrappedTokenInfo.symbol} to VeChain bridge`);
      const vbestBlock = (this.environment.connex as Framework).thor.status.head.number;
      const clause2 = (this.environment.contract.vechain.bridgeContract as Contract).send("setToken",0,bridgeWrappedTokenInfo.address,2,originTokenInfo.address,vbestBlock,0);
      const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx',[clause2])
      .signer((this.environment.wallet as SimpleWallet).list[0].address)
      .request();
      const receipt2 = await getReceipt(this.environment.connex,5,txrep2.txid);
      if(receipt2 == null || receipt2.reverted){
        console.error(`Register token faild. txid: ${txrep2.txid}`);
        return;
      }

      console.log(`${originTokenInfo.symbol} address: ${originTokenInfo.address}`);
      console.log(`${bridgeWrappedTokenInfo.symbol} address: ${bridgeWrappedTokenInfo.address}`);
    } catch (error) {
      console.error(`Deploy & register token faild, error: ${error}`);
    }
  }

  private async addVerifier():Promise<any>{
    try {
      await this.initVeChainVerifier();
      await this.initEthereumVerifier();

      const verifier = ReadlineSync.question(`Add new verifier address to contract:`).trim();
      
      console.log(`Add new verifier ${verifier} to VeChain bridge`);
      const clause = await this.environment.contract.vechain.bridgeVerifier.send('addVerifier',0,verifier);
      const txRep = await this.environment.connex.vendor.sign('tx',[clause])
                .signer((this.environment.wallet as SimpleWallet).list[0].address)
                .request();
      const receipt = await getReceipt(this.environment.connex,5,txRep.txid);
      if(receipt == null || receipt.reverted){
        console.error(`Add new verifier to contract faild. txid: ${txRep.txid}`);
        return;
      }

      console.log(`Add new verifier ${verifier} to Ethereum bridge`);
      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
      const gas = await this.environment.contract.ethereum.bridgeVerifier.methods.addVerifier(verifier).estimateGas({
        from:(this.environment.wallet as SimpleWallet).list[0].address
      });

      await this.environment.contract.ethereum.bridgeVerifier.methods.addVerifier(verifier).send({
        from:(this.environment.wallet as SimpleWallet).list[0].address,
        gas:gas,
        gasPrice: gasPrice
      });

    } catch (error) {
      console.error(`Deploy Token faild. error:${error}`);
      return;
    }
  }

  private async initVeChainBridge():Promise<any>{
    const bridgeFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));
    let bridgeContract = new Contract({ abi: bridgeAbi, connex: this.environment.connex});

    if(this.environment.contract.vechain.bridgeContract == undefined){
      if(this.environment.config.vechain.contracts.v2eBridge != undefined && this.environment.config.vechain.contracts.v2eBridge.length == 42){
        bridgeContract.at(this.environment.config.vechain.contracts.v2eBridge);
      } else {
        const bridgeAddr = ReadlineSync.question(`Set VeChain BridgeHead Address:`).trim();
        bridgeContract.at(bridgeAddr);
      }
      this.environment.contract.vechain.bridgeContract = bridgeContract;
    }
  }

  private async initEthereumBridge():Promise<any>{
    const bridgeFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeHead.sol");
    const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));
    let bridgeContract = new (this.environment.web3 as Web3).eth.Contract(bridgeAbi);

    if(this.environment.contract.ethereum.bridgeContract == undefined){
      if(this.environment.config.ethereum.contracts.e2vBridge != undefined && this.environment.config.ethereum.contracts.e2vBridge.length == 42){
        bridgeContract.options.address = this.environment.config.vechain.contracts.e2vBridge;
      } else {
        const bridgeAddr = ReadlineSync.question(`Set Ethereum BridgeHead Address:`).trim();
        bridgeContract.options.address = bridgeAddr
      }
      this.environment.contract.ethereum.bridgeContract = bridgeContract;
    }
  }

  private async initVeChainVerifier():Promise<any>{
    const vBridgeVerifierPath = path.join(this.environment.contractdir, "/vechainthor/Contract_V2EBridgeVerifier.sol");
    const vBridgeVerifierAbi = JSON.parse(compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'abi',[this.environment.contractdir]));
    let bridgeVerifier = new Contract({ abi: vBridgeVerifierAbi, connex: this.environment.connex});

    let env = this.environment;

    if(this.environment.contract.vechain.bridgeVerifier == undefined){
      if(this.environment.config.vechain.contracts != undefined && this.environment.config.vechain.contracts.v2eBridgeVerifier != undefined && this.environment.config.vechain.contracts.v2eBridgeVerifier.length == 42){
        bridgeVerifier.at(this.environment.config.vechain.contracts.v2eBridgeVerifier);
      } else {
        const verifierAddr = ReadlineSync.question(`Set V2EBridgeVerifier Address:`).trim();
        this.environment.config.vechain.contracts = {};
        this.environment.config.vechain.contracts.v2eBridgeVerifier = verifierAddr;
        bridgeVerifier.at(verifierAddr);
      }
      this.environment.contract.vechain.bridgeVerifier = bridgeVerifier;
    }
  }

  private async initEthereumVerifier():Promise<any>{
    const eBridgeVerifierPath = path.join(this.environment.contractdir, "/ethereum/Contract_E2VBridgeVerifier.sol");
    const eBridgeVerifierAbi = JSON.parse(compileContract(eBridgeVerifierPath,"E2VBridgeVerifier","abi",[this.environment.contractdir]));
    let bridgeVerifier = new (this.environment.web3 as Web3).eth.Contract(eBridgeVerifierAbi);

    if(this.environment.contract.ethereum.bridgeVerifier == undefined){
      if(this.environment.config.ethereum.contracts != undefined && this.environment.config.ethereum.contracts.e2vBridgeVerifier != undefined && this.environment.config.ethereum.contracts.e2vBridgeVerifier.length == 42){
        bridgeVerifier.options.address = this.environment.config.ethereum.contracts.e2vBridgeVerifier;
      } else {
        const verifierAddr = ReadlineSync.question(`Set E2VBridgeVerifier Address:`).trim();
        this.environment.config.ethereum.contracts = {};
        this.environment.config.ethereum.contracts.e2vBridgeVerifier = verifierAddr;
        bridgeVerifier.options.address = verifierAddr;

      }
      this.environment.contract.ethereum.bridgeVerifier = bridgeVerifier;
    }
  }
}
