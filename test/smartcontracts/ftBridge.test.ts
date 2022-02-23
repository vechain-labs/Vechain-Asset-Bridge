import { SimpleNet } from '@vechain/connex-driver';
import { Driver } from '@vechain/connex-driver';
import { SimpleWallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import  assert  from 'assert';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import { compileContract } from 'myvetools/dist/utils';
import path from 'path';
import * as Devkit from 'thor-devkit';
import 'mocha';
import MerkleTree from '../common/utils/merkleTree';
import { BridgeSnapshoot, ZeroRoot } from '../common/utils/types/bridgeSnapshoot';
import { keccak256, RLP } from 'thor-devkit';
import { bridgeTxId, BridgeTxType, SwapBridgeTx, swapTxHash } from '../common/utils/types/bridgeTx';
import BridgeStorage from '../common/utils/bridgeStorage';

const node_host:string = 'http://47.57.94.244:8680';    //Solo network
const mnemonic = 'denial kitchen pet squirrel other broom bar gas better priority spoil cross';
const contractDir:string = path.join(__dirname,'../common/contracts/');
const vechainName = 'vechain';
const vechainId = '0x01';
const ethchainName = `ethereum`;
const ethchainId = `0x02`;

describe('FTBridge Test',() => {
    let connex:Framework;
    let wallet:SimpleWallet;
    let bridgecoreContract:Contract;
    let ftbridgeControlContract:Contract;
    let ftbridgeTokensContract:Contract;
    let ftbridgeContract:Contract;
    let vvetContract:Contract;
    let appid:string;

    before( async() => {
        try {
            wallet = new SimpleWallet();
            let masterNode = Devkit.HDNode.fromMnemonic((mnemonic.split(' ')));
            for(let index = 0; index < 10; index++){
                let account = masterNode.derive(index);
                wallet.import(account.privateKey!.toString('hex'));
            }
            const driver = await Driver.connect(new SimpleNet(node_host),wallet);
            connex = new Framework(driver);

            const bridgeCoreFilePath = path.join(contractDir,'/common/Contract_BridgeCore.sol');
            const bridgeCoreAbi = JSON.parse(compileContract(bridgeCoreFilePath,'BridgeCore','abi'));
            const bridgeCoreCode = compileContract(bridgeCoreFilePath,'BridgeCore','bytecode');
            bridgecoreContract = new Contract({abi:bridgeCoreAbi,connex:connex,bytecode:bridgeCoreCode});

            const ftbridgeControlFilePath = path.join(contractDir,'/common/Contract_FTBridgeControl.sol');
            const ftbridgeControlAbi = JSON.parse(compileContract(ftbridgeControlFilePath,'FTBridgeControl','abi'));
            const ftbridgeControlCode = compileContract(ftbridgeControlFilePath,'FTBridgeControl','bytecode');
            ftbridgeControlContract = new Contract({abi:ftbridgeControlAbi,connex:connex,bytecode:ftbridgeControlCode});

            const ftbridgeTokensFilePath = path.join(contractDir,'/common/Contract_FTBridgeTokens.sol');
            const ftbridgeTokensAbi = JSON.parse(compileContract(ftbridgeTokensFilePath,'FTBridgeTokens','abi'));
            const ftbridgeTokensCode = compileContract(ftbridgeTokensFilePath,'FTBridgeTokens','bytecode');
            ftbridgeTokensContract = new Contract({abi:ftbridgeTokensAbi,connex:connex,bytecode:ftbridgeTokensCode});

            const ftbridgeFilePath = path.join(contractDir,'/common/Contract_FTBridge.sol');
            const ftbridgeAbi = JSON.parse(compileContract(ftbridgeFilePath,'FTBridge','abi'));
            const ftbridgeCode = compileContract(ftbridgeFilePath,'FTBridge','bytecode');
            ftbridgeContract = new Contract({abi:ftbridgeAbi,connex:connex,bytecode:ftbridgeCode});
            
        } catch (error) {
            assert.fail(`Init faild ${error}`)
        }
    });

    it('deploy BridgeCore', async() => {
        const clause = bridgecoreContract.deploy(0,vechainName,vechainId);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[0].address)
            .request(); 
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted || recp.outputs[0]?.contractAddress == null){
            assert.fail(`BridgeCore deploy faild,txid ${txrep.txid}`);
        }
        bridgecoreContract.at(recp.outputs[0]!.contractAddress!);
    });

    it('deploy FTBridge', async() => {
        const clause = ftbridgeControlContract.deploy(0);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted || recp.outputs[0]?.contractAddress == null){
            assert.fail(`FTBridgeControl deploy faild,txid ${txrep.txid}`);
        }
        ftbridgeControlContract.at(recp.outputs[0]?.contractAddress);

        const clause1 = ftbridgeTokensContract.deploy(0,ftbridgeControlContract.address);
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[0].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted || recp1.outputs[0]?.contractAddress == null){
            assert.fail(`FTBridgeTokens deploy faild,txid ${txrep.txid}`);
        }
        ftbridgeTokensContract.at(recp1.outputs[0]?.contractAddress);

        const clause2 = ftbridgeContract.deploy(0,vechainName,vechainId,ftbridgeControlContract.address,ftbridgeTokensContract.address);
        const txrep2 = await connex.vendor.sign('tx',[clause2])
            .signer(wallet.list[0].address)
            .request();
        const recp2 = await getReceipt(connex,6,txrep2.txid);
        if(recp2 == null || recp2.reverted || recp2.outputs[0]?.contractAddress == null){
            assert.fail(`FTBridgedeploy faild,txid ${txrep.txid}`);
        }
        ftbridgeContract.at(recp2.outputs[0]?.contractAddress);
    });

    it('init BridgeCore', async() => {
        const clause = bridgecoreContract.send('setValidator',0,wallet.list[1].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore setValidator faild,txid ${txrep.txid}`);
        }

        const clause1 = bridgecoreContract.send('newAppid',0,wallet.list[1].address);
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[0].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`BridgeCore newAppid faild,txid ${txrep.txid}`);
        }
        appid = recp1.outputs[0]?.events[0]?.topics[1];

        const clause2 = bridgecoreContract.send('addContract',0,appid,ftbridgeContract.address);
        const txrep2 = await connex.vendor.sign('tx',[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txrep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`BridgeCore addContract faild,txid ${txrep.txid}`);
        }
    });

    it('setMaster', async() => {
        const clause = ftbridgeControlContract.send('setMaster',0,wallet.list[1].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FTBridgeControl setMaster faild,txid ${txrep.txid}`);
        }

        const call = await ftbridgeControlContract.call('master');
        const newMaster = String(call.decoded[0]);
        assert.strictEqual(newMaster,wallet.list[1].address);
    });

    it('setGovernance', async() => {
        const clause = ftbridgeControlContract.send('setGovernance',0,wallet.list[1].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FTBridgeControl setGovernance faild,txid ${txrep.txid}`);
        }
        
        const call = await ftbridgeControlContract.call('governance');
        const newGov = String(call.decoded[0]);
        assert.strictEqual(newGov,wallet.list[1].address);
    });

    it('setBridgeCore', async() =>{
        const clause = ftbridgeContract.send('setBridgeCore',0,bridgecoreContract.address,appid);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FTBridgeControl setBridgeCore faild,txid ${txrep.txid}`);
        }

        const call = await ftbridgeContract.call('bridgeCore');
        const bridgeAdd = call.decoded[0];
        assert.strictEqual(bridgeAdd,bridgecoreContract.address);
    });

    it('setMasterLock', async() => {
        const clause1 = ftbridgeControlContract.send('setMasterLock',0,true);
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`FTBridgeControl setMasterLock faild,txid ${txrep1.txid}`);
        }

        const call1 = await ftbridgeControlContract.call('masterLocked');
        assert.strictEqual(call1.decoded[0],true);

        const clause2 = ftbridgeControlContract.send('setMasterLock',0,false);
        const txrep2 = await connex.vendor.sign('tx',[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txrep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`FTBridgeControl setMasterLock faild,txid ${txrep2.txid}`);
        }

        const call2 = await ftbridgeControlContract.call('masterLocked');
        assert.strictEqual(call2.decoded[0],false);
    });

    it('setGovLock', async() => {
        const clause1 = ftbridgeControlContract.send('setGovLock',0,true);
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`FTBridgeControl setGovLock faild,txid ${txrep1.txid}`);
        }

        const call1 = await ftbridgeControlContract.call('govLocked');
        assert.strictEqual(call1.decoded[0],true);

        const clause2 = ftbridgeControlContract.send('setGovLock',0,false);
        const txrep2 = await connex.vendor.sign('tx',[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txrep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`FTBridgeControl setGovLock faild,txid ${txrep2.txid}`);
        }

        const call2 = await ftbridgeControlContract.call('govLocked');
        assert.strictEqual(call2.decoded[0],false);
    });

    it('register VVET', async() => {
        const vvetFile = path.join(__dirname,'./testcontracts/Contract_VVET.sol');
        const vvetAbi = JSON.parse(compileContract(vvetFile,'VVET','abi'));
        const vvetCode = compileContract(vvetFile,'VVET','bytecode');
        vvetContract = new Contract({connex:connex,abi:vvetAbi,bytecode:vvetCode});

        const clause1 = vvetContract.deploy(0);
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[0].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`VVET deploy faild, txid ${txrep1.txid}`);
        }
        vvetContract.at(recp1.outputs[0].contractAddress!);

        const vvetInfo = {
            token:recp1.outputs[0].contractAddress!,
            type:1,
            ttoken:'0x0000000000000000000000000000000000000001',
            tchainname:ethchainName,
            tchainid:ethchainId,
            begin:recp1.meta.blockNumber,
            end:0,
            reward:1
        }

        const clause2 = ftbridgeTokensContract.send('setWrappedNativeCoin',0,vvetInfo.token,vvetInfo.ttoken,vvetInfo.tchainname,vvetInfo.tchainid,vvetInfo.begin,vvetInfo.end,vvetInfo.reward);
        const txrep2 = await connex.vendor.sign('tx',[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txrep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`setWrappedNativeCoin faild, txid ${txrep2.txid}`);
        }

        const call = await ftbridgeTokensContract.call('wrappedNativeToken');
        const addr = call.decoded[0];
        assert.strictEqual(addr,vvetContract.address);

        const call1 = await ftbridgeTokensContract.call('tokenActivate',vvetInfo.token);
        const isActived = call1.decoded[0];
        assert.strictEqual(isActived,true);
    });

    it('swap nativeCoin',async () => {
        const amount = 1000000;
        const accBalanceBefore = BigInt((await connex.thor.account(wallet.list[1].address).get()).balance);
        const conVVETBalanceBefore = BigInt((await vvetContract.call('balanceOf',ftbridgeContract.address)).decoded[0]);

        const clause1 = ftbridgeContract.send('swapNativeCoin',amount,wallet.list[2].address);
        const txRep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`swapNativeCoin faild, txid:${txRep1.txid}`);
        }

        const accBalanceAfter = BigInt((await connex.thor.account(wallet.list[1].address).get()).balance);
        const conVVETBalanceAfter = BigInt((await vvetContract.call('balanceOf',ftbridgeContract.address)).decoded[0]);

        assert.strictEqual(accBalanceBefore-accBalanceAfter,BigInt(amount));
        assert.strictEqual(conVVETBalanceAfter-conVVETBalanceBefore,BigInt(amount));
    });

    it('claim nativeCoin', async() => {
        let mocSwapTx:SwapBridgeTx = {
            bridgeTxId:"",
            chainName:ethchainName,
            chainId:ethchainId,
            blockNumber:0,
            blockId:'0xab7b9f3313d8f57a4da17a7f019300f0f982876210efc3290e9e459458b53465',
            txid:'0xe53b4c5c27ddd07e46f485c2daac72d525912ac5e288e70ab050b4a9311e9745',
            index:0,
            token:'0x0000000000000000000000000000000000000001',
            amount:BigInt(100),
            timestamp:1641880868,
            recipient:wallet.list[2].address,
            type:BridgeTxType.swap,
            swapTxHash:"",
            from:wallet.list[1].address,
            reward:BigInt(0),
            amountOut:BigInt(100),
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

        newStorage.buildTree(appid,newSn,[mocSwapTx]);

        const root = newStorage.getMerkleRoot();
        const proof = newStorage.getMerkleProof(BridgeStorage.leaf(appid,mocSwapTx.swapTxHash));

        const accBalanceBefore = BigInt((await connex.thor.account(wallet.list[2].address).get()).balance);

        const profile:RLP.Profile = {
            name:'range',
            kind:[
                {name:'from',kind:new RLP.NumericKind(32)},
                {name:'to',kind:new RLP.NumericKind(32)}
            ]
        };

        const rlp = new RLP(profile);
        const args = rlp.encode({from:10000,to:23000});

        const clause1 = bridgecoreContract.send('updateMerkleRoot',0,root,'0x' + args.toString('hex'));
        const txRep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`updateMerkleRoot faild, txid ${txRep1.txid}`);
        }

        const clause2 = ftbridgeContract.send('claimNativeCoin',0,mocSwapTx.recipient,Number(mocSwapTx.amount - mocSwapTx.reward),Number(mocSwapTx.swapCount),root,proof);
        const txRep2 = await connex.vendor.sign(`tx`,[clause2])
            .signer(wallet.list[2].address)
            .request();
        const recp2 = await getReceipt(connex,6,txRep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`claimNativeCoin faild, txid ${txRep2.txid}`);
        }

        const accBalanceAfter = BigInt((await connex.thor.account(wallet.list[2].address).get()).balance);
        assert.strictEqual((accBalanceAfter - accBalanceBefore),(mocSwapTx.amount - mocSwapTx.reward));
    });
});