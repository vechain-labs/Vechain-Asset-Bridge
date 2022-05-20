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
import { ZeroRoot } from '../common/utils/types/bridgeSnapshoot';
import { abi, keccak256, RLP } from 'thor-devkit';

const node_host:string = 'http://47.57.94.244:8680';    //Solo network
const mnemonic = 'denial kitchen pet squirrel other broom bar gas better priority spoil cross';
const contractDir:string = path.join(__dirname,'../common/contracts/');
const vechainName = 'vechain';
const vechainId = '0x01';

describe('BridgeCore Test',() => {
    let connex:Framework;
    let wallet:SimpleWallet;
    let bridgecoreContract:Contract;
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

    it('setMaster', async() => {
        const clause = bridgecoreContract.send('setMaster',0,wallet.list[1].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore setMaster faild,txid ${txrep.txid}`);
        }

        const call = await bridgecoreContract.call('master');
        const newMaster = String(call.decoded[0]);
        assert.strictEqual(newMaster,wallet.list[1].address);
    });

    it('setGovernance', async() => {
        const clause = bridgecoreContract.send('setGovernance',0,wallet.list[1].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore setGovernance faild,txid ${txrep.txid}`);
        }
        
        const call = await bridgecoreContract.call('governance');
        const newGov = String(call.decoded[0]);
        assert.strictEqual(newGov,wallet.list[1].address);
    });

    it('setValidator', async() => {
        const clause = bridgecoreContract.send('setValidator',0,wallet.list[1].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore setValidator faild,txid ${txrep.txid}`);
        }
        
        const call = await bridgecoreContract.call('validator');
        const newValidator = String(call.decoded[0]);
        assert.strictEqual(newValidator,wallet.list[1].address);
    });

    it('setMasterLock', async() => {
        const clause1 = bridgecoreContract.send('setMasterLock',0,true);
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`BridgeCore setMasterLock faild,txid ${txrep1.txid}`);
        }

        const call1 = await bridgecoreContract.call('masterLocked');
        assert.strictEqual(call1.decoded[0],true);

        const clause2 = bridgecoreContract.send('setMasterLock',0,false);
        const txrep2 = await connex.vendor.sign('tx',[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txrep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`BridgeCore setMasterLock faild,txid ${txrep2.txid}`);
        }

        const call2 = await bridgecoreContract.call('masterLocked');
        assert.strictEqual(call2.decoded[0],false);
    });

    it('setGovLock', async() => {
        const clause1 = bridgecoreContract.send('setGovLock',0,true);
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[1].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`BridgeCore setGovLock faild,txid ${txrep1.txid}`);
        }

        const call1 = await bridgecoreContract.call('govLocked');
        assert.strictEqual(call1.decoded[0],true);

        const clause2 = bridgecoreContract.send('setGovLock',0,false);
        const txrep2 = await connex.vendor.sign('tx',[clause2])
            .signer(wallet.list[1].address)
            .request();
        const recp2 = await getReceipt(connex,6,txrep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`BridgeCore setGovLock faild,txid ${txrep2.txid}`);
        }

        const call2 = await bridgecoreContract.call('govLocked');
        assert.strictEqual(call2.decoded[0],false);
    });

    it('new Appid', async() => {
        const clause = bridgecoreContract.send('newAppid',0,wallet.list[1].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore newAppid faild,txid ${txrep.txid}`);
        }
        appid = recp.outputs[0]?.events[0]?.topics[1];
    });

    it('update admin', async() => {
        const clause = bridgecoreContract.send('updateAdmin',0,appid,wallet.list[2].address);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore updateAdmin faild,txid ${txrep.txid}`);
        }

        const call = await bridgecoreContract.call('appids',appid);
        const admin = call.decoded[0];
        assert.strictEqual(admin,wallet.list[2].address);
    });

    it('add contract', async() => {
        const clause = bridgecoreContract.send('addContract',0,appid,wallet.list[3].address); 
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[2].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore addContract faild,txid ${txrep.txid}`);
        }

        const call = await bridgecoreContract.call('contractMap',wallet.list[3].address);
        const id = call.decoded[0];
        assert.strictEqual(id,appid);
    });

    it('del contract', async() => {
        const clause = bridgecoreContract.send('addContract',0,appid,wallet.list[4].address); 
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[2].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore addContract faild,txid ${txrep.txid}`);
        }

        const call = await bridgecoreContract.call('contractMap',wallet.list[4].address);
        const id = call.decoded[0];
        assert.strictEqual(id,appid);

        const clause1 = bridgecoreContract.send('delContract',0,appid,wallet.list[4].address)
        const txrep1 = await connex.vendor.sign('tx',[clause1])
            .signer(wallet.list[2].address)
            .request();
        const recp1 = await getReceipt(connex,6,txrep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`BridgeCore delContract faild,txid ${txrep.txid}`);
        }
        
        const call1 = await bridgecoreContract.call('contractMap',wallet.list[4].address);
        const id1 = call1.decoded[0];
        assert.strictEqual(id1,ZeroRoot());
    });

    it('submit hash',async() => {
        const hash = '0x98d79089bf6ea51730cd6799bc891ad5aba6842ba47f69c58d6e80806e7b6a71';
        const clause = bridgecoreContract.send('submitHash',0,appid,hash);
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[3].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore submithash faild,txid ${txrep.txid}`);
        }

        const eappid = recp.outputs[0]?.events[0]?.topics[1];
        const ehash = recp.outputs[0]?.events[0]?.topics[3];
        assert.strictEqual(appid,eappid);
        assert.strictEqual(hash,ehash);
    });

    it('update merkleroot',async() => {
        const mocTree = MerkleTree.createNewTree();

        const hash = '0x38f30d0bd11590957ebe755fc35eda8528355138423d44b53999e3441fe27500';
        const buff = Buffer.concat([
            Buffer.from(appid.substring(2),'hex'),
            Buffer.from(hash.substring(2),'hex')
        ]);
        const leaf = '0x' + keccak256(buff).toString('hex');

        mocTree.addHash('0x82f77861d86321414c0ae3b67d17a2c30feebe0e61ae3b9d6fe545eb5152c597');
        mocTree.addHash('0xe57d0f7f0c89d04c079aeaac1a86610d0985e22e85b9afd521d16e72c781c626');
        mocTree.addHash('0x2348f6b4de9e404d85f420a4bd8436dce8691ce41ffb647cb482b32ef361299d');
        mocTree.addHash('0x45b0cfc220ceec5b7c1c62c4d4193d38e4eba48e8815729ce75f9c0ab0e4c1c0');
        mocTree.addHash(leaf);

        mocTree.buildTree();
        const root = mocTree.getRoot();
        const proof = mocTree.getMerkleProof(leaf);

        const profile:RLP.Profile = {
            name:'range',
            kind:[
                {name:'begin',kind:new RLP.NumericKind(32)},
                {name:'end',kind:new RLP.NumericKind(32)}
            ]
        };

        const rlp = new RLP(profile);
        const args = rlp.encode({begin:10000,end:23000});

        const clause = bridgecoreContract.send('updateMerkleRoot',0,root,'0x' + args.toString('hex'));
        const txrep = await connex.vendor.sign('tx',[clause])
            .signer(wallet.list[1].address)
            .request();
        const recp = await getReceipt(connex,6,txrep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`BridgeCore updateMerkleRoot faild,txid ${txrep.txid}`);
        }

        const updateEvent = new abi.Event(bridgecoreContract.ABI('UpdateMerkleRoot','event') as any);
        const decode = updateEvent.decode(recp.outputs[0].events[0].data,recp.outputs[0].events[0].topics);
        const eroot = decode[0] as string;
        const eargs = rlp.decode(decode[1]);

        const indexOf = (await bridgecoreContract.call('rootList',1)).decoded[0];
        const valueOf = (await bridgecoreContract.call('rootInfo',root)).decoded[0];

        assert.strictEqual(indexOf,root);
        assert.strictEqual(valueOf,'1');
        assert.strictEqual(eargs.begin,10000);
        assert.strictEqual(eargs.end,23000);

        const call2 = await bridgecoreContract.call('proofVerify',root,appid,hash,proof);
        assert.strictEqual(call2.decoded[0],true);
    });
});