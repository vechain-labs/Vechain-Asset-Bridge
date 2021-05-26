import { Driver, SimpleNet, SimpleWallet, Wallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as Devkit from 'thor-devkit';
import  assert  from 'assert';
import path from 'path';
import { compileContract } from 'myvetools/dist/utils';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import fs from 'fs';

describe('vETH Contract test',() =>{

    let connex: Framework;
	let driver: Driver;
    let wallet = new SimpleWallet();

    let configPath = path.join(__dirname,'./test.config.json');
    let config:any = {};
    let contract:Contract;
    
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

                const filePath = path.join(__dirname,"../../src/SmartContracts/contracts/vechainthor/Contract_vEth.sol");
                const abi = JSON.parse(compileContract(filePath, 'VETH', 'abi'));
                const bin = compileContract(filePath, 'VETH', 'bytecode');

                contract = new Contract({ abi: abi, connex: connex, bytecode: bin });

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${configPath}`);
        }
        
    });

    it("deploy vETH contract", async() => {
        if(config.contracts.vEthAddr != undefined && config.contracts.vEthAddr.length == 42){
            contract.at(config.contracts.vEthAddr);
        } else {
            const clause1 = contract.deploy(0,wallet.list[1].address);

            let txRep: Connex.Vendor.TxResponse = await connex.vendor.sign('tx', [clause1])
            .signer(wallet.list[0].address)
            .request();

            let receipt = await getReceipt(connex, 5, txRep.txid);
            if (receipt != null && receipt.outputs[0].contractAddress !== null) {
                contract.at(receipt.outputs[0].contractAddress);
                config.contracts.vEthAddr = receipt.outputs[0].contractAddress;

                try {
                    fs.writeFileSync(configPath,JSON.stringify(config));
                } catch (error) {
                    assert.fail("save config faild");
                }
            } else {
                assert.fail("vETH deploy faild");
            }
        }
    });

    it("vEth mint", async() => {
        const amount = 100000;

        const call1 = await contract.call("totalSupply");
        const beforeTotal = BigInt(call1.decoded[0]);

        const call2 = await contract.call("balanceOf",wallet.list[2].address);
        const beforeBalance = BigInt(call2.decoded[0]);

        const clause1 = contract.send("mint",0,wallet.list[2].address,amount);
        const txRep1 = await connex.vendor.sign('tx', [clause1])
                .signer(wallet.list[1].address)
                .request();

        const receipt1 = await getReceipt(connex, 5, txRep1.txid);
        if(receipt1 != null && !receipt1.reverted){
            const call3 = await contract.call("totalSupply");
            const afterTotal = BigInt(call3.decoded[0]);

            const call4 = await contract.call("balanceOf",wallet.list[2].address);
            const afterBalance = BigInt(call4.decoded[0]);

            assert.strictEqual(afterTotal - beforeTotal,BigInt(amount));
            assert.strictEqual(afterBalance - beforeBalance,BigInt(amount));
        }

    });

    it("vEth recovery", async() => {
        const amount = 100;

        const call1 = await contract.call("totalSupply");
        const beforeTotal = BigInt(call1.decoded[0]);

        const call2 = await contract.call("balanceOf",wallet.list[2].address);
        const beforeBalance = BigInt(call2.decoded[0]);

        const clause1 = contract.send("recovery",0,wallet.list[2].address,amount);
        const txRep1 = await connex.vendor.sign('tx', [clause1])
                .signer(wallet.list[1].address)
                .request();
        
        const receipt1 = await getReceipt(connex, 5, txRep1.txid);
        if(receipt1 != null && !receipt1.reverted){
            const call3 = await contract.call("totalSupply");
            const afterTotal = BigInt(call3.decoded[0]);

            const call4 = await contract.call("balanceOf",wallet.list[2].address);
            const afterBalance = BigInt(call4.decoded[0]);

            assert.strictEqual(beforeTotal - afterTotal,BigInt(amount));
            assert.strictEqual(beforeBalance - afterBalance,BigInt(amount));
        }
    });

    it("vEth transfer", async() => {
        const amount = 100;

        const call1 = await contract.call("balanceOf",wallet.list[2].address);
        const beforeBalance1 = BigInt(call1.decoded[0]);

        const call2 = await contract.call("balanceOf",wallet.list[3].address);
        const beforeBalance2 = BigInt(call2.decoded[0]);

        const clause1 = contract.send("transfer",0,wallet.list[3].address,amount);
        const txRep1 = await connex.vendor.sign('tx', [clause1])
                .signer(wallet.list[2].address)
                .request();

        const receipt1 = await getReceipt(connex, 5, txRep1.txid);
        if(receipt1 != null && !receipt1.reverted){
            const call3 = await contract.call("balanceOf",wallet.list[2].address);
            const afterBalance1 = BigInt(call3.decoded[0]);

            const call4 = await contract.call("balanceOf",wallet.list[3].address);
            const afterBalance2 = BigInt(call4.decoded[0]);

            assert.strictEqual(beforeBalance1 - afterBalance1,BigInt(amount));
            assert.strictEqual(afterBalance2 - beforeBalance2,BigInt(amount));
        }
    });

    it("vEth approve", async() => {
        const amount1 = 150;
        const amount2 = 100;

        const call1 = await contract.call("balanceOf",wallet.list[2].address);
        const beforeBalance1 = BigInt(call1.decoded[0]);

        const call2 = await contract.call("balanceOf",wallet.list[4].address);
        const beforeBalance2 = BigInt(call2.decoded[0]);

        const clause1 = contract.send("approve",0,wallet.list[3].address,amount1);
        const txRep1 = await connex.vendor.sign('tx', [clause1])
                .signer(wallet.list[2].address)
                .request();

        const receipt1 = await getReceipt(connex, 5, txRep1.txid);
        
        if(receipt1 != null && !receipt1.reverted){
            const call3 = await contract.call("allowance",wallet.list[2].address,wallet.list[3].address);
            const allowance1 = BigInt(call3.decoded[0]);

            assert.strictEqual(allowance1,BigInt(amount1));

            const clause2 = contract.send("transferFrom",0,wallet.list[2].address,wallet.list[4].address,amount2);
            const txRep2 = await connex.vendor.sign('tx', [clause2])
                .signer(wallet.list[3].address)
                .request();

            const receipt2 = await getReceipt(connex, 5, txRep2.txid);
            if(receipt2 != null && !receipt2.reverted){
                const call4 = await contract.call("balanceOf",wallet.list[2].address);
                const afterBalance4 = BigInt(call4.decoded[0]);

                const call5 = await contract.call("balanceOf",wallet.list[4].address);
                const afterBalance5 = BigInt(call5.decoded[0]);

                const call6 = await contract.call("allowance",wallet.list[2].address,wallet.list[3].address);
                const allowance2 = BigInt(call6.decoded[0]);

                assert.strictEqual(beforeBalance1 - afterBalance4,BigInt(amount2));
                assert.strictEqual(afterBalance5 - beforeBalance2,BigInt(amount2));
                assert.strictEqual(allowance2,BigInt(amount1 - amount2));
            }
        }

    });
})

