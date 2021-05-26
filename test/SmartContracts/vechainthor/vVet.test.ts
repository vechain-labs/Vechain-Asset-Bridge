import { Driver, SimpleNet, SimpleWallet, Wallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as Devkit from 'thor-devkit';
import  assert  from 'assert';
import path from 'path';
import { compileContract } from 'myvetools/dist/utils';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import fs from 'fs';

describe('VVet Contract test',() =>{

    let connex: Framework;
	let driver: Driver;
    let wallet = new SimpleWallet();
    let contract:Contract;

    let configPath = path.join(__dirname,'./test.config.json');
    let config:any = {};
    
    before( async () => {
        if(fs.existsSync(configPath)){
            config = require(configPath);

            let masterNode = Devkit.HDNode.fromMnemonic((config.mnemonic as string).split(' '));
            for(let index = 0; index < 10; index++){
                let account = masterNode.derive(index);
                wallet.import(account.privateKey!.toString('hex'));
            }

            try {
                driver = await Driver.connect(new SimpleNet(config.nodeHost as string),wallet);
                connex = new Framework(driver);

                const filePath = path.join(__dirname,"../../src/SmartContracts/contracts/vechainthor/Contract_vVet.sol");
                const abi = JSON.parse(compileContract(filePath, 'VVET', 'abi'));
                const bin = compileContract(filePath, 'VVET', 'bytecode');

                contract = new Contract({ abi: abi, connex: connex, bytecode: bin });
            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${configPath}`);
        }
    });

    it("deploy VVet contract", async() => {
        if(config.contracts.vVetAddr != undefined && config.contracts.vVetAddr.length == 42){
            contract.at(config.contracts.vVetAddr);
        } else {
            const clause1 = contract.deploy(0);

            const txRep: Connex.Vendor.TxResponse = await connex.vendor.sign('tx', [clause1])
            .signer(wallet.list[0].address)
            .request();

            const receipt = await getReceipt(connex, 5, txRep.txid);
            if (receipt != null && receipt.outputs[0].contractAddress !== null) {
                contract.at(receipt.outputs[0].contractAddress);
                config.contracts.vVetAddr = receipt.outputs[0].contractAddress;

                try {
                    fs.writeFileSync(configPath,JSON.stringify(config));
                } catch (error) {
                    assert.fail("save config faild");
                }
            } else {
                assert.fail("vVET deploy faild");
            }
        }
    });

    it("deposit VVet", async() => {
        const amount = 100000;

        // get balance before deposit
        const call1 = await contract.call('balanceOf',wallet.list[1].address);
        const beforeTokenBalance = BigInt(call1.decoded[0]);
        const beforeVetBalance = (await connex.thor.account(wallet.list[1].address).get()).balance;


        const clause1 = await contract.send('deposit',amount);
        const txRep1 = await connex.vendor.sign('tx', [clause1])
                .signer(wallet.list[1].address)
                .request();

        const receipt1 = await getReceipt(connex, 5, txRep1.txid);
        if(receipt1 != null && receipt1.reverted == false){
            const call2 = await contract.call('balanceOf',wallet.list[1].address);
            const afterTokenBalance = BigInt(call2.decoded[0]);
            const afterVETBalance = (await connex.thor.account(wallet.list[1].address).get()).balance;

            assert.strictEqual(afterTokenBalance - beforeTokenBalance,BigInt(amount));
            assert.strictEqual(BigInt(beforeVetBalance) - BigInt(afterVETBalance),BigInt(amount));
        }
    });

    it("withdraw VVet", async() => {
        const amount = 100;

        const call1 = await contract.call('balanceOf',wallet.list[1].address);
        const beforeTokenBalance = BigInt(call1.decoded[0]);
        const beforeVetBalance = (await connex.thor.account(wallet.list[1].address).get()).balance;

        const clause1 = await contract.send('withdraw',amount,amount);
        const txRep1 = await connex.vendor.sign('tx', [clause1])
                .signer(wallet.list[1].address)
                .request();
        
        const receipt1 = await getReceipt(connex, 5, txRep1.txid);
        if(receipt1 != null && receipt1.reverted == false){
            const call2 = await contract.call('balanceOf',wallet.list[1].address);
            const afterTokenBalance = BigInt(call2.decoded[0]);
            const afterVETBalance = (await connex.thor.account(wallet.list[1].address).get()).balance;

            assert.strictEqual(beforeTokenBalance - afterTokenBalance,BigInt(amount));
            assert.strictEqual(BigInt(afterVETBalance) - BigInt(beforeVetBalance),BigInt(amount));
        } else {
            assert.fail("withdraw faild");
        }
    });
})

