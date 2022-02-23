import { Command, flags } from '@oclif/command';
import { Contract as VContract } from 'myvetools';
import { Contract as EContract, ContractSendMethod } from 'web3-eth-contract';
const path = require('path');
import * as fileIO from 'fs';
import * as ReadlineSync from 'readline-sync';
import { abi, address, Keystore, secp256k1 } from 'thor-devkit';
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import Web3 from 'web3';
import { compileContract } from 'myvetools/dist/utils';
import { getReceipt } from 'myvetools/dist/connexUtils';
var randomBytes = require('randombytes');

export default class Deploy extends Command {
  static description = '';

  static flags = {
    keystore: flags.string(),
    config: flags.string()
  }

  static args = []

  private environment: any = {};

  async run() {
    const { args, flags } = this.parse(Deploy);
    await this.initConfig(flags);
    await this.loadPriKey(flags);
    await this.connNodes();
    await this.initContracts();
    console.info('******************** VeChain Asset Bridge Tools Info ********************');
    console.info(`| VeChain ChainId Info    | ${this.environment.config.vechain.chainName} ${this.environment.config.vechain.chainId} ${this.environment.config.vechain.nodeHost}`);
    console.info(`| Ethereum ChainId Info   | ${this.environment.config.ethereum.chainName}  ${this.environment.config.ethereum.chainId}  ${this.environment.config.ethereum.nodeHost}`);
    console.info(`| Node Key Address        | ${this.environment.master}`);

    while (true) {
      const operations = [
        'Deploy VeChain BridgeCore & Validator Contract',
        'Deploy Ethereum Bridge & Validator Contract',
        'Deploy and register VeChain FTBridge',
        'Deploy and register Ethereum FTBridge',
        'Deploy token',
        'Add Validator'];
      const index = ReadlineSync.keyInSelect(operations, 'Which Operation?');
      switch (index) {
        case -1:
          console.info('Quit Bridge Tools');
          process.exit();
        case 0:
          await this.deployVeChainBridgeCore();
          break;
        case 1:
          await this.deployEthereumBridgeCore();
          break;
        case 2:
          await this.initVeChainBridgeCore();
          await this.initEthereumBridgeCore();
          await this.initAppid();
          await this.deployVeChainFTBridge();
          break;
        case 3:
          await this.initVeChainBridgeCore();
          await this.initEthereumBridgeCore();
          await this.initAppid();
          await this.deployEthereumFTBridge();
          break;
        case 4:
          await this.deployToken();
          break;
        case 5:
          await this.addValidator();
          break;
        default:
          console.error('Invalid operation.');
          break;
      }
    }
  }

  private async initConfig(flags: any): Promise<any> {
    this.environment.contractdir = path.join(__dirname, '../common/contracts/');
    this.environment.configPath = path.join(__dirname, '../../config/config_tools.json');
    this.environment.config = {};
    this.environment.contract = { vechain: {}, ethereum: {} };

    if (flags.config) {
      var configPath = flags.config.trim();
      configPath = configPath.substring(0, 1) == '\'' ? configPath.substring(1) : configPath;
      configPath = configPath.substring(configPath.length - 1, 1) == '\'' ? configPath.substring(0, configPath.length - 1) : configPath;
      if (fileIO.existsSync(configPath)) {
        this.environment.config = require(configPath);
      } else {
        console.error('Read config faild.');
        process.exit();
      }
    } else {
      if (fileIO.existsSync(this.environment.configPath)) {
        this.environment.config = require(this.environment.configPath);
      }
    }
  }

  private async loadPriKey(flags: any): Promise<any> {
    if (flags.keystore) {
      var keystorePath = flags.keystore.trim();
      keystorePath = keystorePath.substring(0, 1) == '\'' ? keystorePath.substring(1) : keystorePath;
      keystorePath = keystorePath.substring(keystorePath.length - 1, 1) == '\'' ? keystorePath.substring(0, keystorePath.length - 1) : keystorePath;
      if (fileIO.existsSync(keystorePath)) {
        try {
          const ks = JSON.parse(fileIO.readFileSync(keystorePath, 'utf8'));
          const pwd = ReadlineSync.question('keystore password:', { hideEchoBack: true });
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
        console.error('Can not load keystore file.');
        process.exit();
      }
    } else {
      console.error('Can\'t load master private key');
      process.exit();
    }
  }

  private async connNodes(): Promise<any> {
    await this.initConnex();
    await this.initWeb3();
  }

  private async initConnex(): Promise<any> {
    try {
      let host = '';
      if (this.environment.config.vechain.nodeHost != undefined || '') {
        host = this.environment.config.vechain.nodeHost;
      } else {
        host = ReadlineSync.question('VeChain Node Host:');
      }
      const wallet = new SimpleWallet();
      wallet.import(this.environment.prieky);
      this.environment.wallet = wallet;
      const driver = await Driver.connect(new SimpleNet(host), this.environment.wallet);
      this.environment.connex = new Framework(driver);
      const chainId = '0x' + this.environment.connex.thor.genesis.id.substring(64);
      this.environment.config.vechain.nodeHost = host;
      this.environment.config.vechain.chainName = 'vechain';
      this.environment.config.vechain.chainId = chainId;
      this.environment.config.vechain.confirmHeight = this.environment.config.vechain.confirmHeight ? this.environment.config.vechain.confirmHeight : 3;
      this.environment.config.vechain.expiration = this.environment.config.vechain.expiration ? this.environment.config.vechain.expiration : 180;
    } catch (error) {
      console.error(`Connect VeChain Node Faild. error:${error}`);
      process.exit();
    }
  }

  private async initWeb3(): Promise<any> {
    try {
      let ethereumHost = '';
      if (this.environment.config.ethereum.nodeHost != undefined || '') {
        ethereumHost = this.environment.config.ethereum.nodeHost;
      } else {
        ethereumHost = ReadlineSync.question('Ethereum Node Host:');
      }
      const web3 = new Web3(new Web3.providers.HttpProvider(ethereumHost));
      web3.eth.accounts.wallet.add(this.environment.prieky);
      this.environment.web3 = web3;
      const chainId = await this.environment.web3.eth.getChainId();
      this.environment.config.ethereum.nodeHost = ethereumHost;
      this.environment.config.ethereum.chainName = 'ethereum';
      this.environment.config.ethereum.chainId = chainId.toString();
      this.environment.config.ethereum.confirmHeight = this.environment.config.confirmHeight ? this.environment.config.confirmHeight : 3;
      this.environment.config.ethereum.expiration = this.environment.config.expiration ? this.environment.config.expiration : 24;
    } catch (error) {
      console.error(`Connect Ethereum Node Faild. error:${error}`);
      process.exit();
    }
  }

  private async initContracts(): Promise<any> {
    this.environment.contracts = { vechain: {}, ethereum: {} };

    const vechainValidatorFile = path.join(this.environment.contractdir, '/vechain/Contract_VeChainBridgeValidator.sol');
    const vechainValidatorAbi = JSON.parse(compileContract(vechainValidatorFile, 'VeChainBridgeValidator', 'abi', [this.environment.contractdir]));
    const vechainValidatorBin = compileContract(vechainValidatorFile, 'VeChainBridgeValidator', 'bytecode', [this.environment.contractdir]);
    this.environment.contracts.vechain.bridgeValidator = new VContract({ connex: this.environment.connex, abi: vechainValidatorAbi, bytecode: vechainValidatorBin });

    const ethereumValidatorFile = path.join(this.environment.contractdir, '/ethereum/Contract_EthereumBridgeValidator.sol');
    const ethereumValidatorAbi = JSON.parse(compileContract(ethereumValidatorFile, 'EthereumBridgeValidator', 'abi', [this.environment.contractdir]));
    const ethereumValidatorBin = compileContract(ethereumValidatorFile, 'EthereumBridgeValidator', 'bytecode', [this.environment.contractdir]);
    this.environment.contracts.ethereum.bridgeValidator = new (this.environment.web3 as Web3).eth.Contract((ethereumValidatorAbi as any), undefined, { data: ethereumValidatorBin });

    const bridgeCoreFile = path.join(this.environment.contractdir, '/common/Contract_BridgeCore.sol');
    const bridgeCoreAbi = JSON.parse(compileContract(bridgeCoreFile, 'BridgeCore', 'abi'));
    const bridgeCoreBin = compileContract(bridgeCoreFile, 'BridgeCore', 'bytecode');
    this.environment.contracts.vechain.bridgeCore = new VContract({ connex: this.environment.connex, abi: bridgeCoreAbi, bytecode: bridgeCoreBin });
    this.environment.contracts.ethereum.bridgeCore = new (this.environment.web3 as Web3).eth.Contract((bridgeCoreAbi as any), undefined, { data: bridgeCoreBin });


    const ftbridgeControlFile = path.join(this.environment.contractdir, '/common/Contract_FTBridgeControl.sol');
    const ftbridgeControlAbi = JSON.parse(compileContract(ftbridgeControlFile, 'FTBridgeControl', 'abi'));
    const ftbridgeControlBin = compileContract(ftbridgeControlFile, 'FTBridgeControl', 'bytecode');
    this.environment.contracts.vechain.ftbridgeControl = new VContract({ connex: this.environment.connex, abi: ftbridgeControlAbi, bytecode: ftbridgeControlBin });
    this.environment.contracts.ethereum.ftbridgeControl = new (this.environment.web3 as Web3).eth.Contract((ftbridgeControlAbi as any), undefined, { data: ftbridgeControlBin });

    const ftbridgeTokensFile = path.join(this.environment.contractdir, '/common/Contract_FTBridgeTokens.sol');
    const ftbridgeTokensAbi = JSON.parse(compileContract(ftbridgeTokensFile, 'FTBridgeTokens', 'abi'));
    const ftbridgeTokensBin = compileContract(ftbridgeTokensFile, 'FTBridgeTokens', 'bytecode');
    this.environment.contracts.vechain.ftbridgeTokens = new VContract({ connex: this.environment.connex, abi: ftbridgeTokensAbi, bytecode: ftbridgeTokensBin });
    this.environment.contracts.ethereum.ftbridgeTokens = new (this.environment.web3 as Web3).eth.Contract((ftbridgeTokensAbi as any), undefined, { data: ftbridgeTokensBin });

    const ftbridgeFile = path.join(this.environment.contractdir, '/common/Contract_FTBridge.sol');
    const ftbridgeAbi = JSON.parse(compileContract(ftbridgeFile, 'FTBridge', 'abi'));
    const ftbridgeBin = compileContract(ftbridgeFile, 'FTBridge', 'bytecode');
    this.environment.contracts.vechain.ftBridge = new VContract({ connex: this.environment.connex, abi: ftbridgeAbi, bytecode: ftbridgeBin });
    this.environment.contracts.ethereum.ftBridge = new (this.environment.web3 as Web3).eth.Contract((ftbridgeAbi as any), undefined, { data: ftbridgeBin });

    if (this.isAddress(this.environment.config.vechain.contracts.bridgeCore)) {
      (this.environment.contracts.vechain.bridgeCore as VContract).at(this.environment.config.vechain.contracts.bridgeCore);
    }

    if (this.isAddress(this.environment.config.vechain.contracts.bridgeValidator)) {
      (this.environment.contracts.vechain.bridgeValidator as VContract).at(this.environment.config.vechain.contracts.bridgeValidator);
    }

    if (this.isAddress(this.environment.config.vechain.contracts.ftBridge)) {
      (this.environment.contracts.vechain.ftBridge as VContract).at(this.environment.config.vechain.contracts.ftBridge);
      const call1 = (await (this.environment.contracts.vechain.ftBridge as VContract).call('bridgeControl'));
      if(this.isAddress(call1.decoded[0])){
        (this.environment.contracts.vechain.ftbridgeControl as VContract).at(call1.decoded[0] as string);
      }
      const call2 = (await (this.environment.contracts.vechain.ftBridge as VContract).call('bridgeTokens'));
      if(this.isAddress(call2.decoded[0])){
        (this.environment.contracts.vechain.ftbridgeTokens as VContract).at(call2.decoded[0] as string);
      }
    }

    if (this.isAddress(this.environment.config.ethereum.contracts.bridgeCore)) {
      (this.environment.contracts.ethereum.bridgeCore as EContract).options.address = this.environment.config.ethereum.contracts.bridgeCore;
    }

    if (this.isAddress(this.environment.config.ethereum.contracts.bridgeValidator)) {
      (this.environment.contracts.ethereum.bridgeValidator as EContract).options.address = this.environment.config.ethereum.contracts.bridgeValidator;
    }

    if (this.isAddress(this.environment.config.ethereum.contracts.ftBridge)) {
      (this.environment.contracts.ethereum.ftBridge as EContract).options.address = this.environment.config.ethereum.contracts.ftBridge;
      const call1 = await (this.environment.contracts.ethereum.ftBridge as EContract).methods.bridgeControl().call();
      if(this.isAddress(call1)){
        (this.environment.contracts.ethereum.ftbridgeControl as EContract).options.address = call1 as string;
      }
      const call2 = await (this.environment.contracts.ethereum.ftBridge as EContract).methods.bridgeTokens().call();
      if(this.isAddress(call2)){
        (this.environment.contracts.ethereum.ftbridgeTokens as EContract).options.address = call2 as string;
      }
    }
  }

  private async deployVeChainBridgeCore(): Promise<any> {
    try {
      let bridgeCore = this.environment.contracts.vechain.bridgeCore as VContract;
      let bridgeValidator = this.environment.contracts.vechain.bridgeValidator as VContract;

      console.info('--> deploy vechain bridgecore contract.');

      const chainName = String(this.environment.config.vechain.chainName);
      const chainId = String(this.environment.config.vechain.chainId);
      const clause1 = bridgeCore.deploy(0, chainName, chainId);
      const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx', [clause1])
        .signer(this.environment.master)
        .request();
      const receipt1 = await getReceipt(this.environment.connex, 6, txrep1.txid);
      if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
        console.error(`Deploy vechain bridgecore faild, txid: ${receipt1.meta.txID}`);
        process.exit();
      }
      bridgeCore.at(receipt1.outputs[0].contractAddress);
      this.environment.config.vechain.contracts.bridgeCore = bridgeCore.address;
      this.environment.config.vechain.startBlockNum = receipt1.meta.blockNumber;

      console.info('--> deploy vechain bridge validator contract.');
      const clause2 = bridgeValidator.deploy(0);
      const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx', [clause2])
        .signer(this.environment.master)
        .request();
      const receipt2 = await getReceipt(this.environment.connex, 6, txrep2.txid);
      if (receipt2 == null || receipt2.reverted || receipt2.outputs[0].contractAddress == undefined) {
        console.error(`Deploy vechain bridge validator faild, txid: ${receipt2.meta.txID}`);
        process.exit();
      }
      bridgeValidator.at(receipt2.outputs[0].contractAddress);
      this.environment.config.vechain.contracts.bridgeValidator = bridgeValidator.address;

      console.info('--> set validator contracts address.');
      const clause3 = bridgeCore.send('setValidator', 0, bridgeValidator.address);
      const txrep3 = await (this.environment.connex as Framework).vendor.sign('tx', [clause3])
        .signer(this.environment.master)
        .request();
      const receipt3 = await getReceipt(this.environment.connex, 6, txrep3.txid);
      if (receipt3 == null || receipt3.reverted) {
        console.error(`Set validator address faild, txid: ${receipt3.meta.txID}`);
        process.exit();
      }

      console.info('--> set bridge contracts address.');
      const clause4 = bridgeValidator.send('setBridge', 0, bridgeCore.address);
      const txrep4 = await (this.environment.connex as Framework).vendor.sign('tx', [clause4])
        .signer(this.environment.master)
        .request();
      const receipt4 = await getReceipt(this.environment.connex, 6, txrep4.txid);
      if (receipt4 == null || receipt4.reverted) {
        console.error(`Set bridge address faild, txid: ${receipt4.meta.txID}`);
        process.exit();
      }

      this.environment.config.appid = "";
      fileIO.writeFileSync(this.environment.configPath, JSON.stringify(this.environment.config));

      console.info('VeChain contracts deploy finish');
      console.info(`VeChain bridgeCore: ${bridgeCore.address} blockNum: ${receipt1.meta.blockNumber} deployTx: ${receipt1.meta.txID}`);
      console.info(`VeChain bridgeValidator: ${bridgeValidator.address} blockNum: ${receipt2.meta.blockNumber} deployTx: ${receipt2.meta.txID}`);

    } catch (error) {
      console.error(`Deploy VeChain bridgecore & validator contracts faild. error: ${error}`);
      process.exit();
    }
  }

  private async deployEthereumBridgeCore(): Promise<any> {
    try {
      let bridgeCore = this.environment.contracts.ethereum.bridgeCore as EContract;
      let bridgeValidator = this.environment.contracts.ethereum.bridgeValidator as EContract;
      let bridgeCoreMeta: any = {};
      let bridgeValidatorMeta: any = {};

      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();

      console.info('--> deploy vechain bridgecore contract.');
      const chainName = String(this.environment.config.ethereum.chainName);
      const chainId = String(this.environment.config.ethereum.chainId);
      const bridgeCoreDeployMethod = bridgeCore.deploy({ data: bridgeCore.options.data!, arguments: [chainName, chainId] });
      const bridgeCoreDeployGas = await bridgeCoreDeployMethod.estimateGas({ from: this.environment.master });
      bridgeCore = await bridgeCoreDeployMethod.send({ from: this.environment.master, gas: bridgeCoreDeployGas, gasPrice: gasPrice })
        .on('receipt', (receipt) => {
          bridgeCoreMeta = {
            deploy: {
              blockNum: receipt.blockNumber,
              deployTx: receipt.transactionHash
            }
          }
        });
      this.environment.config.ethereum.contracts.bridgeCore = bridgeCore.options.address;

      console.info('--> deploy ethereum bridge validator contract.');
      const bridgeValidatorDeployMethod = bridgeValidator.deploy({ data: bridgeValidator.options.data! });
      const bridgeValidatorDeployGas = await bridgeValidatorDeployMethod.estimateGas({ from: this.environment.master });
      bridgeValidator = await bridgeValidatorDeployMethod.send({ from: this.environment.master, gas: bridgeValidatorDeployGas, gasPrice: gasPrice })
        .on('receipt', (receipt) => {
          bridgeValidatorMeta = {
            deploy: {
              blockNum: receipt.blockNumber,
              deployTx: receipt.transactionHash
            }
          }
        });
      this.environment.config.ethereum.contracts.bridgeValidator = bridgeValidator.options.address;

      console.info('--> set validator contracts address.');
      const setValidatorMethod = bridgeCore.methods.setValidator(bridgeValidator.options.address);
      const setValidatorMethodGas = await setValidatorMethod.estimateGas({ from: this.environment.master });
      await setValidatorMethod.send({ from: this.environment.master, gas: setValidatorMethodGas, gasPrice: gasPrice });

      this.environment.config.appid = "";
      fileIO.writeFileSync(this.environment.configPath, JSON.stringify(this.environment.config));

      console.info('Ethereum contracts deploy finish');
      console.info(`Ethereum bridge: ${bridgeCore.options.address} blockNum: ${bridgeCoreMeta.deploy.blockNum} deployTx: ${bridgeCoreMeta.deploy.deployTx}`);
      console.info(`Ethereum validator: ${bridgeValidator.options.address} blockNum: ${bridgeValidatorMeta.deploy.blockNum} deployTx: ${bridgeValidatorMeta.deploy.deployTx}`);

    } catch (error) {
      console.error(`Deploy Ethereum bridgecore & validator contracts faild. error: ${error}`);
      process.exit();
    }
  }

  private async initAppid(): Promise<any> {
    if (this.environment.config.appid == undefined || this.environment.config.appid == '') {
      const value = ReadlineSync.question('Enter exists appid (empty will register new appid):').trim().toLowerCase();
      if (value.length == 66) {
        this.environment.config.appid = value;
      } else {
        console.log('Register new appid');
        const newid = randomBytes(32);
        const vechainBridgeCore = this.environment.contracts.vechain.bridgeCore as VContract;
        const ethereumBridgeCore = this.environment.contracts.ethereum.bridgeCore as EContract;

        try {
          const clause = vechainBridgeCore.send('addAppid', 0, newid, this.environment.master);
          const txrep = await (this.environment.connex as Framework).vendor.sign('tx', [clause])
            .signer(this.environment.master)
            .request();
          const receipt = await getReceipt(this.environment.connex, 6, txrep.txid);
          if (receipt == undefined || receipt.reverted) {
            console.error(`Register new appid faild, txid: ${receipt.meta.txID}`);
            process.exit();
          }
          const addAppidMethod = ethereumBridgeCore.methods.addAppid(newid, this.environment.master);
          const gas = await addAppidMethod.estimateGas({ from: this.environment.master });
          const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
          await addAppidMethod.send({ from: this.environment.master, gas: gas, gasPrice: gasPrice });
          this.environment.config.appid = '0x' + newid.toString('hex');
          fileIO.writeFileSync(this.environment.configPath, JSON.stringify(this.environment.config));
          console.log(`New appid: ${this.environment.config.appid}`);
        } catch (error) {
          console.error('Register new appid faild');
          process.exit();
        }
      }
    }
  }

  private async deployVeChainFTBridge(): Promise<any> {
    try {
      let ftBridgeControl = this.environment.contracts.vechain.ftbridgeControl as VContract;
      let ftBridgeTokens = this.environment.contracts.vechain.ftbridgeTokens as VContract;
      let ftBridge = this.environment.contracts.vechain.ftBridge as VContract;
      let bridgeCore = this.environment.contracts.vechain.bridgeCore as VContract;

      const chainName = String(this.environment.config.vechain.chainName);
      const chainId = String(this.environment.config.vechain.chainId);

      console.info('--> deploy vechain ftBridgeControl contract.');
      const clause1 = ftBridgeControl.deploy(0);
      const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx', [clause1])
        .signer(this.environment.master)
        .request();
      const receipt1 = await getReceipt(this.environment.connex, 6, txrep1.txid);
      if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
        console.error(`Deploy vechain ftBridgeControl faild, txid: ${receipt1.meta.txID}`);
        process.exit();
      }
      ftBridgeControl.at(receipt1.outputs[0].contractAddress);

      console.info('--> deploy vechain ftBridgeTokens contract.');
      const clause2 = ftBridgeTokens.deploy(0, ftBridgeControl.address);
      const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx', [clause2])
        .signer(this.environment.master)
        .request();
      const receipt2 = await getReceipt(this.environment.connex, 6, txrep2.txid);
      if (receipt2 == null || receipt2.reverted || receipt2.outputs[0].contractAddress == undefined) {
        console.error(`Deploy vechain ftBridgeTokens faild, txid: ${receipt2.meta.txID}`);
        process.exit();
      }
      ftBridgeTokens.at(receipt2.outputs[0].contractAddress);

      console.info('--> deploy vechain ftBridge contract.');
      const clause3 = ftBridge.deploy(0, chainName, chainId, ftBridgeControl.address, ftBridgeTokens.address);
      const txrep3 = await (this.environment.connex as Framework).vendor.sign('tx', [clause3])
        .signer(this.environment.master)
        .request();
      const receipt3 = await getReceipt(this.environment.connex, 6, txrep3.txid);
      if (receipt3 == null || receipt3.reverted || receipt3.outputs[0].contractAddress == undefined) {
        console.error(`Deploy vechain ftBridge faild, txid: ${receipt3.meta.txID}`);
        process.exit();
      }
      ftBridge.at(receipt3.outputs[0].contractAddress);

      console.info('--> register ftBridge to bridgeCore.');
      const appid = this.environment.config.appid;
      const clause4 = bridgeCore.send('addContract', 0, appid, ftBridge.address);
      const txrep4 = await (this.environment.connex as Framework).vendor.sign('tx', [clause4])
        .signer(this.environment.master)
        .request();
      const receipt4 = await getReceipt(this.environment.connex, 6, txrep4.txid);
      if (receipt4 == null || receipt4.reverted) {
        console.error(`Add FTBridge contract faild, txid: ${receipt4.meta.txID}`);
        process.exit();
      }

      this.environment.config.vechain.contracts.ftBridge = ftBridge.address;
      fileIO.writeFileSync(this.environment.configPath, JSON.stringify(this.environment.config));

      console.info('VeChain FTBridge deploy finish');
      console.info(`VeChain FTBridgeControl: ${ftBridgeControl.address}`);
      console.info(`VeChain FTBridgeTokens: ${ftBridgeTokens.address}`);
      console.info(`VeChain FTBridge: ${ftBridge.address}`);
    } catch (error) {
      console.error(`Deploy & Register VeChain FTBridge contracts faild. error: ${error}`);
      process.exit();
    }
  }

  private async deployEthereumFTBridge(): Promise<any> {
    try {
      let ftBridgeControl = this.environment.contracts.ethereum.ftbridgeControl as EContract;
      let ftBridgeTokens = this.environment.contracts.ethereum.ftbridgeTokens as EContract;
      let ftBridge = this.environment.contracts.ethereum.ftBridge as EContract;
      let bridgeCore = this.environment.contracts.ethereum.bridgeCore as EContract;

      const chainName = String(this.environment.config.ethereum.chainName);
      const chainId = String(this.environment.config.ethereum.chainId);

      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();

      console.info('--> deploy ethereum ftBridgeControl contract.');
      const controlDeployMethod = ftBridgeControl.deploy({ data: ftBridgeControl.options.data! });
      const controlDeployGas = await controlDeployMethod.estimateGas({ from: this.environment.master });
      ftBridgeControl = await controlDeployMethod.send({ from: this.environment.master, gas: controlDeployGas, gasPrice: gasPrice });

      console.info('--> deploy ethereum ftBridgeTokens contract.');
      const tokensDeployMethod = ftBridgeTokens.deploy({ data: ftBridgeTokens.options.data!, arguments: [ftBridgeControl.options.address] });
      const tokensDeployGas = await tokensDeployMethod.estimateGas({ from: this.environment.master });
      ftBridgeTokens = await tokensDeployMethod.send({ from: this.environment.master, gas: tokensDeployGas, gasPrice: gasPrice });

      console.info('--> deploy ethereum ftBridge contract.');
      const ftBridgeDeployMethod = ftBridge.deploy({ data: ftBridge.options.data!, arguments: [chainName, chainId, ftBridgeControl.options.address, ftBridgeTokens.options.address] });
      const ftBridgeDeployGas = await ftBridgeDeployMethod.estimateGas({ from: this.environment.master });
      ftBridge = await ftBridgeDeployMethod.send({ from: this.environment.master, gas: ftBridgeDeployGas, gasPrice: gasPrice });

      console.info('--> register ftBridge to bridgeCore.');
      const appid = this.environment.config.appid;
      const addContractMethod = bridgeCore.methods.addContract(appid, ftBridge.options.address);
      const addContractGas = await addContractMethod.estimateGas({ from: this.environment.master });
      await addContractMethod.send({ from: this.environment.master, gas: addContractGas, gasPrice: gasPrice });

      this.environment.config.ethereum.contracts.ftBridge = ftBridge.options.address;
      fileIO.writeFileSync(this.environment.configPath, JSON.stringify(this.environment.config));

      console.info('Ethereum FTBridge deploy finish');
      console.info(`Ethereum FTBridgeControl: ${ftBridgeControl.options.address}`);
      console.info(`Ethereum FTBridgeTokens: ${ftBridgeTokens.options.address}`);
      console.info(`Ethereum FTBridge: ${ftBridge.options.address}`);

    } catch (error) {
      console.error(`Deploy & Register Ethereum FTBridge contracts faild. error: ${error}`);
      process.exit();
    }
  }

  private async deployToken(): Promise<any> {
    try {
      const networks = ['vechain', 'ethereum'];
      const index = ReadlineSync.keyInSelect(networks, 'Which Operation?');
      switch (index) {
        case 0:
          await this.initVeChainFTBridge();
          await this.deployTokenToVeChain();
          break;
        case 1:
          await this.initEthereumFTBridge();
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

  private async initVeChainBridgeCore(): Promise<any> {
    let bridgeCore = this.environment.contracts.vechain.bridgeCore as VContract;
    if (this.isAddress(this.environment.config.vechain.contracts.bridgeCore)) {
      bridgeCore.at(this.environment.config.vechain.contracts.bridgeCore);
    } else {
      const addr = ReadlineSync.question('Set VeChain bridgeCore address:').trim();
      bridgeCore.at(addr);
    }
  }

  private async initEthereumBridgeCore(): Promise<any> {
    let bridgeCore = this.environment.contracts.ethereum.bridgeCore as EContract;
    if (this.isAddress(this.environment.config.ethereum.contracts.bridgeCore)) {
      bridgeCore.options.address = this.environment.config.ethereum.contracts.bridgeCore;
    } else {
      const addr = ReadlineSync.question('Set Ethereum bridgeCore address:').trim();
      bridgeCore.options.address = addr;
    }
  }

  private async initVeChainFTBridge(): Promise<any> {
    let ftBridge = this.environment.contracts.vechain.ftBridge as VContract;
    if (this.isAddress(this.environment.config.vechain.contracts.ftBridge)) {
      ftBridge.at(this.environment.config.vechain.contracts.ftBridge);
    } else {
      const addr = ReadlineSync.question('Set VeChain ftBridge address:').trim();
      ftBridge.at(addr);
    }
  }

  private async initEthereumFTBridge(): Promise<any> {
    let ftBridge = this.environment.contracts.ethereum.ftBridge as EContract;
    if (this.isAddress(this.environment.config.ethereum.contracts.ftBridge)) {
      ftBridge.options.address = this.environment.config.ethereum.contracts.ftBridge;
    } else {
      const addr = ReadlineSync.question('Set Ethereum ftBridge address:').trim();
      ftBridge.options.address = addr;
    }
  }

  private async deployTokenToVeChain(): Promise<any> {
    const fTokenFilePath = path.join(this.environment.contractdir, '/common/Contract_FungibleToken.sol');
    const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
    const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
    let fTokenContract = new VContract({ abi: fTokenAbi, connex: this.environment.connex, bytecode: fTokenBin });

    const wTokenFilePath = path.join(this.environment.contractdir, '/common/Contract_BridgeWrappedToken.sol');
    const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
    const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
    let wTokenContract = new (this.environment.web3 as Web3).eth.Contract(wTokenAbi, undefined, { data: wTokenBin });

    console.info('Deploy and register token to VeChain');
    const value = ReadlineSync.question('Enter exists token address (empty will deploy new contract):').trim();
    let originTokenInfo = {
      address: '',
      name: '',
      symbol: '',
      decimals: 0,
      nativeCoin: false,
      taddress:'',
      tchainname:'',
      tchainid:'',
      beginNum: 0,
      reward:0
    }
    let bridgeWrappedTokenInfo = {
      address: '',
      name: '',
      symbol: '',
      taddress:'',
      tchainname:'',
      tchainid:'',
      decimals: 0,
      beginNum: 0,
      reward:0
    }

    try {
      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
      if (this.isAddress(value)) {
        fTokenContract.at(value);
        const name = String((await fTokenContract.call('name')).decoded[0]);
        const symbol = String((await fTokenContract.call('symbol')).decoded[0]).toLocaleUpperCase();
        const decimals = Number((await fTokenContract.call('decimals')).decoded[0]);
        originTokenInfo = {
          address: value,
          name: name,
          symbol: symbol,
          decimals: decimals,
          nativeCoin: false,
          taddress:'',
          tchainname:String(this.environment.config.ethereum.chainName),
          tchainid:String(this.environment.config.ethereum.chainId),
          beginNum: 0,
          reward:0
        }
      } else {
        const name = ReadlineSync.question('Token name: ').trim();
        const symbol = ReadlineSync.question('Token symbol: ').trim().toLocaleUpperCase();
        const decimals = Number(ReadlineSync.question('Token decimals: ').trim());
        originTokenInfo = {
          address: '',
          name: name,
          symbol: symbol,
          decimals: decimals,
          nativeCoin: false,
          taddress:'',
          tchainname:String(this.environment.config.ethereum.chainName),
          tchainid:String(this.environment.config.ethereum.chainId),
          beginNum: 0,
          reward:0
        }
      }
      const nativecoin = ReadlineSync.question('Is VeChain native coin?(y/n)').trim().toLowerCase();
      originTokenInfo.nativeCoin = nativecoin == 'y' ? true : false;

      const reward = ReadlineSync.question('Set token reward (1 - 1000):').trim();
      originTokenInfo.reward = Number(reward);

      let wname = ReadlineSync.question(`Ethereum bridge wrapped token name (default ${'Bridge Wrapped ' + originTokenInfo.name}):`).trim();
      let wsymbol = ReadlineSync.question(`Ethereum bridge wrapped token symbol (default ${'W' + originTokenInfo.symbol.substring(1)}):`).trim();

      bridgeWrappedTokenInfo = {
        address: '',
        name: wname.length > 0 ? wname : 'Bridge Wrapped ' + originTokenInfo.name,
        symbol: wsymbol.length > 0 ? wsymbol : 'W' + originTokenInfo.symbol.substring(1),
        decimals: originTokenInfo.decimals,
        taddress:'',
        tchainname:String(this.environment.config.vechain.chainName),
        tchainid:String(this.environment.config.vechain.chainName),
        beginNum: 0,
        reward:Number(reward)
      }

      console.info('\r\nOrigin Token Info:');
      console.info(`address: ${originTokenInfo.address}`);
      console.info(`name: ${originTokenInfo.name} symbol: ${originTokenInfo.symbol} decimals: ${originTokenInfo.decimals} reward: ${originTokenInfo.reward}`);

      console.info('\r\nBridge Wrapped Token Info:');
      console.info(`address: ${bridgeWrappedTokenInfo.address}`);
      console.info(`name: ${bridgeWrappedTokenInfo.name} symbol: ${bridgeWrappedTokenInfo.symbol} decimals: ${bridgeWrappedTokenInfo.decimals}`);

      const next = ReadlineSync.question('Continue to deploy & register the token (y/n)').trim().toLocaleLowerCase();
      if (next == 'n') {
        console.info('Quit deploy');
        return;
      }

      if (!this.isAddress(originTokenInfo.address)) {
        console.info(`--> deploy ${originTokenInfo.symbol} token to VeChain.`);
        const clause1 = fTokenContract.deploy(0, originTokenInfo.name, originTokenInfo.symbol, originTokenInfo.decimals);
        const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx', [clause1])
          .signer((this.environment.wallet as SimpleWallet).list[0].address)
          .request();
        const receipt1 = await getReceipt(this.environment.connex, 5, txrep1.txid);
        if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
          console.error('Deploy token faild.');
          return;
        }
        originTokenInfo.address = receipt1.outputs[0].contractAddress;
      }

      console.info(`--> deploy ${bridgeWrappedTokenInfo.symbol} token to Ethereum`);
      const deployMethod = wTokenContract.deploy({ data: wTokenBin, arguments: [bridgeWrappedTokenInfo.name, bridgeWrappedTokenInfo.symbol, bridgeWrappedTokenInfo.decimals, this.environment.config.ethereum.contracts.ftBridge] });
      const deployGas = await deployMethod.estimateGas({
        from: this.environment.master
      });
      wTokenContract = await deployMethod.send({
        from: this.environment.master,
        gas: deployGas,
        gasPrice: gasPrice
      });

      bridgeWrappedTokenInfo.address = wTokenContract.options.address;
      originTokenInfo.taddress = bridgeWrappedTokenInfo.address;
      bridgeWrappedTokenInfo.taddress = originTokenInfo.address;

      console.info(`--> register ${originTokenInfo.symbol} to VeChain bridge`);
      const vbestBlock = (this.environment.connex as Framework).thor.status.head.number;
      let clause2;  
      if (originTokenInfo.nativeCoin == true) {
        clause2 = (this.environment.contracts.vechain.ftbridgeTokens as VContract).send('setWrappedNativeCoin', 0,
        originTokenInfo.address,originTokenInfo.taddress,originTokenInfo.tchainname,originTokenInfo.tchainid,vbestBlock,0,originTokenInfo.reward);
      } else {
        clause2 = (this.environment.contracts.vechain.ftbridgeTokens as VContract).send('setToken', 0,
        originTokenInfo.address,1,originTokenInfo.taddress,originTokenInfo.tchainname,originTokenInfo.tchainid,vbestBlock,0,originTokenInfo.reward);
      }
      const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx', [clause2])
        .signer(this.environment.master)
        .request();
      const receipt2 = await getReceipt(this.environment.connex, 5, txrep2.txid);
      if (receipt2 == null || receipt2.reverted) {
        console.error(`Register token faild. txid: ${txrep2.txid}`);
        return;
      }

      console.info(`--> register ${bridgeWrappedTokenInfo.symbol} to Ethereum`);
      const eBestBlock = (await (this.environment.web3 as Web3).eth.getBlock('latest')).number;

      const setMethod = (this.environment.contracts.ethereum.ftbridgeTokens as EContract).methods.setToken(
        bridgeWrappedTokenInfo.address, 2, bridgeWrappedTokenInfo.taddress, bridgeWrappedTokenInfo.tchainname, bridgeWrappedTokenInfo.tchainid, eBestBlock, 0,bridgeWrappedTokenInfo.reward);
      const setGas = await setMethod.estimateGas({
        from: this.environment.master
      });
      wTokenContract = await setMethod.send({
        from: this.environment.master,
        gas: setGas,
        gasPrice: gasPrice
      });

      console.info('Deploy & register finish.');
      console.info(`${originTokenInfo.symbol} address: ${originTokenInfo.address}`);
      console.info(`${bridgeWrappedTokenInfo.symbol} address: ${bridgeWrappedTokenInfo.address}`);
    } catch (error) {
      console.error(`deploy & register token faild, error: ${error}`);
      return;
    }
  }

  private async deployTokenToEthereum(): Promise<any> {
    const fTokenFilePath = path.join(this.environment.contractdir, '/common/Contract_FungibleToken.sol');
    const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
    const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
    let fTokenContract = new (this.environment.web3 as Web3).eth.Contract(fTokenAbi);

    const wTokenFilePath = path.join(this.environment.contractdir, '/common/Contract_BridgeWrappedToken.sol');
    const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
    const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
    let wTokenContract = new VContract({ abi: wTokenAbi, connex: this.environment.connex, bytecode: wTokenBin });

    console.log('Deploy and register token to Ethereum');
    const value = ReadlineSync.question('Enter exists token address (empty will deploy new contract):').trim();
    let originTokenInfo = {
      address: '',
      name: '',
      symbol: '',
      decimals: 0,
      nativeCoin: false,
      taddress:'',
      tchainname:'',
      tchainid:'',
      beginNum: 0,
      reward:0
    }
    let bridgeWrappedTokenInfo = {
      address: '',
      name: '',
      symbol: '',
      taddress:'',
      tchainname:'',
      tchainid:'',
      decimals: 0,
      beginNum: 0,
      reward:0
    }

    try {
      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
      if (this.isAddress(value)) {
        fTokenContract.options.address = value;
        const name = String((await fTokenContract.methods.name().call()));
        const symbol = String((await fTokenContract.methods.symbol().call())).toLocaleUpperCase();
        const decimals = Number((await fTokenContract.methods.decimals().call()));
        originTokenInfo = {
          address: value,
          name: name,
          symbol: symbol,
          decimals: decimals,
          nativeCoin: false,
          taddress:'',
          tchainname:String(this.environment.config.vechain.chainName),
          tchainid:String(this.environment.config.vechain.chainId),
          beginNum: 0,
          reward:0
        }
      } else {
        const name = ReadlineSync.question('Token name: ').trim();
        const symbol = ReadlineSync.question('Token symbol: ').trim().toLocaleUpperCase();
        const decimals = Number(ReadlineSync.question('Token decimals: ').trim());
        originTokenInfo = {
          address: '',
          name: name,
          symbol: symbol,
          decimals: decimals,
          nativeCoin: false,
          taddress:'',
          tchainname:String(this.environment.config.vechain.chainName),
          tchainid:String(this.environment.config.vechain.chainId),
          beginNum: 0,
          reward:0
        }
      }
      const nativecoin = ReadlineSync.question('Is Ethereum Native Coin?(y/n)').trim().toLowerCase();
      originTokenInfo.nativeCoin = nativecoin == 'y' ? true : false;

      const reward = ReadlineSync.question('Set token reward (1 - 1000):').trim();
      originTokenInfo.reward = Number(reward);

      let wname = ReadlineSync.question(`Ethereum bridge wrapped token name (default ${'Bridge Wrapped ' + originTokenInfo.name}):`).trim();
      let wsymbol = ReadlineSync.question(`Ethereum bridge wrapped token symbol (default ${'V' + originTokenInfo.symbol.substring(1)}):`).trim();

      bridgeWrappedTokenInfo = {
        address: '',
        name: wname.length > 0 ? wname : 'Bridge Wrapped ' + originTokenInfo.name,
        symbol: wsymbol.length > 0 ? wsymbol : 'V' + originTokenInfo.symbol.substring(1),
        decimals: originTokenInfo.decimals,
        taddress:'',
        tchainname:String(this.environment.config.vechain.chainName),
        tchainid:String(this.environment.config.vechain.chainName),
        beginNum: 0,
        reward:Number(reward)
      }

      console.info('\r\nOrigin Token Info:');
      console.info(`address: ${originTokenInfo.address}`);
      console.info(`name: ${originTokenInfo.name} symbol: ${originTokenInfo.symbol} decimals: ${originTokenInfo.decimals}`);

      console.info('\r\nBridge Wrapped Token Info:');
      console.info(`address: ${bridgeWrappedTokenInfo.address}`);
      console.info(`name: ${bridgeWrappedTokenInfo.name} symbol: ${bridgeWrappedTokenInfo.symbol} decimals: ${bridgeWrappedTokenInfo.decimals}`);

      const next = ReadlineSync.question('Continue to deploy & register token (y/n)').trim().toLocaleLowerCase();
      if (next == 'n') {
        console.info('Quit deploy');
        return;
      }


      if (!this.isAddress(originTokenInfo.address)) {
        console.log(`--> deploy ${originTokenInfo.symbol} token to Ethereum.`);
        const deployMethod = fTokenContract.deploy({ data: fTokenBin, arguments: [originTokenInfo.name, originTokenInfo.symbol, originTokenInfo.decimals] });
        const deployGas = await deployMethod.estimateGas({
          from: this.environment.master
        });

        fTokenContract = await deployMethod.send({
          from: this.environment.master,
          gas: deployGas,
          gasPrice: gasPrice
        });
        originTokenInfo.address = fTokenContract.options.address;
      }

      console.log(`--> deploy ${bridgeWrappedTokenInfo.symbol} token to VeChain`);
      const clause1 = wTokenContract.deploy(0, 
        bridgeWrappedTokenInfo.name, bridgeWrappedTokenInfo.symbol, bridgeWrappedTokenInfo.decimals, this.environment.config.vechain.contracts.ftBridge);
      const txrep1 = await (this.environment.connex as Framework).vendor.sign('tx', [clause1])
        .signer(this.environment.master)
        .request();
      const receipt1 = await getReceipt(this.environment.connex, 5, txrep1.txid);
      if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
        console.error(`--> deploy token faild. txid: ${txrep1.txid}`);
        return;
      }
      bridgeWrappedTokenInfo.address = receipt1.outputs[0].contractAddress;
      originTokenInfo.taddress = bridgeWrappedTokenInfo.address;
      bridgeWrappedTokenInfo.taddress = originTokenInfo.address;

      console.log(`--> register ${originTokenInfo.symbol} to Ethereum bridge`);
      const eBestBlock = (await (this.environment.web3 as Web3).eth.getBlock('latest')).number;
      let setMethod;
      let setGas;
      if (originTokenInfo.nativeCoin == true) {
        setMethod = (this.environment.contracts.ethereum.ftbridgeTokens as EContract).methods.setWrappedNativeCoin(
          originTokenInfo.address,originTokenInfo.taddress,originTokenInfo.tchainname,originTokenInfo.tchainid,eBestBlock,0,originTokenInfo.reward);
        setGas = await setMethod.estimateGas({
          from: this.environment.master
        });
      } else {
        setMethod = (this.environment.contracts.ethereum.ftbridgeTokens as EContract).methods.setToken(
          originTokenInfo.address,1,originTokenInfo.taddress,originTokenInfo.tchainname,originTokenInfo.tchainid,eBestBlock,0,originTokenInfo.reward);
        setGas = await setMethod.estimateGas({
          from: this.environment.master
        });
      }

      wTokenContract = await setMethod.send({
        from: this.environment.master,
        gas: setGas,
        gasPrice: gasPrice
      });

      console.log(`--> register ${bridgeWrappedTokenInfo.symbol} to VeChain bridge`);
      const vbestBlock = (this.environment.connex as Framework).thor.status.head.number;
      const clause2 = (this.environment.contracts.vechain.ftbridgeTokens as VContract).send('setToken', 0, 
      bridgeWrappedTokenInfo.address, 2, bridgeWrappedTokenInfo.taddress, bridgeWrappedTokenInfo.tchainname, bridgeWrappedTokenInfo.tchainid, vbestBlock, 0,bridgeWrappedTokenInfo.reward);
      const txrep2 = await (this.environment.connex as Framework).vendor.sign('tx', [clause2])
        .signer(this.environment.master)
        .request();
      const receipt2 = await getReceipt(this.environment.connex, 5, txrep2.txid);
      if (receipt2 == null || receipt2.reverted) {
        console.error(`Register token faild. txid: ${txrep2.txid}`);
        return;
      }

      console.info('Deploy & register finish.');
      console.info(`${originTokenInfo.symbol} address: ${originTokenInfo.address}`);
      console.info(`${bridgeWrappedTokenInfo.symbol} address: ${bridgeWrappedTokenInfo.address}`);
    } catch (error) {
      console.error(`Deploy & register token faild, error: ${error}`);
      return;
    }
  }

  private async addValidator(): Promise<any> {
    try {
      await this.initVeChainValidator();
      await this.initEthereumValiator();

      const validator = ReadlineSync.question('Add new validator address to contract:').trim();

      console.info(`--> register validator ${validator} to VeChain bridge`);
      const clause = await this.environment.contracts.vechain.bridgeValidator.send('addValidator', 0, validator);
      const txRep = await this.environment.connex.vendor.sign('tx', [clause])
        .signer((this.environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt = await getReceipt(this.environment.connex, 5, txRep.txid);
      if (receipt == null || receipt.reverted) {
        console.error(`Add new validator to contract faild. txid: ${txRep.txid}`);
        return;
      }

      console.info(`--> register validator ${validator} to Ethereum bridge`);
      const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
      const addValidatorMethod = this.environment.contracts.ethereum.bridgeValidator.methods.addValidator(validator) as ContractSendMethod;
      const gas = await addValidatorMethod.estimateGas({
        from: this.environment.master
      });
      await addValidatorMethod.send({
        from: (this.environment.wallet as SimpleWallet).list[0].address,
        gas: gas,
        gasPrice: gasPrice
      });
      console.info('Add validator finish');

    } catch (error) {
      console.error(`Deploy Token faild. error:${error}`);
      return;
    }
  }

  private async initVeChainValidator(): Promise<any> {
    let bridgeValidator = this.environment.contracts.vechain.bridgeValidator as VContract;
    if(this.isAddress(this.environment.config.vechain?.contracts?.bridgeValidator)){
      bridgeValidator.at(this.environment.config.vechain?.contracts?.bridgeValidator);
    } else {
      const addr = ReadlineSync.question('Set VeChain bridge valiator address:').trim();
      bridgeValidator.at(addr);
    }
  }

  private async initEthereumValiator(): Promise<any> {
    let bridgeValidator = this.environment.contracts.ethereum.bridgeValidator as EContract;
    if(this.isAddress(this.environment.config.ethereum?.contracts?.bridgeValidator)){
      bridgeValidator.options.address = this.environment.config.ethereum?.contracts?.bridgeValidator;
    } else {
        const addr = ReadlineSync.question('Set Ethereum bridge validator address:').trim();
        bridgeValidator.options.address = addr;
    }
  }

  private isAddress(value: any): boolean {
    return value != undefined && typeof (value) == 'string' && value.length == 42;
  }
}