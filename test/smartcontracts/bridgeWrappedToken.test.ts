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

const node_host:string = `http://47.57.94.244:8680`;    //Solo network
const mnemonic = `denial kitchen pet squirrel other broom bar gas better priority spoil cross`;
const contractDir:string = path.join(__dirname,`../common/contracts/`);


describe(`Bridge Wrapped Token Contract Test`,() =>{
    let connex:Framework;
    let wallet:SimpleWallet;
    let ftContract:Contract;

    const tokenInfo = {
        name:`Test Bridge Wrapped Token`,
        symbol:`BWT`,
        decimals:18
    }

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

            const filePath = path.join(contractDir,`/common/Contract_BridgeWrappedToken.sol`);
            const abi = JSON.parse(compileContract(filePath,`BridgeWrappedToken`,`abi`));
            const code = compileContract(filePath,`BridgeWrappedToken`,`bytecode`);
            ftContract = new Contract({abi:abi,connex:connex,bytecode:code});
        } catch (error) {
            assert.fail(`Init faild ${error}`)
        }
    });

    it(`deploy`, async() => {
        const clause = ftContract.deploy(0,tokenInfo.name,tokenInfo.symbol,tokenInfo.decimals,wallet.list[0].address);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[0].address)
            .request(); 
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FungibleToken deploy faild,txid ${txRep.txid}`);
        }
        ftContract.at(recp.outputs[0]!.contractAddress!);
        assert.ok(true,`FungibleToken address ${recp.outputs[0]!.contractAddress}`);
    });

    it(`check token info`, async() => {
        const call1 = await ftContract.call(`name`);
        assert.strictEqual<string>(String(call1.decoded[0]),tokenInfo.name);
        const call2 = await ftContract.call(`symbol`);
        assert.strictEqual<string>(String(call2.decoded[0]),tokenInfo.symbol);
        const call3 = await ftContract.call(`decimals`);
        assert.strictEqual<number>(Number(call3.decoded[0]),tokenInfo.decimals);
    });

    it(`mint`,async() => {
        const mintAmount = 5000000;

        const call1 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const accountBalanceBefore = BigInt(call1.decoded[0]);
        const call2 = await ftContract.call(`totalSupply`);
        const totalBefore = BigInt(call2.decoded[0]);

        const clause = ftContract.send(`mint`,0,mintAmount);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FungibleToken mint faild,txid ${txRep.txid}`);
        }

        const call3 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const accountBalanceAfter = BigInt(call3.decoded[0]);
        const call4 = await ftContract.call(`totalSupply`);
        const totalAfter = BigInt(call4.decoded[0]);

        assert.strictEqual(accountBalanceAfter - accountBalanceBefore,BigInt(mintAmount));
        assert.strictEqual(totalAfter - totalBefore,BigInt(mintAmount));
    })

    it(`burn`,async() => {
        const burnAmount = 500;
        
        const call1 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const accountBalanceBefore = BigInt(call1.decoded[0]);
        const call2 = await ftContract.call(`totalSupply`);
        const totalBefore = BigInt(call2.decoded[0]);

        const clause = ftContract.send(`burn`,0,burnAmount);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FungibleToken burn faild,txid ${txRep.txid}`);
        }

        const call3 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const accountBalanceAfter = BigInt(call3.decoded[0]);
        const call4 = await ftContract.call(`totalSupply`);
        const totalAfter = BigInt(call4.decoded[0]);

        assert.strictEqual(accountBalanceBefore - accountBalanceAfter,BigInt(burnAmount));
        assert.strictEqual(totalBefore - totalAfter,BigInt(burnAmount));
    });

    it(`transfer`, async() => {
        const amount = 500;

        const call1 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const senderBefore = BigInt(call1.decoded[0]);
        const call2 = await ftContract.call(`balanceOf`,wallet.list[1].address);
        const receiptBefore = BigInt(call2.decoded[0]);

        const clause = ftContract.send(`transfer`,0,wallet.list[1].address,amount);
        const txRep:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause])
            .signer(wallet.list[0].address)
            .request();
        const recp = await getReceipt(connex,6,txRep.txid);
        if(recp == null || recp.reverted){
            assert.fail(`FungibleToken transfer faild,txid ${txRep.txid}`);
        }

        const call3 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const senderAfter = BigInt(call3.decoded[0]);
        const call4 = await ftContract.call(`balanceOf`,wallet.list[1].address);
        const receiptAfter = BigInt(call4.decoded[0]);

        assert.strictEqual(senderBefore - senderAfter,BigInt(amount));
        assert.strictEqual(receiptAfter - receiptBefore,BigInt(amount));
    });

    it(`transferFrom`, async() => {
        const approveAmount = 2000;
        const amount = 500;

        const call1 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const senderBefore = BigInt(call1.decoded[0]);
        const call2 = await ftContract.call(`balanceOf`,wallet.list[1].address);
        const receiptBefore = BigInt(call2.decoded[0]);

        const clause1 = ftContract.send(`approve`,0,wallet.list[2].address,approveAmount);
        const txRep1:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause1])
            .signer(wallet.list[0].address)
            .request();
        const recp1 = await getReceipt(connex,6,txRep1.txid);
        if(recp1 == null || recp1.reverted){
            assert.fail(`FungibleToken approve faild,txid ${txRep1.txid}`);
        }

        const call3 = await ftContract.call(`allowance`,wallet.list[0].address,wallet.list[2].address);
        const allowanceBefore = BigInt(call3.decoded[0]);
        assert.strictEqual(allowanceBefore,BigInt(approveAmount));

        const clause2 = ftContract.send(`transferFrom`,0,wallet.list[0].address,wallet.list[1].address,amount);
        const txRep2:Connex.Vendor.TxResponse = await connex.vendor.sign(`tx`,[clause2])
            .signer(wallet.list[2].address)
            .request();
        const recp2 = await getReceipt(connex,6,txRep2.txid);
        if(recp2 == null || recp2.reverted){
            assert.fail(`FungibleToken transferFrom faild,txid ${txRep2.txid}`);
        }

        const call4 = await ftContract.call(`allowance`,wallet.list[0].address,wallet.list[2].address);
        const allowanceAfter = BigInt(call4.decoded[0]);
        assert.strictEqual(allowanceAfter,allowanceBefore - BigInt(amount));

        const call5 = await ftContract.call(`balanceOf`,wallet.list[0].address);
        const senderAfter = BigInt(call5.decoded[0]);
        const call6 = await ftContract.call(`balanceOf`,wallet.list[1].address);
        const receiptAfter = BigInt(call6.decoded[0]);

        assert.strictEqual(senderBefore - senderAfter,BigInt(amount));
        assert.strictEqual(receiptAfter - receiptBefore,BigInt(amount));
    });
})