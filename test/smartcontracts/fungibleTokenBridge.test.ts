import { SimpleNet } from '@vechain/connex-driver';
import { Driver } from '@vechain/connex-driver';
import { SimpleWallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import  assert, { strictEqual }  from 'assert';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import { compileContract } from 'myvetools/dist/utils';
import path from 'path';
import * as Devkit from 'thor-devkit';
import 'mocha';
import MerkleTree from '../common/utils/merkleTree';
import { bridgeTxId, BridgeTxType, SwapBridgeTx, swapTxHash } from '../common/utils/types/bridgeTx';
import { BridgeSnapshoot, ZeroRoot } from '../common/utils/types/bridgeSnapshoot';
import BridgeStorage from '../common/bridgeStorage';

const node_host:string = `http://47.57.94.244:8680`;    //Solo network
const mnemonic = `denial kitchen pet squirrel other broom bar gas better priority spoil cross`;
const contractDir:string = path.join(__dirname,`../common/contracts/`);
const vechainName = `vechain`;
const vechainId = `0x01`;
const ethchainName = `ethereum`;
const ethchainId = `0x02`;

describe(`FungibleToken Bridge Test`,() =>{
    let connex:Framework;
    let wallet:SimpleWallet;
    let bridgeContract:Contract;
    let storageContract:Contract;
    let vvetContract:Contract;
    let fungibleToken:Contract;
    let bridgeWrappedToken:Contract;

    before( async () => {
        try {
            wallet = new SimpleWallet();
            let masterNode = Devkit.HDNode.fromMnemonic((mnemonic.split(' ')));
            for(let index = 0; index < 10; index++){
                let account = masterNode.derive(index);
                wallet.import(account.privateKey!.toString('hex'));
            }
            const driver = await Driver.connect(new SimpleNet(node_host),wallet);
            connex = new Framework(driver);

            const bridgeFilePath = path.join(contractDir,`/common/Contract_FTokenBridge.sol`);
            const bridgeAbi = JSON.parse(compileContract(bridgeFilePath,`FTokenBridge`,`abi`));
            const bridgeCode = compileContract(bridgeFilePath,`FTokenBridge`,`bytecode`);
            bridgeContract = new Contract({abi:bridgeAbi,connex:connex,bytecode:bridgeCode});

            const storageFilePath = path.join(contractDir,`/common/Contract_FTokenStorage.sol`);
            const storageAbi = JSON.parse(compileContract(storageFilePath,`FTokenStorage`,`abi`));
            const storageCode = compileContract(storageFilePath,`FTokenStorage`,`bytecode`);
            storageContract = new Contract({abi:storageAbi,connex:connex,bytecode:storageCode});

        } catch (error) {
            assert.fail(`Init faild ${error}`)
        }
    });

    it(`deploy`, async() => {
        const clause = bridgeContract.deploy(0,vechainName,vechainId);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[0].address)
            .request(); 
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted || recp.outputs[0]?.contractAddress == null){
            assert.fail(`FTokenBridge deploy faild,txid ${txRep.txid}`);
        }
        bridgeContract.at(recp.outputs[0]!.contractAddress!);

        const clause1 = storageContract.deploy(0,bridgeContract.address);
        const txRep1:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[0].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted || recp1.outputs[0]?.contractAddress == null){
            assert.fail(`FTokenStorage deploy faild,txid ${txRep1.txid}`);
        }
        storageContract.at(recp1.outputs[0]!.contractAddress!);

        const clause2 = bridgeContract.send(`setTokenStorage`,0,storageContract.address);
        const txRep2:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause2])
            .signer(wallet.list[0].address)
            .request();
        const recp2 = await getReceipt(connex,6,txRep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`setTokenStorage faild,txid ${txRep2.txid}`);
        }

        assert.ok(true,`FTokenBridge address ${recp.outputs[0]!.contractAddress}`);
    });

    it(`setMaster`, async() => {
        const clause = bridgeContract.send(`setMaster`,0,wallet.list[1].address);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FTokenBridge setMaster faild,txid ${txRep.txid}`);
        }
        
        const call = await bridgeContract.call(`master`);
        const newMaster = String(call.decoded[0]);
        assert.strictEqual(newMaster,wallet.list[1].address);
    });

    it(`setGovernance`, async() => {
        const clause = bridgeContract.send(`setGovernance`,0,wallet.list[1].address);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FTokenBridge setGovernance faild,txid ${txRep.txid}`);
        }
        
        const call = await bridgeContract.call(`governance`);
        const newGov = String(call.decoded[0]);
        assert.strictEqual(newGov,wallet.list[1].address);
    });

    it(`setValidator`, async() => {
        const clause = bridgeContract.send(`setValidator`,0,wallet.list[1].address);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FTokenBridge setValidator faild,txid ${txRep.txid}`);
        }
        
        const call = await bridgeContract.call(`validator`);
        const newValidator = String(call.decoded[0]);
        assert.strictEqual(newValidator,wallet.list[1].address);
    });

    it(`setMasterLock`, async() => {
        const clause1 = bridgeContract.send(`setMasterLock`,0,true);
        const txRep1:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`FTokenBridge setMasterLock faild,txid ${txRep1.txid}`);
        }

        const call1 = await bridgeContract.call(`masterLocked`);
        assert.strictEqual(Number(call1.decoded[0]),1);

        const clause2 = bridgeContract.send(`setMasterLock`,0,false);
        const txRep2:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txRep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`FTokenBridge setMasterLock faild,txid ${txRep2.txid}`);
        }

        const call2 = await bridgeContract.call(`masterLocked`);
        assert.strictEqual(Number(call2.decoded[0]),0);
    });

    it(`setGovLock`, async() => {
        const clause1 = bridgeContract.send(`setGovLock`,0,true);
        const txRep1:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`FTokenBridge setGovLock faild,txid ${txRep1.txid}`);
        }

        const call1 = await bridgeContract.call(`govLocked`);
        assert.strictEqual(Number(call1.decoded[0]),1);

        const clause2 = bridgeContract.send(`setGovLock`,0,false);
        const txRep2:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txRep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`FTokenBridge setGovLock faild,txid ${txRep2.txid}`);
        }

        const call2 = await bridgeContract.call(`govLocked`);
        assert.strictEqual(Number(call2.decoded[0]),0);
    });

    it(`updateMerkleRoot`, async() => {
        const mocTree = MerkleTree.createNewTree();
        mocTree.addHash(`0x82f77861d86321414c0ae3b67d17a2c30feebe0e61ae3b9d6fe545eb5152c597`);
        mocTree.addHash(`0x38f30d0bd11590957ebe755fc35eda8528355138423d44b53999e3441fe27500`);
        mocTree.addHash(`0xe57d0f7f0c89d04c079aeaac1a86610d0985e22e85b9afd521d16e72c781c626`);
        mocTree.addHash(`0x2348f6b4de9e404d85f420a4bd8436dce8691ce41ffb647cb482b32ef361299d`);
        mocTree.addHash(`0x45b0cfc220ceec5b7c1c62c4d4193d38e4eba48e8815729ce75f9c0ab0e4c1c0`);
        mocTree.buildTree();
        const root = mocTree.getRoot();
        const proof = mocTree.getMerkleProof(`0x38f30d0bd11590957ebe755fc35eda8528355138423d44b53999e3441fe27500`);

        const clause1 = bridgeContract.send(`updateMerkleRoot`,0,root,["0x10000","0x20000"]);
        const txRep1 = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`updateMerkleRoot faild, txid ${txRep1.txid}`);
        }

        const call1 = await bridgeContract.call(`merkleroots`,root);
        const value1 = Boolean(call1.decoded[0]);
        assert.strictEqual(value1,true);

        const call2 = await bridgeContract.call(`proofVerify`,root,"0x38f30d0bd11590957ebe755fc35eda8528355138423d44b53999e3441fe27500",proof);
        const value2 = Boolean(call2.decoded[0]);
        assert.strictEqual(value2,true);
    });

    it(`register VVET`, async() => {
        const vvetFile = path.join(__dirname,`./testcontracts/Contract_VVET.sol`);
        const vvetAbi = JSON.parse(compileContract(vvetFile,`VVET`,`abi`));
        const vvetCode = compileContract(vvetFile,`VVET`,`bytecode`);
        vvetContract = new Contract({connex:connex,abi:vvetAbi,bytecode:vvetCode});

        const clause1 = vvetContract.deploy(0);
        const txRep1:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[0].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1.reverted || recp1.outputs[0].contractAddress == null){
            assert.fail(`VVET deploy faild, txid ${txRep1.txid}`);
        }
        vvetContract.at(recp1.outputs[0].contractAddress!);

        const vvetInfo = {
            token:recp1.outputs[0].contractAddress!,
            type:1,
            ttoken:`0x0000000000000000000000000000000000000001`,
            tchainname:ethchainName,
            tchainid:ethchainId,
            begin:recp1.meta.blockNumber,
            end:0
        }

        const clause2 = bridgeContract.send(`setWrappedNativeCoin`,0,vvetInfo.token,vvetInfo.ttoken,vvetInfo.tchainname,vvetInfo.tchainid,vvetInfo.begin,vvetInfo.end);
        const txRep2:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txRep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`setWrappedNativeCoin faild, txid ${txRep2.txid}`);
        }

        const call1 = await bridgeContract.call(`tokenActivate`,vvetInfo.token);
        const isActived = Boolean(call1.decoded[0]);
        assert.strictEqual(isActived,true);
    });

    it(`swap nativeCoin`,async () => {
        const amount = 1000000;

        const accBalanceBefore = BigInt((await connex.thor.account(wallet.list[1].address).get()).balance);
        const conVVETBalanceBefore = BigInt((await vvetContract.call(`balanceOf`,bridgeContract.address)).decoded[0]);

        const clause1 = bridgeContract.send(`swapNativeCoin`,amount,wallet.list[2].address);
        const txRep1 = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`swapNativeCoin faild, txid:${txRep1.txid}`);
        }

        const accBalanceAfter = BigInt((await connex.thor.account(wallet.list[1].address).get()).balance);
        const conVVETBalanceAfter = BigInt((await vvetContract.call(`balanceOf`,bridgeContract.address)).decoded[0]);

        assert.strictEqual(accBalanceBefore-accBalanceAfter,BigInt(amount));
        assert.strictEqual(conVVETBalanceAfter-conVVETBalanceBefore,BigInt(amount));
    });

    it(`claim nativeCoin`, async() => {
        let mocSwapTx:SwapBridgeTx = {
            bridgeTxId:"",
            chainName:ethchainName,
            chainId:ethchainId,
            blockNumber:0,
            blockId:"0xab7b9f3313d8f57a4da17a7f019300f0f982876210efc3290e9e459458b53465",
            txid:"0xe53b4c5c27ddd07e46f485c2daac72d525912ac5e288e70ab050b4a9311e9745",
            clauseIndex:0,
            index:0,
            token:"0x0000000000000000000000000000000000000001",
            amount:BigInt(100),
            timestamp:1641880868,
            recipient:wallet.list[2].address,
            type:BridgeTxType.swap,
            swapTxHash:"",
            from:wallet.list[1].address,
            reward:BigInt(0),
            swapCount:BigInt(2)
        }
        mocSwapTx.bridgeTxId = bridgeTxId(mocSwapTx);
        mocSwapTx.swapTxHash = swapTxHash(mocSwapTx);
        const newSn:BridgeSnapshoot = {
            merkleRoot:ZeroRoot(),
            chains:[
                {
                    chainName:vechainName,
                    chainId:vechainId,
                    beginBlockNum:100000,
                    endBlockNum:0
                },
                {
                    chainName:ethchainName,
                    chainId:ethchainId,
                    beginBlockNum:100000,
                    endBlockNum:0
                }
            ]
        }
        let newStorage = new BridgeStorage();
        newStorage.buildTree(newSn,[mocSwapTx]);

        const root = newStorage.getMerkleRoot();
        const proof = newStorage.getMerkleProof(mocSwapTx.swapTxHash);

        const accBalanceBefore = BigInt((await connex.thor.account(wallet.list[2].address).get()).balance);

        const clause1 = bridgeContract.send(`updateMerkleRoot`,0,root,["0x10000","0x20000"]);
        const txRep1 = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`updateMerkleRoot faild, txid ${txRep1.txid}`);
        }

        const clause2 = bridgeContract.send(`claimNativeCoin`,0,mocSwapTx.recipient,Number(mocSwapTx.amount - mocSwapTx.reward),Number(mocSwapTx.swapCount),root,proof);
        const txRep2 = await connex.vendor.sign(`tx`,[clause2])
            .signer(wallet.list[2].address)
            .request();
        const recp2 = await getReceipt(connex,6,txRep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`claimNativeCoin faild, txid ${txRep1.txid}`);
        }

        const accBalanceAfter = BigInt((await connex.thor.account(wallet.list[2].address).get()).balance);
        assert.strictEqual((accBalanceAfter - accBalanceBefore),(mocSwapTx.amount - mocSwapTx.reward));
    });
});