import * as Yargs from 'yargs';
import * as fileIO from 'fs';
import path from 'path';
import * as ReadlineSync from 'readline-sync';
import { Keystore, RLP, address, mnemonic, secp256k1 } from 'thor-devkit';
import { Driver, SimpleNet, SimpleWallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import Web3 from 'web3';
import { compileContract } from 'myvetools/dist/utils';
import { Contract as VContract } from 'myvetools';
import { Contract as EContract, ContractSendMethod } from 'web3-eth-contract';
import { getReceipt } from 'myvetools/dist/connexUtils';
import randomBytes from 'randombytes';
import { ObjectSet } from '../common/utils/objectSet';

const argv = Yargs.scriptName('tools')
  .usage('<cmd> [args]')
  .command('node [args]', '', (yargs) => {
    yargs.positional('config', {
      alias: 'c',
      type: 'string',
      default: ''
    });
    yargs.positional('keystore', {
      alias: 'k',
      type: 'string',
      default: ''
    });
  }).help().argv;

const environment: any = {};
const argsRLP = new RLP({
  name: 'range',
  kind: [
    { name: 'vbegin', kind: new RLP.NumericKind(32) },
    { name: 'vend', kind: new RLP.NumericKind(32) },
    { name: 'ebegin', kind: new RLP.NumericKind(32) },
    { name: 'eend', kind: new RLP.NumericKind(32) },
  ]
});
const genesisArgs = '0x' + argsRLP.encode({ vbegin: 0, vend: 0, ebegin: 0, eend: 0 }).toString('hex');

async function run(argv: any) {
  initEnv(argv);
  await initBlockChain(argv);

  console.info(`
  ********************  VeChain Asset Bridge Tools Info ********************
  | VeChain ChainId Info    | ${environment.config.vechain.chainName} ${environment.config.vechain.chainId} ${environment.config.vechain.nodeHost}
  | Ethereum ChainId Info   | ${environment.config.ethereum.chainName}  ${environment.config.ethereum.chainId}  ${environment.config.ethereum.nodeHost}
  | Master Key Address      | ${environment.master}
  *******************************************************************
`);
  await operations();
}

function initEnv(argv: any) {
  var configPath = (argv.config || "" as string).trim();
  if (fileIO.existsSync(configPath)) {
    try {
      const config = require(configPath);
      environment.config = config;
      environment.contract = { vechain: {}, ethereum: {} };
      environment.config.appid = "";
      environment.configPath = configPath;
    } catch (error) {
      console.error(`Read config faild,error:${error}`);
      process.exit();
    }
  } else {
    console.error(`Can't load configfile ${configPath}`);
    process.exit();
  }
}

async function initBlockChain(argv: any) {
  environment.contractdir = path.join(__dirname, "../common/contracts/");
  const prikey = await loadNodeKey(argv);
  await initConnex(prikey);
  await initWeb3(prikey);
  await initContracts();
}

async function loadNodeKey(argv: any): Promise<string> {
  const keystorePath = (argv.keystore || "" as string).trim();
  if (fileIO.existsSync(keystorePath)) {
    try {
      const ks = JSON.parse(fileIO.readFileSync(keystorePath, "utf8"));
      const pwd = ReadlineSync.question(`keystore password:`, { hideEchoBack: true });
      const prikey = await Keystore.decrypt((ks as any), pwd);
      const pubKey = secp256k1.derivePublicKey(prikey);
      const addr = address.fromPublicKey(pubKey);
      environment.master = addr;
      return prikey.toString('hex');
    } catch (error) {
      console.error(`Keystore or password invalid. ${error}`);
      process.exit();
    }
  } else if (fileIO.existsSync(path.join(environment.keypath, "node.key"))) {
    const key = fileIO.readFileSync(path.join(environment.keypath, "node.key")).toString('utf8').trim().toLocaleLowerCase();
    if (key.length == 64 && /^[0-9a-f]*$/i.test(key)) {
      return key;
    } else {
      console.error(`Can't load node key`);
      process.exit();
    }
  } else {
    try {
      const words = mnemonic.generate();
      const prikey = mnemonic.derivePrivateKey(words);
      if (!fileIO.existsSync(environment.keypath)) {
        fileIO.mkdirSync(environment.keypath);
      }
      fileIO.writeFileSync(path.join(environment.keypath, "node.key"), prikey.toString('hex'));
      return prikey.toString('hex');
    } catch (error) {
      console.error(`Generate key faild.`);
      process.exit();
    }
  }
}

async function initConnex(priKey: string) {
  try {
    const wallet = new SimpleWallet();
    wallet.import(priKey);
    environment.wallet = wallet;
    const driver = await Driver.connect(new SimpleNet(environment.config.vechain.nodeHost as string), environment.wallet);
    environment.connex = new Framework(driver);
  } catch (error) {
    console.error(`Init connex faild`);
    process.exit();
  }
}

async function initWeb3(priKey: string) {
  try {
    const web3 = new Web3(new Web3.providers.HttpProvider(environment.config.ethereum.nodeHost));
    web3.eth.accounts.wallet.add(priKey);
    environment.web3 = web3;
  } catch (error) {
    console.error(`Init web3 faild`);
    process.exit();
  }
}

async function initContracts() {
  environment.contracts = { vechain: {}, ethereum: {} };

  const vechainValidatorFile = path.join(environment.contractdir, '/vechain/Contract_VeChainBridgeValidator.sol');
  const vechainValidatorAbi = JSON.parse(compileContract(vechainValidatorFile, 'VeChainBridgeValidator', 'abi', [environment.contractdir]));
  const vechainValidatorBin = compileContract(vechainValidatorFile, 'VeChainBridgeValidator', 'bytecode', [environment.contractdir]);
  environment.contracts.vechain.bridgeValidator = new VContract({ connex: environment.connex, abi: vechainValidatorAbi, bytecode: vechainValidatorBin });

  const ethereumValidatorFile = path.join(environment.contractdir, '/ethereum/Contract_EthereumBridgeValidator.sol');
  const ethereumValidatorAbi = JSON.parse(compileContract(ethereumValidatorFile, 'EthereumBridgeValidator', 'abi', [environment.contractdir]));
  const ethereumValidatorBin = compileContract(ethereumValidatorFile, 'EthereumBridgeValidator', 'bytecode', [environment.contractdir]);
  environment.contracts.ethereum.bridgeValidator = new (environment.web3 as Web3).eth.Contract((ethereumValidatorAbi as any), undefined, { data: ethereumValidatorBin });

  const bridgeCoreFile = path.join(environment.contractdir, '/common/Contract_BridgeCore.sol');
  const bridgeCoreAbi = JSON.parse(compileContract(bridgeCoreFile, 'BridgeCore', 'abi'));
  const bridgeCoreBin = compileContract(bridgeCoreFile, 'BridgeCore', 'bytecode');
  environment.contracts.vechain.bridgeCore = new VContract({ connex: environment.connex, abi: bridgeCoreAbi, bytecode: bridgeCoreBin });
  environment.contracts.ethereum.bridgeCore = new (environment.web3 as Web3).eth.Contract((bridgeCoreAbi as any), undefined, { data: bridgeCoreBin });


  const ftbridgeControlFile = path.join(environment.contractdir, '/common/Contract_FTBridgeControl.sol');
  const ftbridgeControlAbi = JSON.parse(compileContract(ftbridgeControlFile, 'FTBridgeControl', 'abi'));
  const ftbridgeControlBin = compileContract(ftbridgeControlFile, 'FTBridgeControl', 'bytecode');
  environment.contracts.vechain.ftbridgeControl = new VContract({ connex: environment.connex, abi: ftbridgeControlAbi, bytecode: ftbridgeControlBin });
  environment.contracts.ethereum.ftbridgeControl = new (environment.web3 as Web3).eth.Contract((ftbridgeControlAbi as any), undefined, { data: ftbridgeControlBin });

  const ftbridgeTokensFile = path.join(environment.contractdir, '/common/Contract_FTBridgeTokens.sol');
  const ftbridgeTokensAbi = JSON.parse(compileContract(ftbridgeTokensFile, 'FTBridgeTokens', 'abi'));
  const ftbridgeTokensBin = compileContract(ftbridgeTokensFile, 'FTBridgeTokens', 'bytecode');
  environment.contracts.vechain.ftbridgeTokens = new VContract({ connex: environment.connex, abi: ftbridgeTokensAbi, bytecode: ftbridgeTokensBin });
  environment.contracts.ethereum.ftbridgeTokens = new (environment.web3 as Web3).eth.Contract((ftbridgeTokensAbi as any), undefined, { data: ftbridgeTokensBin });

  const ftbridgeFile = path.join(environment.contractdir, '/common/Contract_FTBridge.sol');
  const ftbridgeAbi = JSON.parse(compileContract(ftbridgeFile, 'FTBridge', 'abi'));
  const ftbridgeBin = compileContract(ftbridgeFile, 'FTBridge', 'bytecode');
  environment.contracts.vechain.ftBridge = new VContract({ connex: environment.connex, abi: ftbridgeAbi, bytecode: ftbridgeBin });
  environment.contracts.ethereum.ftBridge = new (environment.web3 as Web3).eth.Contract((ftbridgeAbi as any), undefined, { data: ftbridgeBin });

  if (isAddress(environment.config.vechain.contracts.bridgeCore)) {
    (environment.contracts.vechain.bridgeCore as VContract).at(environment.config.vechain.contracts.bridgeCore);
    const call = (await (environment.contracts.vechain.bridgeCore as VContract).call('validator'));
    if (isAddress(call.decoded[0])) {
      (environment.contracts.vechain.bridgeValidator as VContract).at(call.decoded[0]);
      environment.config.vechain.contracts.bridgeValidator = call.decoded[0] as string;
    }
  }

  if (isAddress(environment.config.vechain.contracts.ftBridge)) {
    (environment.contracts.vechain.ftBridge as VContract).at(environment.config.vechain.contracts.ftBridge);
    const call1 = (await (environment.contracts.vechain.ftBridge as VContract).call('bridgeControl'));
    if (isAddress(call1.decoded[0])) {
      (environment.contracts.vechain.ftbridgeControl as VContract).at(call1.decoded[0] as string);
      environment.config.vechain.contracts.ftbridgeControl = call1.decoded[0] as string;
    }
    const call2 = (await (environment.contracts.vechain.ftBridge as VContract).call('bridgeTokens'));
    if (isAddress(call2.decoded[0])) {
      (environment.contracts.vechain.ftbridgeTokens as VContract).at(call2.decoded[0] as string);
      environment.config.vechain.contracts.ftbridgeTokens = call2.decoded[0] as string;
    }
  }

  if (isAddress(environment.config.ethereum.contracts.bridgeCore)) {
    (environment.contracts.ethereum.bridgeCore as EContract).options.address = environment.config.ethereum.contracts.bridgeCore;1
    const call = await (environment.contracts.ethereum.bridgeCore as EContract).methods.validator().call();
    if (isAddress(call)) {
      (environment.contracts.ethereum.bridgeValidator as EContract).options.address = call as string;
      environment.config.ethereum.contracts.bridgeValidator = call as string;
    }
  }

  if (isAddress(environment.config.ethereum.contracts.ftBridge)) {
    (environment.contracts.ethereum.ftBridge as EContract).options.address = environment.config.ethereum.contracts.ftBridge;
    const call1 = await (environment.contracts.ethereum.ftBridge as EContract).methods.bridgeControl().call();
    if (isAddress(call1)) {
      (environment.contracts.ethereum.ftbridgeControl as EContract).options.address = call1 as string;
      environment.config.ethereum.contracts.ftbridgeControl = call1 as string;
    }
    const call2 = await (environment.contracts.ethereum.ftBridge as EContract).methods.bridgeTokens().call();
    if (isAddress(call2)) {
      (environment.contracts.ethereum.ftbridgeTokens as EContract).options.address = call2 as string;
      environment.config.ethereum.contracts.ftbridgeTokens = call2 as string;
    }
  }
}

function isAddress(value: any): boolean {
  return value != undefined && typeof (value) == 'string' && value.length == 42 && /^0x[0-9a-fA-f]+/i.test(value);
}

async function operations() {

  while (true) {
    const operations = [
      'Deploy BridgeCore & Validator Contract To Vechain',
      'Deploy Bridge & Validator Contract To Ethereum',
      'Deploy and register FTBridge To Vechain',
      'Deploy and register FTBridge To Ethereum',
      'Deploy token',
      'Add Validator'];

    const index = ReadlineSync.keyInSelect(operations, 'Which Operation?');
    switch (index) {
      case -1:
        console.info('Quit Bridge Tools');
        process.exit();
      case 0:
        await deployVeChainBridgeCore();
        break;
      case 1:
        await deployEthereumBridgeCore();
        break;
      case 2:
        await initVeChainBridgeCore();
        await initEthereumBridgeCore();
        await initAppid();
        await deployVeChainFTBridge();
        break;
      case 3:
        await initVeChainBridgeCore();
        await initEthereumBridgeCore();
        await initAppid();
        await deployEthereumFTBridge();
        break;
      case 4:
        await deployToken();
        break;
      case 5:
        await addValidator();
        break;
      default:
        console.error('Invalid operation.');
        break;
    }
  }
}

async function deployVeChainBridgeCore() {
  try {
    let bridgeCore = environment.contracts.vechain.bridgeCore as VContract;
    let bridgeValidator = environment.contracts.vechain.bridgeValidator as VContract;

    console.info('--> Step1/4: Deploy vechain bridgecore contract.');

    const chainName = String(environment.config.vechain.chainName);
    const chainId = String(environment.config.vechain.chainId);
    const clause1 = bridgeCore.deploy(0, chainName, chainId, genesisArgs);
    const txrep1 = await (environment.connex as Framework).vendor.sign('tx', [clause1])
      .signer(environment.master)
      .request();
    const receipt1 = await getReceipt(environment.connex, 6, txrep1.txid);
    if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
      console.error(`Deploy vechain bridgecore faild, txid: ${receipt1.meta.txID}`);
      process.exit();
    }
    bridgeCore.at(receipt1.outputs[0].contractAddress);
    environment.config.vechain.contracts.bridgeCore = bridgeCore.address;
    environment.config.vechain.startBlockNum = receipt1.meta.blockNumber;
    environment.contracts.vechain.bridgeCore = bridgeCore;

    console.info('--> Step2/4: Deploy vechain bridge validator contract.');
    const clause2 = bridgeValidator.deploy(0);
    const txrep2 = await (environment.connex as Framework).vendor.sign('tx', [clause2])
      .signer(environment.master)
      .request();
    const receipt2 = await getReceipt(environment.connex, 6, txrep2.txid);
    if (receipt2 == null || receipt2.reverted || receipt2.outputs[0].contractAddress == undefined) {
      console.error(`Deploy vechain bridge validator faild, txid: ${receipt2.meta.txID}`);
      process.exit();
    }
    bridgeValidator.at(receipt2.outputs[0].contractAddress);
    environment.config.vechain.contracts.bridgeValidator = bridgeValidator.address;
    environment.contracts.vechain.bridgeValidator = bridgeValidator;

    console.info('--> Step3/4: Set validator contracts address.');
    const clause3 = bridgeCore.send('setValidator', 0, bridgeValidator.address);
    const txrep3 = await (environment.connex as Framework).vendor.sign('tx', [clause3])
      .signer(environment.master)
      .request();
    const receipt3 = await getReceipt(environment.connex, 6, txrep3.txid);
    if (receipt3 == null || receipt3.reverted) {
      console.error(`Set validator address faild, txid: ${receipt3.meta.txID}`);
      process.exit();
    }

    console.info('--> Step4/4: Set bridge contracts address.');
    const clause4 = bridgeValidator.send('setBridge', 0, bridgeCore.address);
    const txrep4 = await (environment.connex as Framework).vendor.sign('tx', [clause4])
      .signer(environment.master)
      .request();
    const receipt4 = await getReceipt(environment.connex, 6, txrep4.txid);
    if (receipt4 == null || receipt4.reverted) {
      console.error(`Set bridge address faild, txid: ${receipt4.meta.txID}`);
      process.exit();
    }

    fileIO.writeFileSync(environment.configPath, JSON.stringify(environment.config, null, 4));

    console.info('VeChain contracts deploy finish');
    console.info(`VeChain bridgeCore: ${bridgeCore.address} blockNum: ${receipt1.meta.blockNumber} deployTx: ${receipt1.meta.txID}`);
    console.info(`VeChain bridgeValidator: ${bridgeValidator.address} blockNum: ${receipt2.meta.blockNumber} deployTx: ${receipt2.meta.txID}`);

  } catch (error) {
    console.error(`Deploy VeChain bridgecore & validator contracts faild. error: ${error}`);
    process.exit();
  }
}

async function deployEthereumBridgeCore() {
  try {
    let bridgeCore = environment.contracts.ethereum.bridgeCore as EContract;
    let bridgeValidator = environment.contracts.ethereum.bridgeValidator as EContract;
    let bridgeCoreMeta: any = {};
    let bridgeValidatorMeta: any = {};

    const gasPrice = await (environment.web3 as Web3).eth.getGasPrice();

    console.info('--> Step1/4: Deploy ethereum bridgecore contract.');
    const chainName = String(environment.config.ethereum.chainName);
    const chainId = String(environment.config.ethereum.chainId);
    const bridgeCoreDeployMethod = bridgeCore.deploy({ data: bridgeCore.options.data!, arguments: [chainName, chainId, genesisArgs] });
    const bridgeCoreDeployGas = await bridgeCoreDeployMethod.estimateGas({ from: environment.master });
    bridgeCore = await bridgeCoreDeployMethod.send({ from: environment.master, gas: bridgeCoreDeployGas, gasPrice: gasPrice })
      .on('receipt', (receipt) => {
        bridgeCoreMeta = {
          deploy: {
            blockNum: receipt.blockNumber,
            deployTx: receipt.transactionHash
          }
        }
      });
    environment.config.ethereum.contracts.bridgeCore = bridgeCore.options.address;
    environment.config.ethereum.startBlockNum = bridgeCoreMeta.deploy.blockNum as number;
    environment.contracts.ethereum.bridgeCore = bridgeCore;

    console.info('--> Step2/4: Deploy ethereum bridge validator contract.');
    const bridgeValidatorDeployMethod = bridgeValidator.deploy({ data: bridgeValidator.options.data! });
    const bridgeValidatorDeployGas = await bridgeValidatorDeployMethod.estimateGas({ from: environment.master });
    bridgeValidator = await bridgeValidatorDeployMethod.send({ from: environment.master, gas: bridgeValidatorDeployGas, gasPrice: gasPrice })
      .on('receipt', (receipt) => {
        bridgeValidatorMeta = {
          deploy: {
            blockNum: receipt.blockNumber,
            deployTx: receipt.transactionHash
          }
        }
      });
    environment.config.ethereum.contracts.bridgeValidator = bridgeValidator.options.address;
    environment.contracts.ethereum.bridgeValidator = bridgeValidator;

    console.info('--> Step3/4: Set validator contracts address.');
    const setValidatorMethod = bridgeCore.methods.setValidator(bridgeValidator.options.address);
    const setValidatorMethodGas = await setValidatorMethod.estimateGas({ from: environment.master });
    await setValidatorMethod.send({ from: environment.master, gas: setValidatorMethodGas, gasPrice: gasPrice });

    console.info('--> Step4/4: Set bridge contracts address.');
    const setBridgeMethod = bridgeValidator.methods.setBridge(bridgeCore.options.address);
    const setBridgeMethodGas = await setBridgeMethod.estimateGas({ from: environment.master });
    await setBridgeMethod.send({ from: environment.master, gas: setBridgeMethodGas, gasPrice: gasPrice });

    fileIO.writeFileSync(environment.configPath, JSON.stringify(environment.config, null, 4));

    console.info('Ethereum contracts deploy finish');
    console.info(`Ethereum bridge: ${bridgeCore.options.address} blockNum: ${bridgeCoreMeta.deploy.blockNum} deployTx: ${bridgeCoreMeta.deploy.deployTx}`);
    console.info(`Ethereum validator: ${bridgeValidator.options.address} blockNum: ${bridgeValidatorMeta.deploy.blockNum} deployTx: ${bridgeValidatorMeta.deploy.deployTx}`);

  } catch (error) {
    console.error(`Deploy ethereum bridgecore & validator contracts faild. error: ${error}`);
    process.exit();
  }
}

async function initVeChainBridgeCore() {
  let bridgeCore = environment.contracts.vechain.bridgeCore as VContract;
  if (isAddress(environment.config.vechain.contracts.bridgeCore)) {
    bridgeCore.at(environment.config.vechain.contracts.bridgeCore);
  } else {
    const addr = ReadlineSync.question('Set VeChain bridgeCore address:').trim();
    bridgeCore.at(addr);
  }
  const call = await bridgeCore.call('validator');
  if (isAddress(call.decoded[0])) {
    (environment.contracts.vechain.bridgeValidator as VContract).at(call.decoded[0]);
    environment.config.vechain.contracts.bridgeValidator = call.decoded[0] as string;
  }
}

async function initEthereumBridgeCore() {
  let bridgeCore = environment.contracts.ethereum.bridgeCore as EContract;
  if (isAddress(environment.config.ethereum.contracts.bridgeCore)) {
    bridgeCore.options.address = environment.config.ethereum.contracts.bridgeCore;
  } else {
    const addr = ReadlineSync.question('Set Ethereum bridgeCore address:').trim();
    bridgeCore.options.address = addr;
  }
  const call = await bridgeCore.methods.validator().call();
  if (isAddress(call)) {
    (environment.contracts.ethereum.bridgeValidator as EContract).options.address = call as string;
    environment.config.ethereum.contracts.bridgeValidator = call as string;
  }
}

async function initAppid() {
  if (environment.config.appid == undefined || environment.config.appid == '') {
    const value = ReadlineSync.question('Enter exists appid (empty will genesis an new appid):').trim().toLowerCase();
    if (value.length == 66) {
      environment.config.appid = value;
    } else {
      console.log('Genesis new appid');
      const newid = randomBytes(32);
      const vechainBridgeCore = environment.contracts.vechain.bridgeCore as VContract;
      const ethereumBridgeCore = environment.contracts.ethereum.bridgeCore as EContract;

      try {
        console.info(`Step1/2: Register appid to Vechain bridgecore`);
        const clause = vechainBridgeCore.send('addAppid', 0, newid, environment.master);
        const txrep = await (environment.connex as Framework).vendor.sign('tx', [clause])
          .signer(environment.master)
          .request();
        const receipt = await getReceipt(environment.connex, 6, txrep.txid);
        if (receipt == undefined || receipt.reverted) {
          console.error(`Register new appid faild, txid: ${receipt.meta.txID}`);
          process.exit();
        }

        console.info(`Step2/2: Register appid to Ethereum bridgecore`);
        const addAppidMethod = ethereumBridgeCore.methods.addAppid(newid, environment.master);
        const gas = await addAppidMethod.estimateGas({ from: environment.master });
        const gasPrice = await (environment.web3 as Web3).eth.getGasPrice();
        await addAppidMethod.send({ from: environment.master, gas: gas, gasPrice: gasPrice });
        environment.config.appid = '0x' + newid.toString('hex');
        fileIO.writeFileSync(environment.configPath, JSON.stringify(environment.config, null, 4));
        console.log(`New appid: ${environment.config.appid}`);
      } catch (error) {
        console.error('Register new appid faild');
        process.exit();
      }
    }
  }
}

async function deployVeChainFTBridge() {
  try {
    let ftBridgeControl = environment.contracts.vechain.ftbridgeControl as VContract;
    let ftBridgeTokens = environment.contracts.vechain.ftbridgeTokens as VContract;
    let ftBridge = environment.contracts.vechain.ftBridge as VContract;
    let bridgeCore = environment.contracts.vechain.bridgeCore as VContract;

    const chainName = String(environment.config.vechain.chainName);
    const chainId = String(environment.config.vechain.chainId);

    console.info('--> Step1/5: Deploy vechain ftBridgeControl contract.');
    const clause1 = ftBridgeControl.deploy(0);
    const txrep1 = await (environment.connex as Framework).vendor.sign('tx', [clause1])
      .signer(environment.master)
      .request();
    const receipt1 = await getReceipt(environment.connex, 6, txrep1.txid);
    if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
      console.error(`Deploy vechain ftBridgeControl faild, txid: ${receipt1.meta.txID}`);
      process.exit();
    }
    ftBridgeControl.at(receipt1.outputs[0].contractAddress);
    environment.contracts.vechain.ftbridgeControl = ftBridgeControl;

    console.info('--> Step2/5: Deploy vechain ftBridgeTokens contract.');
    const clause2 = ftBridgeTokens.deploy(0, ftBridgeControl.address);
    const txrep2 = await (environment.connex as Framework).vendor.sign('tx', [clause2])
      .signer(environment.master)
      .request();
    const receipt2 = await getReceipt(environment.connex, 6, txrep2.txid);
    if (receipt2 == null || receipt2.reverted || receipt2.outputs[0].contractAddress == undefined) {
      console.error(`Deploy vechain ftBridgeTokens faild, txid: ${receipt2.meta.txID}`);
      process.exit();
    }
    ftBridgeTokens.at(receipt2.outputs[0].contractAddress);
    environment.contracts.vechain.ftbridgeTokens = ftBridgeTokens;

    console.info('--> Step3/5: Deploy vechain ftBridge contract.');
    const clause3 = ftBridge.deploy(0, chainName, chainId, ftBridgeControl.address, ftBridgeTokens.address);
    const txrep3 = await (environment.connex as Framework).vendor.sign('tx', [clause3])
      .signer(environment.master)
      .request();
    const receipt3 = await getReceipt(environment.connex, 6, txrep3.txid);
    if (receipt3 == null || receipt3.reverted || receipt3.outputs[0].contractAddress == undefined) {
      console.error(`Deploy vechain ftBridge faild, txid: ${receipt3.meta.txID}`);
      process.exit();
    }
    ftBridge.at(receipt3.outputs[0].contractAddress);
    environment.contracts.vechain.ftBridge = ftBridge;

    console.info('--> Step4/5: Register ftBridge to bridgeCore.');
    const appid = environment.config.appid;
    const clause4 = bridgeCore.send('addContract', 0, appid, ftBridge.address);
    const txrep4 = await (environment.connex as Framework).vendor.sign('tx', [clause4])
      .signer(environment.master)
      .request();
    const receipt4 = await getReceipt(environment.connex, 6, txrep4.txid);
    if (receipt4 == null || receipt4.reverted) {
      console.error(`Add FTBridge contract faild, txid: ${receipt4.meta.txID}`);
      process.exit();
    }

    console.log('--> Step5/5: Set BridgeCore address & appid');
    const clause5 = ftBridge.send('setBridgeCore', 0, bridgeCore.address, appid);
    const txrep5 = await (environment.connex as Framework).vendor.sign('tx', [clause5])
      .signer(environment.master)
      .request();
    const receipt5 = await getReceipt(environment.connex, 6, txrep5.txid);
    if (receipt5 == null || receipt5.reverted) {
      console.error(`Set bridgeCore address and appid faild, txid: ${receipt4.meta.txID}`);
      process.exit();
    }

    environment.config.vechain.contracts.ftBridge = ftBridge.address;
    fileIO.writeFileSync(environment.configPath, JSON.stringify(environment.config, null, 4));

    console.info('VeChain FTBridge deploy finish');
    console.info(`VeChain FTBridgeControl: ${ftBridgeControl.address} blockNum: ${receipt1.meta.blockNumber} deployTx: ${receipt1.meta.txID}`);
    console.info(`VeChain FTBridgeTokens: ${ftBridgeTokens.address} blockNum: ${receipt2.meta.blockNumber} deployTx: ${receipt2.meta.txID}`);
    console.info(`VeChain FTBridge: ${ftBridge.address} blockNum: ${receipt3.meta.blockNumber} deployTx: ${receipt3.meta.txID}`);
  } catch (error) {
    console.error(`Deploy & Register VeChain FTBridge contracts faild. error: ${error}`);
    process.exit();
  }
}

async function deployEthereumFTBridge() {
  try {
    let ftBridgeControl = environment.contracts.ethereum.ftbridgeControl as EContract;
    let ftBridgeTokens = environment.contracts.ethereum.ftbridgeTokens as EContract;
    let ftBridge = environment.contracts.ethereum.ftBridge as EContract;
    let bridgeCore = environment.contracts.ethereum.bridgeCore as EContract;

    const chainName = String(environment.config.ethereum.chainName);
    const chainId = String(environment.config.ethereum.chainId);

    const gasPrice = await (environment.web3 as Web3).eth.getGasPrice();

    var ftBridgeControlMeta: any = {};
    var ftBridgeTokensMeta: any = {};
    var ftBridgelMeta: any = {};

    console.info('--> Step1/5: Deploy ethereum ftBridgeControl contract.');
    const controlDeployMethod = ftBridgeControl.deploy({ data: ftBridgeControl.options.data! });
    const controlDeployGas = await controlDeployMethod.estimateGas({ from: environment.master });
    ftBridgeControl = await controlDeployMethod.send({ from: environment.master, gas: controlDeployGas, gasPrice: gasPrice })
      .on('receipt', (receipt) => {
        ftBridgeControlMeta = {
          deploy: {
            blockNum: receipt.blockNumber,
            deployTx: receipt.transactionHash
          }
        }
      });
    environment.contracts.ethereum.ftbridgeControl = ftBridgeControl;

    console.info('--> Step2/5: Deploy ethereum ftBridgeTokens contract.');
    const tokensDeployMethod = ftBridgeTokens.deploy({ data: ftBridgeTokens.options.data!, arguments: [ftBridgeControl.options.address] });
    const tokensDeployGas = await tokensDeployMethod.estimateGas({ from: environment.master });
    ftBridgeTokens = await tokensDeployMethod.send({ from: environment.master, gas: tokensDeployGas, gasPrice: gasPrice })
      .on('receipt', (receipt) => {
        ftBridgeTokensMeta = {
          deploy: {
            blockNum: receipt.blockNumber,
            deployTx: receipt.transactionHash
          }
        }
      });
    environment.contracts.ethereum.ftbridgeTokens = ftBridgeTokens;

    console.info('--> Step3/5: Deploy ethereum ftBridge contract.');
    const ftBridgeDeployMethod = ftBridge.deploy({ data: ftBridge.options.data!, arguments: [chainName, chainId, ftBridgeControl.options.address, ftBridgeTokens.options.address] });
    const ftBridgeDeployGas = await ftBridgeDeployMethod.estimateGas({ from: environment.master });
    ftBridge = await ftBridgeDeployMethod.send({ from: environment.master, gas: ftBridgeDeployGas, gasPrice: gasPrice })
      .on('receipt', (receipt) => {
        ftBridgelMeta = {
          deploy: {
            blockNum: receipt.blockNumber,
            deployTx: receipt.transactionHash
          }
        }
      });

    environment.contracts.ethereum.ftBridge = ftBridge;

    console.info('--> Step4/5: Register ftBridge to bridgeCore.');
    const appid = environment.config.appid;
    const addContractMethod = bridgeCore.methods.addContract(appid, ftBridge.options.address);
    const addContractGas = await addContractMethod.estimateGas({ from: environment.master });
    await addContractMethod.send({ from: environment.master, gas: addContractGas, gasPrice: gasPrice });

    console.log('--> Step5/5: Set BridgeCore address');
    const setBridgeCoreMethod = ftBridge.methods.setBridgeCore(bridgeCore.options.address, appid);
    const setBridgeCoreGas = await setBridgeCoreMethod.estimateGas({ from: environment.master });
    await setBridgeCoreMethod.send({ from: environment.master, gas: setBridgeCoreGas, gasPrice: gasPrice });

    environment.config.ethereum.contracts.ftBridge = ftBridge.options.address;
    fileIO.writeFileSync(environment.configPath, JSON.stringify(environment.config,null,4));

    console.info('Ethereum FTBridge deploy finish');
    console.info(`Ethereum FTBridgeControl: ${ftBridgeControl.options.address} blockNum: ${ftBridgeControlMeta.deploy.blockNum} deployTx: ${ftBridgeControlMeta.deploy.deployTx}`);
    console.info(`Ethereum FTBridgeTokens: ${ftBridgeTokens.options.address} blockNum: ${ftBridgeTokensMeta.deploy.blockNum} deployTx: ${ftBridgeTokensMeta.deploy.deployTx}`);
    console.info(`Ethereum FTBridge: ${ftBridge.options.address} blockNum: ${ftBridgelMeta.deploy.blockNum} deployTx: ${ftBridgelMeta.deploy.deployTx}`);

  } catch (error) {
    console.error(`Deploy & Register Ethereum FTBridge contracts faild. error: ${error}`);
    process.exit();
  }
}

async function deployToken() {
  try {
    const networks = ['vechain', 'ethereum'];
    const index = ReadlineSync.keyInSelect(networks, 'Which Operation?');
    switch (index) {
      case 0:
        await initVeChainFTBridge();
        await initEthereumFTBridge();
        await deployTokenToVeChain();
        break;
      case 1:
        await initEthereumFTBridge();
        await initVeChainFTBridge();
        await deployTokenToEthereum();
        break;
      default:
        return;
    }
  } catch (error) {
    console.error(`Deploy Token faild. error:${error}`);
    process.exit();
  }
}

async function initVeChainFTBridge() {
  let ftBridge = environment.contracts.vechain.ftBridge as VContract;
  if (isAddress(environment.config.vechain.contracts.ftBridge)) {
    ftBridge.at(environment.config.vechain.contracts.ftBridge);
  } else {
    const addr = ReadlineSync.question('Set VeChain ftBridge address:').trim().toLocaleLowerCase();
    ftBridge.at(addr);
    ObjectSet(environment, "config.vechain.contracts.ftBridge", addr);
  }

  const controlAddr = String((await ftBridge.call('bridgeControl')).decoded[0]);
  const tokensAddr = String((await ftBridge.call('bridgeTokens')).decoded[0]);
  (environment.contracts.vechain.ftbridgeControl as VContract).at(controlAddr);
  (environment.contracts.vechain.ftbridgeTokens as VContract).at(tokensAddr);

  ObjectSet(environment, "config.vechain.contracts.ftbridgeControl", controlAddr);
  ObjectSet(environment, "config.vechain.contracts.ftbridgeTokens", tokensAddr);
}

async function initEthereumFTBridge() {
  let ftBridge = environment.contracts.ethereum.ftBridge as EContract;
  if (isAddress(environment.config.ethereum.contracts.ftBridge)) {
    ftBridge.options.address = environment.config.ethereum.contracts.ftBridge;
  } else {
    const addr = ReadlineSync.question('Set Ethereum ftBridge address:').trim().toLocaleLowerCase();;
    ftBridge.options.address = addr;
    ObjectSet(environment, "config.ethereum.contracts.ftBridge", addr);
  }

  const controlAddr = String(await ftBridge.methods.bridgeControl().call());
  const tokensAddr = String(await ftBridge.methods.bridgeTokens().call());
  (environment.contracts.ethereum.ftbridgeControl as EContract).options.address = controlAddr;
  (environment.contracts.ethereum.ftbridgeTokens as EContract).options.address = tokensAddr;

  ObjectSet(environment, "config.ethereum.contracts.ftbridgeControl", controlAddr);
  ObjectSet(environment, "config.ethereum.contracts.ftbridgeTokens", tokensAddr);
}

async function deployTokenToVeChain() {

  const nfTokenFilePath = path.join(environment.contractdir, '/common/Contract_NativeFungibleToken.sol');
  const nfTokenAbi = JSON.parse(compileContract(nfTokenFilePath, 'NativeFungibleToken', 'abi'));
  const nfTokenBin = compileContract(nfTokenFilePath, 'NativeFungibleToken', 'bytecode');
  let nfTokenContract = new VContract({ abi: nfTokenAbi, connex: environment.connex, bytecode: nfTokenBin });

  const fTokenFilePath = path.join(environment.contractdir, '/common/Contract_FungibleToken.sol');
  const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
  const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
  let fTokenContract = new VContract({ abi: fTokenAbi, connex: environment.connex, bytecode: fTokenBin });

  const wTokenFilePath = path.join(environment.contractdir, '/common/Contract_BridgeWrappedToken.sol');
  const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
  const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
  let wTokenContract = new (environment.web3 as Web3).eth.Contract(wTokenAbi, undefined, { data: wTokenBin });

  const value = ReadlineSync.question('Enter exists token address (empty will deploy new contract):').trim().toLowerCase();
  let originTokenInfo = {
    address: '',
    name: '',
    symbol: '',
    decimals: 0,
    nativeCoin: false,
    taddress: '',
    tchainname: '',
    tchainid: '',
    beginNum: 0,
    reward: 0
  }
  let bridgeWrappedTokenInfo = {
    address: '',
    name: '',
    symbol: '',
    taddress: '',
    tchainname: '',
    tchainid: '',
    decimals: 0,
    beginNum: 0,
    reward: 0
  }

  try {
    const gasPrice = await (environment.web3 as Web3).eth.getGasPrice();
    if (isAddress(value)) {
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
        taddress: '',
        tchainname: String(environment.config.ethereum.chainName),
        tchainid: String(environment.config.ethereum.chainId),
        beginNum: 0,
        reward: 0
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
        taddress: '',
        tchainname: String(environment.config.ethereum.chainName),
        tchainid: String(environment.config.ethereum.chainId),
        beginNum: 0,
        reward: 0
      }
    }
    const nativecoin = ReadlineSync.question('Is VeChain native coin?(y/n)').trim().toLowerCase();
    originTokenInfo.nativeCoin = nativecoin == 'y' ? true : false;

    const reward = ReadlineSync.question('Set token reward (0 - 1000):').trim();
    originTokenInfo.reward = Number(reward);

    let wname = ReadlineSync.question(`Ethereum bridge wrapped token name (default ${'Bridge Wrapped ' + originTokenInfo.name}):`).trim();
    let wsymbol = ReadlineSync.question(`Ethereum bridge wrapped token symbol (default ${'W' + originTokenInfo.symbol.substring(1)}):`).trim();

    bridgeWrappedTokenInfo = {
      address: '',
      name: wname.length > 0 ? wname : 'Bridge Wrapped ' + originTokenInfo.name,
      symbol: wsymbol.length > 0 ? wsymbol : 'W' + originTokenInfo.symbol.substring(1),
      decimals: originTokenInfo.decimals,
      taddress: '',
      tchainname: String(environment.config.vechain.chainName),
      tchainid: String(environment.config.vechain.chainId),
      beginNum: 0,
      reward: Number(reward)
    }

    console.info('\r\nOrigin Token Info:');
    console.info(`address: ${originTokenInfo.address}`);
    console.info(`name: ${originTokenInfo.name} symbol: ${originTokenInfo.symbol} decimals: ${originTokenInfo.decimals} reward: ${originTokenInfo.reward}`);

    console.info('\r\nBridge Wrapped Token Info:');
    console.info(`address: ${bridgeWrappedTokenInfo.address}`);
    console.info(`name: ${bridgeWrappedTokenInfo.name} symbol: ${bridgeWrappedTokenInfo.symbol} decimals: ${bridgeWrappedTokenInfo.decimals}`);

    let comfirmMsg: string = "";
    if (!isAddress(originTokenInfo.address) && originTokenInfo.nativeCoin == true) {
      comfirmMsg = "WARNNING:Mainnet and Testnet already exists NativeFungibleToken Contract, Continue to deploy & register the token? (y/n)";
    } else {
      comfirmMsg = "Continue to deploy & register the token? (y/n)";
    }
    const next = ReadlineSync.question(comfirmMsg).trim().toLocaleLowerCase();
    if (next == 'n') {
      console.info('Quit deploy');
      return;
    }

    if (!isAddress(originTokenInfo.address)) {
      console.info(`--> Step1/4: Deploy ${originTokenInfo.symbol} token to VeChain.`);
      let clause1;
      if (originTokenInfo.nativeCoin == true) {
        clause1 = nfTokenContract.deploy(0, originTokenInfo.name, originTokenInfo.symbol, originTokenInfo.decimals);
      } else {
        clause1 = fTokenContract.deploy(0, originTokenInfo.name, originTokenInfo.symbol, originTokenInfo.decimals);
      }
      const txrep1 = await (environment.connex as Framework).vendor.sign('tx', [clause1])
        .signer((environment.wallet as SimpleWallet).list[0].address)
        .request();
      const receipt1 = await getReceipt(environment.connex, 5, txrep1.txid);
      if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
        console.error('Deploy token faild.');
        return;
      }
      originTokenInfo.address = receipt1.outputs[0].contractAddress;
    } else {
      console.info(`--> Step1/4: Skip deploy ${originTokenInfo.symbol} token to VeChain.`);
    }

    console.info(`--> Step2/4: Deploy ${bridgeWrappedTokenInfo.symbol} token to Ethereum`);
    const deployMethod = wTokenContract.deploy({ data: wTokenBin, arguments: [bridgeWrappedTokenInfo.name, bridgeWrappedTokenInfo.symbol, bridgeWrappedTokenInfo.decimals, environment.config.ethereum.contracts.ftBridge] });
    const deployGas = await deployMethod.estimateGas({
      from: environment.master
    });
    wTokenContract = await deployMethod.send({
      from: environment.master,
      gas: deployGas,
      gasPrice: gasPrice
    });

    bridgeWrappedTokenInfo.address = wTokenContract.options.address;
    originTokenInfo.taddress = bridgeWrappedTokenInfo.address;
    bridgeWrappedTokenInfo.taddress = originTokenInfo.address;

    console.info(`--> Step3/4: Register ${originTokenInfo.symbol} to VeChain bridge`);
    const vbestBlock = (environment.connex as Framework).thor.status.head.number;
    let clause2;
    if (originTokenInfo.nativeCoin == true) {
      clause2 = (environment.contracts.vechain.ftbridgeTokens as VContract).send('setWrappedNativeCoin', 0,
        originTokenInfo.address, originTokenInfo.taddress, originTokenInfo.tchainname, originTokenInfo.tchainid, vbestBlock, 0, originTokenInfo.reward);
    } else {
      clause2 = (environment.contracts.vechain.ftbridgeTokens as VContract).send('setToken', 0,
        originTokenInfo.address, 1, originTokenInfo.taddress, originTokenInfo.tchainname, originTokenInfo.tchainid, vbestBlock, 0, originTokenInfo.reward);
    }
    const txrep2 = await (environment.connex as Framework).vendor.sign('tx', [clause2])
      .signer(environment.master)
      .request();
    const receipt2 = await getReceipt(environment.connex, 5, txrep2.txid);
    if (receipt2 == null || receipt2.reverted) {
      console.error(`Register token faild. txid: ${txrep2.txid}`);
      return;
    }

    console.info(`--> Step4/4: Register ${bridgeWrappedTokenInfo.symbol} to Ethereum`);
    const eBestBlock = (await (environment.web3 as Web3).eth.getBlock('latest')).number;

    const setMethod = (environment.contracts.ethereum.ftbridgeTokens as EContract).methods.setToken(
      bridgeWrappedTokenInfo.address, 2, bridgeWrappedTokenInfo.taddress, bridgeWrappedTokenInfo.tchainname, bridgeWrappedTokenInfo.tchainid, eBestBlock, 0, bridgeWrappedTokenInfo.reward);
    const setGas = await setMethod.estimateGas({
      from: environment.master
    });
    wTokenContract = await setMethod.send({
      from: environment.master,
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

async function deployTokenToEthereum() {

  const nfTokenFilePath = path.join(environment.contractdir, '/common/Contract_NativeFungibleToken.sol');
  const nfTokenAbi = JSON.parse(compileContract(nfTokenFilePath, 'NativeFungibleToken', 'abi'));
  const nfTokenBin = compileContract(nfTokenFilePath, 'NativeFungibleToken', 'bytecode');
  let nfTokenContract = new (environment.web3 as Web3).eth.Contract(nfTokenAbi);

  const fTokenFilePath = path.join(environment.contractdir, '/common/Contract_FungibleToken.sol');
  const fTokenAbi = JSON.parse(compileContract(fTokenFilePath, 'FungibleToken', 'abi'));
  const fTokenBin = compileContract(fTokenFilePath, 'FungibleToken', 'bytecode');
  let fTokenContract = new (environment.web3 as Web3).eth.Contract(fTokenAbi);

  const wTokenFilePath = path.join(environment.contractdir, '/common/Contract_BridgeWrappedToken.sol');
  const wTokenAbi = JSON.parse(compileContract(wTokenFilePath, 'BridgeWrappedToken', 'abi'));
  const wTokenBin = compileContract(wTokenFilePath, 'BridgeWrappedToken', 'bytecode');
  let wTokenContract = new VContract({ abi: wTokenAbi, connex: environment.connex, bytecode: wTokenBin });

  console.log('Deploy and register token to Ethereum');
  const value = ReadlineSync.question('Enter exists token address (empty will deploy new contract):').trim().toLowerCase();
  let originTokenInfo = {
    address: '',
    name: '',
    symbol: '',
    decimals: 0,
    nativeCoin: false,
    taddress: '',
    tchainname: '',
    tchainid: '',
    beginNum: 0,
    reward: 0
  }
  let bridgeWrappedTokenInfo = {
    address: '',
    name: '',
    symbol: '',
    taddress: '',
    tchainname: '',
    tchainid: '',
    decimals: 0,
    beginNum: 0,
    reward: 0
  }

  try {
    const gasPrice = await (environment.web3 as Web3).eth.getGasPrice();
    if (isAddress(value)) {
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
        taddress: '',
        tchainname: String(environment.config.vechain.chainName),
        tchainid: String(environment.config.vechain.chainId),
        beginNum: 0,
        reward: 0
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
        taddress: '',
        tchainname: String(environment.config.vechain.chainName),
        tchainid: String(environment.config.vechain.chainId),
        beginNum: 0,
        reward: 0
      }
    }
    const nativecoin = ReadlineSync.question('Is Ethereum Native Coin?(y/n)').trim().toLowerCase();
    originTokenInfo.nativeCoin = nativecoin == 'y' ? true : false;

    const reward = ReadlineSync.question('Set token reward (0 - 1000):').trim();
    originTokenInfo.reward = Number(reward);

    let wname = ReadlineSync.question(`VeChain bridge wrapped token name (default ${'Bridge Wrapped ' + originTokenInfo.name}):`).trim();
    let wsymbol = ReadlineSync.question(`VeChain bridge wrapped token symbol (default ${'V' + originTokenInfo.symbol.substring(1)}):`).trim();

    bridgeWrappedTokenInfo = {
      address: '',
      name: wname.length > 0 ? wname : 'Bridge Wrapped ' + originTokenInfo.name,
      symbol: wsymbol.length > 0 ? wsymbol : 'V' + originTokenInfo.symbol.substring(1),
      decimals: originTokenInfo.decimals,
      taddress: '',
      tchainname: String(environment.config.ethereum.chainName),
      tchainid: String(environment.config.ethereum.chainId),
      beginNum: 0,
      reward: Number(reward)
    }

    console.info('\r\nOrigin Token Info:');
    console.info(`address: ${originTokenInfo.address}`);
    console.info(`name: ${originTokenInfo.name} symbol: ${originTokenInfo.symbol} decimals: ${originTokenInfo.decimals}`);

    console.info('\r\nBridge Wrapped Token Info:');
    console.info(`address: ${bridgeWrappedTokenInfo.address}`);
    console.info(`name: ${bridgeWrappedTokenInfo.name} symbol: ${bridgeWrappedTokenInfo.symbol} decimals: ${bridgeWrappedTokenInfo.decimals}`);

    let comfirmMsg: string = "";
    if (!isAddress(originTokenInfo.address) && originTokenInfo.nativeCoin == true) {
      comfirmMsg = "WARNNING:Mainnet and Testnet already exists NativeFungibleToken Contract, Continue to deploy & register the token? (y/n)";
    } else {
      comfirmMsg = "Continue to deploy & register the token? (y/n)";
    }
    const next = ReadlineSync.question(comfirmMsg).trim().toLocaleLowerCase();
    if (next == 'n') {
      console.info('Quit deploy');
      return;
    }


    if (!isAddress(originTokenInfo.address)) {
      console.log(`--> Step1/4: Deploy ${originTokenInfo.symbol} token to Ethereum.`);
      let deployMethod;
      if (originTokenInfo.nativeCoin == true) {
        deployMethod = nfTokenContract.deploy({ data: nfTokenBin, arguments: [originTokenInfo.name, originTokenInfo.symbol, originTokenInfo.decimals] })
      } else {
        deployMethod = fTokenContract.deploy({ data: fTokenBin, arguments: [originTokenInfo.name, originTokenInfo.symbol, originTokenInfo.decimals] });
      }
      const deployGas = await deployMethod.estimateGas({
        from: environment.master
      });

      fTokenContract = await deployMethod.send({
        from: environment.master,
        gas: deployGas,
        gasPrice: gasPrice
      });
      originTokenInfo.address = fTokenContract.options.address;
    } else {
      console.info(`--> Step1/4: Skip deploy ${originTokenInfo.symbol} token to Ethereum.`);
    }

    console.info(`--> Step2/4: Deploy ${bridgeWrappedTokenInfo.symbol} token to VeChain`);
    const clause1 = wTokenContract.deploy(0,
      bridgeWrappedTokenInfo.name, bridgeWrappedTokenInfo.symbol, bridgeWrappedTokenInfo.decimals, environment.config.vechain.contracts.ftBridge);
    const txrep1 = await (environment.connex as Framework).vendor.sign('tx', [clause1])
      .signer(environment.master)
      .request();
    const receipt1 = await getReceipt(environment.connex, 5, txrep1.txid);
    if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
      console.error(`Deploy token faild. txid: ${txrep1.txid}`);
      return;
    }
    bridgeWrappedTokenInfo.address = receipt1.outputs[0].contractAddress;
    originTokenInfo.taddress = bridgeWrappedTokenInfo.address;
    bridgeWrappedTokenInfo.taddress = originTokenInfo.address;

    console.log(`--> Step3/4: Register ${originTokenInfo.symbol} to Ethereum bridge`);
    const eBestBlock = (await (environment.web3 as Web3).eth.getBlock('latest')).number;
    let setMethod;
    let setGas;
    if (originTokenInfo.nativeCoin == true) {
      setMethod = (environment.contracts.ethereum.ftbridgeTokens as EContract).methods.setWrappedNativeCoin(
        originTokenInfo.address, originTokenInfo.taddress, originTokenInfo.tchainname, originTokenInfo.tchainid, eBestBlock, 0, originTokenInfo.reward);
      setGas = await setMethod.estimateGas({
        from: environment.master
      });
    } else {
      setMethod = (environment.contracts.ethereum.ftbridgeTokens as EContract).methods.setToken(
        originTokenInfo.address, 1, originTokenInfo.taddress, originTokenInfo.tchainname, originTokenInfo.tchainid, eBestBlock, 0, originTokenInfo.reward);
      setGas = await setMethod.estimateGas({
        from: environment.master
      });
    }

    wTokenContract = await setMethod.send({
      from: environment.master,
      gas: setGas,
      gasPrice: gasPrice
    });

    console.log(`--> Step4/4: Register ${bridgeWrappedTokenInfo.symbol} to VeChain bridge`);
    const vbestBlock = (environment.connex as Framework).thor.status.head.number;
    const clause2 = (environment.contracts.vechain.ftbridgeTokens as VContract).send('setToken', 0,
      bridgeWrappedTokenInfo.address, 2, bridgeWrappedTokenInfo.taddress, bridgeWrappedTokenInfo.tchainname, bridgeWrappedTokenInfo.tchainid, vbestBlock, 0, bridgeWrappedTokenInfo.reward);
    const txrep2 = await (environment.connex as Framework).vendor.sign('tx', [clause2])
      .signer(environment.master)
      .request();
    const receipt2 = await getReceipt(environment.connex, 5, txrep2.txid);
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

async function addValidator() {
  try {
    await initVeChainValidator();
    await initEthereumValiator();

    const validator = ReadlineSync.question('Add new validator address to contract:').trim();

    console.info(`--> Step1/2: Register validator ${validator} to VeChain bridge`);
    const clause = await environment.contracts.vechain.bridgeValidator.send('addValidator', 0, validator);
    const txRep = await environment.connex.vendor.sign('tx', [clause])
      .signer((environment.wallet as SimpleWallet).list[0].address)
      .request();
    const receipt = await getReceipt(environment.connex, 5, txRep.txid);
    if (receipt == null || receipt.reverted) {
      console.error(`Add new validator to contract faild. txid: ${txRep.txid}`);
      return;
    }

    console.info(`--> Step2/2: Register validator ${validator} to Ethereum bridge`);
    const gasPrice = await (environment.web3 as Web3).eth.getGasPrice();
    const addValidatorMethod = environment.contracts.ethereum.bridgeValidator.methods.addValidator(validator) as ContractSendMethod;
    const gas = await addValidatorMethod.estimateGas({
      from: environment.master
    });
    await addValidatorMethod.send({
      from: (environment.wallet as SimpleWallet).list[0].address,
      gas: gas,
      gasPrice: gasPrice
    });
    console.info('Add validator finish');

  } catch (error) {
    console.error(`Deploy Token faild. error:${error}`);
    return;
  }
}

function initVeChainValidator() {
  let bridgeValidator = environment.contracts.vechain.bridgeValidator as VContract;
  if (isAddress(environment.config.vechain?.contracts?.bridgeValidator)) {
    bridgeValidator.at(environment.config.vechain?.contracts?.bridgeValidator);
  } else {
    const addr = ReadlineSync.question('Set VeChain bridge valiator address:').trim();
    bridgeValidator.at(addr);
    ObjectSet(environment, "config.vechain.contracts.bridgeValidator", addr);
  }
}

function initEthereumValiator() {
  let bridgeValidator = environment.contracts.ethereum.bridgeValidator as EContract;
  if (isAddress(environment.config.ethereum?.contracts?.bridgeValidator)) {
    bridgeValidator.options.address = environment.config.ethereum?.contracts?.bridgeValidator;
  } else {
    const addr = ReadlineSync.question('Set Ethereum bridge validator address:').trim();
    bridgeValidator.options.address = addr;
    ObjectSet(environment, "config.ethereum.contracts.bridgeValidator", addr);
  }
}

run(argv);
