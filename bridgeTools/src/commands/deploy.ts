import {Command, flags} from '@oclif/command';
import { Contract as VContract } from 'myvetools';
import {Contract as EContract,ContractSendMethod} from 'web3-eth-contract';
const path = require('path');
import * as fileIO from 'fs';
import * as ReadlineSync from 'readline-sync';
import { address, Keystore, secp256k1 } from 'thor-devkit';
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import Web3 from 'web3';
import { compileContract } from 'myvetools/dist/utils';
import { getReceipt } from 'myvetools/dist/connexUtils';

export default class Deploy extends Command {
      static description = '';

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
        console.info("******************** VeChain Asset Bridge Tools Info ********************");
        console.info(`| VeChain ChainId Info    | ${this.environment.config.vechain.chainName} ${this.environment.config.vechain.chainId} ${this.environment.config.vechain.nodeHost}`);
        console.info(`| Ethereum ChainId Info   | ${this.environment.config.ethereum.chainName}  ${this.environment.config.ethereum.chainId}  ${this.environment.config.ethereum.nodeHost}`);
        console.info(`| Node Key Address        | ${this.environment.master}`);

        while(true){
            const operations = ["Deploy VeChain Bridge & Validator Contract","Deploy Ethereum Bridge & Validator Contract","Deploy and register token to bridge","Add Validator"];
            const index = ReadlineSync.keyInSelect(operations,"Which Operation?");
            switch(index){
                case -1:
                    console.info("Quit Bridge Tools");
                    process.exit();
                case 0:
                    await this.deployVeChainBridge();
                break;
                case 1:
                    await this.deployEthereumBridge();
                break;
                case 2:
                    await this.deployToken();
                break;
                case 3:
                    await this.addValidator();
                break;
                default:
                    console.error(`Invalid operation.`);
                break;
            }
        }
    }

    private async initConfig(flags:any):Promise<any> {
        this.environment.contractdir = path.join(__dirname,"../common/contracts/");
        this.environment.configPath = path.join(__dirname,"../../config/config_tools.json");
        this.environment.config = {};
        this.environment.contract = {vechain:{},ethereum:{}};

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
        await this.initConnex();
        await this.initWeb3();
    }

    private async initConnex():Promise<any>{
        try {
          let host = "";
          if(this.environment.config.vechain.nodeHost != undefined || ""){
            host = this.environment.config.vechain.nodeHost;
          } else {
            host = ReadlineSync.question(`VeChain Node Host:`);
          }
          const wallet  = new SimpleWallet();
          wallet.import(this.environment.prieky);
          this.environment.wallet = wallet;
          const driver = await Driver.connect(new SimpleNet(host),this.environment.wallet);
          this.environment.connex = new Framework(driver);
          const chainId = '0x' + this.environment.connex.thor.genesis.id.substring(64);
          this.environment.config.vechain.nodeHost = host;
          this.environment.config.vechain.chainName = "vechain";
          this.environment.config.vechain.chainId = chainId;
          this.environment.config.vechain.confirmHeight = this.environment.config.vechain.confirmHeight ? this.environment.config.vechain.confirmHeight : 3;
          this.environment.config.vechain.expiration = this.environment.config.vechain.expiration ? this.environment.config.vechain.expiration : 180;
        } catch (error) {
          console.error(`Connect VeChain Node Faild. error:${error}`);
          process.exit();
        }
      }
    
    private async initWeb3():Promise<any>{
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
        this.environment.config.ethereum.nodeHost = ethereumHost;
        this.environment.config.ethereum.chainName = "ethereum";
        this.environment.config.ethereum.chainId = chainId.toString();
        this.environment.config.ethereum.confirmHeight = this.environment.config.confirmHeight ? this.environment.config.confirmHeight : 3;
        this.environment.config.ethereum.expiration = this.environment.config.expiration ? this.environment.config.expiration : 24;
    } catch (error) {
        console.error(`Connect Ethereum Node Faild. error:${error}`);
        process.exit();
    }
    }

    private async initContracts():Promise<any>{
        this.environment.contracts = {vechain:{},ethereum:{}};

        const bridgeFilePath = path.join(this.environment.contractdir, "/common/Contract_FTokenBridge.sol");
        const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'FTokenBridge', 'abi'));
        const bridgeBin = compileContract(bridgeFilePath, 'FTokenBridge', 'bytecode');

        const ftokenStoragePath = path.join(this.environment.contractdir,"/common/Contract_FTokenStorage.sol");
        const ftokenStorageAbi = JSON.parse(compileContract(ftokenStoragePath, 'FTokenStorage', 'abi'));
        const bridgeStorageBin = compileContract(ftokenStoragePath, 'FTokenStorage', 'bytecode');

        const vBridgeValidatorPath = path.join(this.environment.contractdir, "/vechain/Contract_VeChainBridgeValidator.sol");
        const vBridgeValidatorAbi = JSON.parse(compileContract(vBridgeValidatorPath, 'VeChainBridgeValidator', 'abi',[this.environment.contractdir]));
        const vBridgeValidatorBin = compileContract(vBridgeValidatorPath, 'VeChainBridgeValidator', 'bytecode',[this.environment.contractdir]);

        const eBridgeValidatorPath = path.join(this.environment.contractdir, "/ethereum/Contract_EthereumBridgeValidator.sol");
        const eBridgeValidatorAbi = JSON.parse(compileContract(eBridgeValidatorPath,"EthereumBridgeValidator","abi",[this.environment.contractdir]));
        const eBridgeValidatorBin = compileContract(eBridgeValidatorPath, 'EthereumBridgeValidator', 'bytecode',[this.environment.contractdir]);

        this.environment.contracts.vechain.bridgeContract = new VContract({ abi: bridgeAbi, connex: this.environment.connex,bytecode:bridgeBin});
        this.environment.contracts.ethereum.bridgeContract = new (this.environment.web3 as Web3).eth.Contract(bridgeAbi,undefined,{data:bridgeBin});

        this.environment.contracts.vechain.validatorContract = new VContract({ abi: vBridgeValidatorAbi, connex: this.environment.connex,bytecode:vBridgeValidatorBin});
        this.environment.contracts.ethereum.validatorContract = new (this.environment.web3 as Web3).eth.Contract(eBridgeValidatorAbi,undefined,{data:eBridgeValidatorBin});

        this.environment.contracts.vechain.ftokenStorageContract = new VContract({ abi: ftokenStorageAbi, connex: this.environment.connex,bytecode:bridgeStorageBin});
        this.environment.contracts.ethereum.ftokenStorageContract =  new (this.environment.web3 as Web3).eth.Contract(ftokenStorageAbi,undefined,{data:bridgeStorageBin});

        if(this.environment.config.vechain?.contracts?.v2eBridge != undefined && this.environment.config.vechain?.contracts?.v2eBridge.length == 42){
            (this.environment.contracts.vechain.bridgeContract as VContract).at(this.environment.config.vechain?.contracts?.v2eBridge);
        }
        if(this.environment.config.ethereum?.contracts?.e2vBridge != undefined && this.environment.config.ethereum?.contracts?.e2vBridge.length == 42){
            (this.environment.contracts.ethereum.bridgeContract as EContract).options.address = this.environment.config.ethereum?.contracts?.e2vBridge;
        }
        if(this.environment.config.vechain?.contracts?.v2eBridgeValidator != undefined && this.environment.config.vechain?.contracts?.v2eBridgeValidator.length == 42){
            (this.environment.contracts.vechain.validatorContract as VContract).at(this.environment.config.vechain?.contracts?.v2eBridgeValidator);
        }
        if(this.environment.config.ethereum?.contracts?.e2vBridgeValidator != undefined && this.environment.config.ethereum?.contracts?.e2vBridgeValidator.length == 42){
            (this.environment.contracts.ethereum.validatorContract as EContract).options.address = this.environment.config.ethereum?.contracts?.e2vBridgeValidator;
        }
    }

    private async deployVeChainBridge():Promise<any>{
        try {
            let bridgeContract = this.environment.contracts.vechain.bridgeContract as VContract;
            let validatorContract = this.environment.contracts.vechain.validatorContract as VContract;
            let ftokenStorageContract = this.environment.contracts.vechain.ftokenStorageContract as VContract;

            console.info(`--> deploy vechain bridge contract.`);
            const chainName = String(this.environment.config.vechain.chainName);
            const chainId = String(this.environment.config.vechain.chainId);
            const clause1 = bridgeContract.deploy(0,chainName,chainId);
            const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx',[clause1])
                .signer(this.environment.master)
                .request();
            const receipt1 = await getReceipt(this.environment.connex,6,txrep1.txid);
            if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
                console.error(`Deploy vechain bridge faild, txid: ${receipt1.meta.txID}`);
                process.exit();
            }
            bridgeContract.at(receipt1.outputs[0].contractAddress);
            this.environment.config.vechain.contracts.v2eBridge = bridgeContract.address;
            this.environment.config.vechain.startBlockNum = receipt1.meta.blockNumber;

            console.info(`--> deploy vechain bridge validator contract.`);
            const clause2 = validatorContract.deploy(0);
            const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx',[clause2])
            .signer(this.environment.master)
            .request();
            const receipt2 = await getReceipt(this.environment.connex,6,txrep2.txid);
            if (receipt2 == null || receipt2.reverted || receipt2.outputs[0].contractAddress == undefined) {
                console.error('Deploy vechain validator contract faild');
                process.exit();
            }
            validatorContract.at(receipt2.outputs[0].contractAddress);
            this.environment.config.vechain.contracts.v2eBridgeValidator = validatorContract.address;

            console.info(`--> set validator contract address.`);
            const clause3 = bridgeContract.send("setValidator",0,validatorContract.address);
            const txrep3 = await (this.environment.connex as Framework).vendor.sign('tx',[clause3])
                .signer(this.environment.master)
                .request();
            const receipt3 = await getReceipt(this.environment.connex,6,txrep3.txid);
            if (receipt3 == null || receipt3.reverted) {
                console.error('Set validator contract address faild');
                process.exit();
            }

            console.info(`--> set bridge address.`);
            const clause4 = validatorContract.send("setBridge",0,bridgeContract.address);
            const txrep4 = await (this.environment.connex as Framework).vendor.sign('tx',[clause4])
                .signer(this.environment.master)
                .request();
            const receipt4 = await getReceipt(this.environment.connex,6,txrep4.txid);
            if (receipt4 == null || receipt4.reverted) {
                console.error('set bridge address faild');
                process.exit();
            }

            console.info(`--> deploy vechain bridge ftoken storage contract.`);
            const clause5 = ftokenStorageContract.deploy(0,this.environment.config.vechain.contracts.v2eBridge);
            const txrep5 = await (this.environment.connex as Framework).vendor.sign('tx',[clause5])
                .signer(this.environment.master)
                .request();
            const receipt5 = await getReceipt(this.environment.connex,6,txrep5.txid);
            if (receipt5 == null || receipt5.reverted || receipt5.outputs[0].contractAddress == undefined) {
                console.error(`Deploy vechain bridge ftoken storage faild, txid: ${receipt5.meta.txID}`);
                process.exit();
            }

            const clause6 =  bridgeContract.send("setTokenStorage",0,receipt5.outputs[0].contractAddress);
            const txrep6 = await (this.environment.connex as Framework).vendor.sign('tx',[clause6])
                .signer(this.environment.master)
                .request();
            const receipt6 = await getReceipt(this.environment.connex,6,txrep6.txid);
            if (receipt6 == null || receipt6.reverted) {
                console.error(`Deploy vechain bridge set ftoken storage faild, txid: ${receipt6.meta.txID}`);
                process.exit();
            }

            fileIO.writeFileSync(this.environment.configPath, JSON.stringify(this.environment.config));

            console.info(`VeChain contracts deploy finish`);
            console.info(`VeChain bridge: ${bridgeContract.address} blockNum: ${receipt1.meta.blockNumber} deployTx: ${receipt1.meta.txID}`);
            console.info(`VeChain validator: ${validatorContract.address} blockNum: ${receipt2.meta.blockNumber} deployTx: ${receipt2.meta.txID}`);
        } catch (error) {
            console.error(`Deploy VeChain bridge & validator contracts faild. error: ${error}`);
            process.exit();
        }
    }

    private async deployEthereumBridge():Promise<any>{
      try {
        //get Gas Price
        const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();

        let bridgeContract = this.environment.contracts.ethereum.bridgeContract as EContract;
        let validatorContract = this.environment.contracts.ethereum.validatorContract as EContract;
        let ftokenStorageContract = this.environment.contracts.ethereum.ftokenStorageContract as EContract;

        console.log(`--> deploy ethereum bridge contract.`);
        const chainName = String(this.environment.config.ethereum.chainName);
        const chainId = String(this.environment.config.ethereum.chainId);

        let bridgeMeta:any = {};
        const deployBridgeMethod = bridgeContract.deploy({data:bridgeContract.options.data!,arguments:[chainName,chainId]});
        const deployBridgeGas = await deployBridgeMethod.estimateGas({
          from:this.environment.master
        });
        bridgeContract = await deployBridgeMethod.send({
          from:this.environment.master,
          gas:deployBridgeGas,
          gasPrice:gasPrice
        }).on("receipt",(receipt) => {
          bridgeMeta = {
            deploy:{
              blockNum:receipt.blockNumber,
              deployTx:receipt.transactionHash
            }
          }
        });

        console.info(`--> deploy ethereum bridge validator contract.`);
        let validatorMeta:any = {};
        const deployValidatorMethod = validatorContract.deploy({data:validatorContract.options.data!});
        const deployValidatorGas = await deployValidatorMethod.estimateGas({
          from:this.environment.master
        });
        validatorContract = await deployValidatorMethod.send({
          from:this.environment.master,
          gas:deployValidatorGas,
          gasPrice:gasPrice
        }).on("receipt",(receipt) => {
          validatorMeta = {
            deploy:{
              blockNum:receipt.blockNumber,
              deployTx:receipt.transactionHash
            }
          }
        });
        this.environment.config.ethereum.contracts.e2vBridge = bridgeContract.options.address;
        this.environment.config.ethereum.startBlockNum = bridgeMeta.deploy.blockNum;
        (this.environment.contracts.ethereum.bridgeContract as EContract).options.address = bridgeContract.options.address;

        console.info(`--> set validator address.`);
        const setValidatorMethod = bridgeContract.methods.setValidator(validatorContract.options.address) as ContractSendMethod;
        const setValidatorGas = await setValidatorMethod.estimateGas({
          from:this.environment.master
        });
        await setValidatorMethod.send({
          from:this.environment.master,
          gas:setValidatorGas,
          gasPrice:gasPrice
        });

        console.info(`--> set bridge address`);
        const setBridgeMethod = validatorContract.methods.setBridge(bridgeContract.options.address) as ContractSendMethod;
        const setBridgeGas = await setBridgeMethod.estimateGas({
          from:this.environment.master
        });
        await setBridgeMethod.send({
          from:this.environment.master,
          gas:setBridgeGas,
          gasPrice:gasPrice
        });
        this.environment.config.ethereum.contracts.e2vBridgeValidator = validatorContract.options.address;
        (this.environment.contracts.ethereum.validatorContract as EContract).options.address = validatorContract.options.address;

        console.info(`--> deploy ethereum bridge ftoken storage contract.`);
        let storageMeta:any = {};
        const deployStorageMethod = ftokenStorageContract.deploy({data:ftokenStorageContract.options.data!,arguments:[bridgeContract.options.address]});
        const deployStorageGas = await deployStorageMethod.estimateGas({
          from:this.environment.master
        });
        ftokenStorageContract = await deployStorageMethod.send({
          from:this.environment.master,
          gas:deployStorageGas,
          gasPrice:gasPrice
        }).on("receipt",(receipt) => {
          storageMeta = {
            deploy:{
              blockNum:receipt.blockNumber,
              deployTx:receipt.transactionHash
            }
          }
        });

        const setStorageMethod = bridgeContract.methods.setTokenStorage(ftokenStorageContract.options.address) as ContractSendMethod;
        const setStorageGas = await setStorageMethod.estimateGas({
          from:this.environment.master
        });
        await setStorageMethod.send({
          from:this.environment.master,
          gas:setStorageGas,
          gasPrice:gasPrice
        });
        
        fileIO.writeFileSync(this.environment.configPath, JSON.stringify(this.environment.config));

        console.info(`Ethereum contracts deploy finish`);
        console.info(`Ethereum bridge: ${bridgeContract.options.address} blockNum: ${bridgeMeta.deploy.blockNum} deployTx: ${bridgeMeta.deploy.deployTx}`);
        console.info(`Ethereum validator: ${validatorContract.options.address} blockNum: ${validatorMeta.deploy.blockNum} deployTx: ${validatorMeta.deploy.deployTx}`);
      } catch (error) {
        console.error(`Deploy Ethereum bridge & validator faild. error: ${error}`);
        process.exit();
      }
    }

    private async deployToken():Promise<any>{
      try {
        const networks = ["vechain","ethereum"];
        const index = ReadlineSync.keyInSelect(networks,"Which Operation?");
        switch(index){
          case 0:
            await this.initVeChainBridge();
            await this.deployTokenToVeChain();
            break;
          case 1:
            await this.initEthereumBridge();
            await this.deployTokenToEthereum();
            break;
          default:
            return;
        }
      } catch (error) {
        console.error(`Deploy Token faild. error:${error}`);
        process.exit();
      }
    }

    private async initVeChainBridge():Promise<any>{
      let bridgeContract = this.environment.contracts.vechain.bridgeContract as VContract;
      if(bridgeContract.address == ""){
        if(this.environment.config.vechain?.contracts?.v2eBridge != undefined && this.environment.config.vechain?.contracts?.v2eBridge.length == 42){
          bridgeContract.at(this.environment.config.vechain?.contracts?.v2eBridge);
        } else {
          const addr = ReadlineSync.question(`Set VeChain bridgehead address:`).trim();
          bridgeContract.at(addr);
        }
      }
    }

    private async initEthereumBridge():Promise<any>{
      let bridgeContract = this.environment.contracts.ethereum.bridgeContract as EContract;
      if(bridgeContract.options.address == undefined || bridgeContract.options.address == ""){
        if(this.environment.config.ethereum?.contracts?.v2eBridge != undefined && this.environment.config.ethereum?.contracts?.v2eBridge.length == 42){
          bridgeContract.options.address = this.environment.config.ethereum?.contracts?.v2eBridge;
        } else {
          const addr = ReadlineSync.question(`Set Ethereum bridgehead address:`).trim();
          bridgeContract.options.address = addr;
        }
      }
    }

    private async initVeChainValidator():Promise<any>{
      let validatorContract = this.environment.contracts.vechain.validatorContract as VContract;
      if(validatorContract.address == ""){
        if(this.environment.config.vechain?.contracts?.v2eBridgeValiator != undefined || ""){
          validatorContract.at(this.environment.config.vechain?.contracts?.v2eBridgeValiator);
        } else {
          const addr = ReadlineSync.question(`Set VeChain bridge valiator address:`).trim();
          validatorContract.at(addr);
        }
      }
    }

    private async initEthereumValiator():Promise<any>{
      let validatorContract = this.environment.contracts.ethereum.validatorContract as EContract;
      if(validatorContract.options.address == ""){
        if(this.environment.config.ethereum?.contracts?.e2vBridgeValidator != undefined || ""){
          validatorContract.options.address = this.environment.config.ethereum?.contracts?.e2vBridgeValidator;
        } else {
          const addr = ReadlineSync.question(`Set Ethereum bridge validator address:`).trim();
          validatorContract.options.address = addr;
        }
      }
    }

    private async deployTokenToVeChain():Promise<any>{
      const fTokenFilePath = path.join(this.environment.contractdir, "/common/Contract_FungibleToken.sol");
      const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
      const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
      let fTokenContract = new VContract({ abi: fTokenAbi, connex: this.environment.connex, bytecode: fTokenBin });
  
      const wTokenFilePath = path.join(this.environment.contractdir, "/common/Contract_BridgeWrappedToken.sol");
      const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
      const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
      let wTokenContract = new (this.environment.web3 as Web3).eth.Contract(wTokenAbi,undefined,{data:wTokenBin});
  
      console.info(`Deploy and register token to VeChain`);
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
        const nativecoin = ReadlineSync.question(`Is VeChain native coin?(y/n)`).trim().toLowerCase();
        originTokenInfo.nativeCoin = nativecoin == "y" ? true : false;
        
        let wname = ReadlineSync.question(`Ethereum bridge wrapped token name (default ${"Bridge Wrapped " + originTokenInfo.name}):`).trim();
        let wsymbol = ReadlineSync.question(`Ethereum bridge wrapped token symbol (default ${"W" + originTokenInfo.symbol.substring(1)}):`).trim();
  
        bridgeWrappedTokenInfo = {
          address:"",
          name:wname.length > 0 ? wname : "Bridge Wrapped " + originTokenInfo.name,
          symbol:wsymbol.length > 0 ? wsymbol : "W" + originTokenInfo.symbol.substring(1),
          decimals:originTokenInfo.decimals,
          beginNum:0
        }

        console.info(`\r\nOrigin Token Info:`);
        console.info(`address: ${originTokenInfo.address}`);
        console.info(`name: ${originTokenInfo.name} symbol: ${originTokenInfo.symbol} decimals: ${originTokenInfo.decimals}`);

        console.info(`\r\nBridge Wrapped Token Info:`);
        console.info(`address: ${bridgeWrappedTokenInfo.address}`);
        console.info(`name: ${bridgeWrappedTokenInfo.name} symbol: ${bridgeWrappedTokenInfo.symbol} decimals: ${bridgeWrappedTokenInfo.decimals}`);
  
        const next = ReadlineSync.question(`Continue to deploy & register the token (y/n)`).trim().toLocaleLowerCase();
        if(next == "n"){
          console.info(`Quit deploy`);
          return;
        }
  
        if(originTokenInfo.address == ""){
          console.info(`--> deploy ${originTokenInfo.symbol} token to VeChain.`);
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
  
        console.info(`--> deploy ${bridgeWrappedTokenInfo.symbol} token to Ethereum`);
        const deployMethod = wTokenContract.deploy({data:wTokenBin,arguments:[bridgeWrappedTokenInfo.name,bridgeWrappedTokenInfo.symbol,bridgeWrappedTokenInfo.decimals,this.environment.config.ethereum.contracts.e2vBridge]});
        const deployGas = await deployMethod.estimateGas({
          from:this.environment.master
        });
        wTokenContract = await deployMethod.send({
          from:this.environment.master,
          gas:deployGas,
          gasPrice:gasPrice
        });
        bridgeWrappedTokenInfo.address = wTokenContract.options.address;
  
        console.info(`--> register ${originTokenInfo.symbol} to VeChain bridge`);
        const vbestBlock = (this.environment.connex as Framework).thor.status.head.number;
        let clause2;
        if(originTokenInfo.nativeCoin == true){
          clause2 = (this.environment.contracts.vechain.bridgeContract as VContract).send("setWrappedNativeCoin",0,originTokenInfo.address,bridgeWrappedTokenInfo.address,this.environment.config.ethereum.chainName.toString(),this.environment.config.ethereum.chainId.toString(),vbestBlock,0);
        } else {
          clause2 = (this.environment.contracts.vechain.bridgeContract as VContract).send("setToken",0,originTokenInfo.address,1,bridgeWrappedTokenInfo.address,this.environment.config.ethereum.chainName.toString(),this.environment.config.ethereum.chainId.toString(),vbestBlock,0);
        }      
        const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx',[clause2])
            .signer(this.environment.master)
            .request();
        const receipt2 = await getReceipt(this.environment.connex, 5, txrep2.txid);
        if(receipt2 == null || receipt2.reverted){
          console.error(`Register token faild. txid: ${txrep2.txid}`);
          return;
        }
  
        console.info(`--> register ${bridgeWrappedTokenInfo.symbol} to Ethereum`);
        const eBestBlock = (await (this.environment.web3 as Web3).eth.getBlock('latest')).number;
  
        const setMethod = (this.environment.contracts.ethereum.bridgeContract as EContract).methods.setToken(bridgeWrappedTokenInfo.address,2,originTokenInfo.address,this.environment.config.vechain.chainName.toString(),this.environment.config.vechain.chainId.toString(),eBestBlock,0);
        const setGas = await setMethod.estimateGas({
          from:this.environment.master
        });
        wTokenContract = await setMethod.send({
          from:this.environment.master,
          gas:setGas,
          gasPrice:gasPrice
        });
  
        console.info(`Deploy & register finish.`);
        console.info(`${originTokenInfo.symbol} address: ${originTokenInfo.address}`);
        console.info(`${bridgeWrappedTokenInfo.symbol} address: ${bridgeWrappedTokenInfo.address}`);
      } catch (error) {
        console.error(`deploy & register token faild, error: ${error}`);
        return;
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
      let wTokenContract = new VContract({ abi: wTokenAbi, connex: this.environment.connex, bytecode: wTokenBin });
  
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
  
        let wname = ReadlineSync.question(`Ethereum bridge wrapped token name (default ${"Bridge Wrapped " + originTokenInfo.name}):`).trim();
        let wsymbol = ReadlineSync.question(`Ethereum bridge wrapped token symbol (default ${"V" + originTokenInfo.symbol.substring(1)}):`).trim();
  
        bridgeWrappedTokenInfo = {
          address:"",
          name:wname.length > 0 ? wname : "Bridge Wrapped " + originTokenInfo.name,
          symbol:wsymbol.length > 0 ? wsymbol : "V" + originTokenInfo.symbol.substring(1),
          decimals:originTokenInfo.decimals,
          beginNum:0
        }

        console.info(`\r\nOrigin Token Info:`);
        console.info(`address: ${originTokenInfo.address}`);
        console.info(`name: ${originTokenInfo.name} symbol: ${originTokenInfo.symbol} decimals: ${originTokenInfo.decimals}`);

        console.info(`\r\nBridge Wrapped Token Info:`);
        console.info(`address: ${bridgeWrappedTokenInfo.address}`);
        console.info(`name: ${bridgeWrappedTokenInfo.name} symbol: ${bridgeWrappedTokenInfo.symbol} decimals: ${bridgeWrappedTokenInfo.decimals}`);
  
        const next = ReadlineSync.question(`Continue to deploy & register token (y/n)`).trim().toLocaleLowerCase();
        if(next == "n"){
          console.info(`Quit deploy`);
          return;
        }

  
        if(originTokenInfo.address == ""){
          console.log(`--> deploy ${originTokenInfo.symbol} token to Ethereum.`);
          const deployMethod = fTokenContract.deploy({data:fTokenBin,arguments:[originTokenInfo.name,originTokenInfo.symbol,originTokenInfo.decimals]});
          const deployGas = await deployMethod.estimateGas({
            from:this.environment.master
          });

          fTokenContract = await deployMethod.send({
            from:this.environment.master,
            gas:deployGas,
            gasPrice:gasPrice
          }).on("receipt",(receipt) => {
            originTokenInfo.address = receipt.contractAddress!;
          });
        }
        console.log(`--> deploy ${bridgeWrappedTokenInfo.symbol} token to VeChain`);
        const clause1 = wTokenContract.deploy(0,bridgeWrappedTokenInfo.name,bridgeWrappedTokenInfo.symbol,bridgeWrappedTokenInfo.decimals,this.environment.config.vechain.contracts.v2eBridge);
        const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx',[clause1])
          .signer(this.environment.master)
          .request();
        const receipt1 = await getReceipt(this.environment.connex,5,txrep1.txid);
        if(receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined){
          console.error(`--> deploy token faild. txid: ${txrep1.txid}`);
          return;
        }
        bridgeWrappedTokenInfo.address = receipt1.outputs[0].contractAddress;
  
        console.log(`--> register ${originTokenInfo.symbol} to Ethereum bridge`);
        const eBestBlock = (await (this.environment.web3 as Web3).eth.getBlock('latest')).number;
        let setMethod;
        let setGas;
        if(originTokenInfo.nativeCoin == true){
          setMethod = (this.environment.contracts.ethereum.bridgeContract as EContract).methods.setWrappedNativeCoin(originTokenInfo.address,bridgeWrappedTokenInfo.address,this.environment.config.vechain.chainName.toString(),this.environment.config.vechain.chainId.toString(),eBestBlock,0);
          setGas = await setMethod.estimateGas({
            from:this.environment.master
          });
        } else {
          setMethod = (this.environment.contracts.ethereum.bridgeContract as EContract).methods.setToken(originTokenInfo.address,1,bridgeWrappedTokenInfo.address,this.environment.config.vechain.chainName.toString(),this.environment.config.vechain.chainId.toString(),eBestBlock,0);
          setGas = await setMethod.estimateGas({
            from:this.environment.master
          });
        }
  
        wTokenContract = await setMethod.send({
          from:this.environment.master,
          gas:setGas,
          gasPrice:gasPrice
        });
  
        console.log(`--> register ${bridgeWrappedTokenInfo.symbol} to VeChain bridge`);
        const vbestBlock = (this.environment.connex as Framework).thor.status.head.number;
        const clause2 = (this.environment.contracts.vechain.bridgeContract as VContract).send("setToken",0,bridgeWrappedTokenInfo.address,2,originTokenInfo.address,this.environment.config.ethereum.chainName.toString(),this.environment.config.ethereum.chainId.toString(),vbestBlock,0);
        const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx',[clause2])
        .signer(this.environment.master)
        .request();
        const receipt2 = await getReceipt(this.environment.connex,5,txrep2.txid);
        if(receipt2 == null || receipt2.reverted){
          console.error(`Register token faild. txid: ${txrep2.txid}`);
          return;
        }

        console.info(`Deploy & register finish.`);
        console.info(`${originTokenInfo.symbol} address: ${originTokenInfo.address}`);
        console.info(`${bridgeWrappedTokenInfo.symbol} address: ${bridgeWrappedTokenInfo.address}`);
      } catch (error) {
        console.error(`Deploy & register token faild, error: ${error}`);
        return;
      }
    }

    private async addValidator():Promise<any>{
      try {
        await this.initVeChainValidator();
        await this.initEthereumValiator();
  
        const validator = ReadlineSync.question(`Add new validator address to contract:`).trim();
        
        console.info(`--> register validator ${validator} to VeChain bridge`);
        const clause = await this.environment.contracts.vechain.validatorContract.send('addValidator',0,validator);
        const txRep = await this.environment.connex.vendor.sign('tx',[clause])
                  .signer((this.environment.wallet as SimpleWallet).list[0].address)
                  .request();
        const receipt = await getReceipt(this.environment.connex,5,txRep.txid);
        if(receipt == null || receipt.reverted){
          console.error(`Add new validator to contract faild. txid: ${txRep.txid}`);
          return;
        }
  
        console.info(`--> register validator ${validator} to Ethereum bridge`);
        const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
        const addValidatorMethod = this.environment.contracts.ethereum.validatorContract.methods.addValidator(validator) as ContractSendMethod;
        const gas = await addValidatorMethod.estimateGas({
          from:this.environment.master
        });
        await addValidatorMethod.send({
          from:(this.environment.wallet as SimpleWallet).list[0].address,
          gas:gas,
          gasPrice: gasPrice
        });
        console.info(`Add validator finish`);
  
      } catch (error) {
        console.error(`Deploy Token faild. error:${error}`);
        return;
      }
    }
}