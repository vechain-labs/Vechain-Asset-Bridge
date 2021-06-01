import { Driver, SimpleNet, SimpleWallet, Wallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as Devkit from 'thor-devkit';
import  assert  from 'assert';
import path from 'path';
import { compileContract } from 'myvetools/dist/utils';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import fs from 'fs';

export class VETHTestCase {
    public connex!: Framework;
	public driver!: Driver;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname,'./test.config.json');
    public config:any = {};
    public contract!:Contract;

    public async init(){
        if(fs.existsSync(this.configPath)){
            this.config = require(this.configPath);

            let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
            for(let index = 0; index < 10; index++){
                let account = masterNode.derive(index);
                this.wallet.import(account.privateKey!.toString('hex'));
            }

            try {
                this.driver = await Driver.connect(new SimpleNet(this.config.nodeHost as string),this.wallet);
                this.connex = new Framework(this.driver);

                const filePath = path.join(__dirname,"../../../src/SmartContracts/contracts/vechainthor/Contract_vEth.sol");
                const abi = JSON.parse(compileContract(filePath, 'VETH', 'abi'));
                const bin = compileContract(filePath, 'VETH', 'bytecode');

                this.contract = new Contract({ abi: abi, connex: this.connex, bytecode: bin });

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy():Promise<string>{
        if(this.config.contracts.vEthAddr != undefined && this.config.contracts.vEthAddr.length == 42){
            this.contract.at(this.config.contracts.vEthAddr);
        } else {
            const clause1 = this.contract.deploy(0,this.wallet.list[1].address);

            let txRep: Connex.Vendor.TxResponse = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[0].address)
            .request();

            let receipt = await getReceipt(this.connex, 5, txRep.txid);

            if(receipt == null || receipt.reverted){
                assert.fail("vETH deploy faild");
            }

            this.contract.at(receipt.outputs[0]!.contractAddress!);
            this.config.contracts.vEthAddr = receipt.outputs[0].contractAddress;
            try {
                fs.writeFileSync(this.configPath,JSON.stringify(this.config));
            } catch (error) {
                assert.fail("save config faild");
            }
        }
        return this.config.contracts.vEthAddr;
    }

    public async mint(){
        const amount = 100000;

        const call1 = await this.contract.call("totalSupply");
        const beforeTotal = BigInt(call1.decoded[0]);

        const call2 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const beforeBalance = BigInt(call2.decoded[0]);

        const clause1 = this.contract.send("mint",0,this.wallet.list[2].address,amount);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[1].address)
                .request();

        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail("vETH mint faild");
        }

        const call3 = await this.contract.call("totalSupply");
        const afterTotal = BigInt(call3.decoded[0]);

        const call4 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const afterBalance = BigInt(call4.decoded[0]);

        assert.strictEqual(afterTotal - beforeTotal,BigInt(amount));
        assert.strictEqual(afterBalance - beforeBalance,BigInt(amount));
    }

    public async recovery(){
        const amount = 100;

        const call1 = await this.contract.call("totalSupply");
        const beforeTotal = BigInt(call1.decoded[0]);

        const call2 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const beforeBalance = BigInt(call2.decoded[0]);

        const clause1 = this.contract.send("recovery",0,this.wallet.list[2].address,amount);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[1].address)
                .request();
        
        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail("recovery faild");
        }

        const call3 = await this.contract.call("totalSupply");
        const afterTotal = BigInt(call3.decoded[0]);

        const call4 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const afterBalance = BigInt(call4.decoded[0]);

        assert.strictEqual(beforeTotal - afterTotal,BigInt(amount));
        assert.strictEqual(beforeBalance - afterBalance,BigInt(amount));
    }

    public async transfer(){
        const amount = 100;

        const call1 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const beforeBalance1 = BigInt(call1.decoded[0]);

        const call2 = await this.contract.call("balanceOf",this.wallet.list[3].address);
        const beforeBalance2 = BigInt(call2.decoded[0]);

        const clause1 = this.contract.send("transfer",0,this.wallet.list[3].address,amount);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[2].address)
                .request();

        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);

        if(receipt1 == null || receipt1.reverted){
            assert.fail('transfer faild');
        }

        const call3 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const afterBalance1 = BigInt(call3.decoded[0]);

        const call4 = await this.contract.call("balanceOf",this.wallet.list[3].address);
        const afterBalance2 = BigInt(call4.decoded[0]);

        assert.strictEqual(beforeBalance1 - afterBalance1,BigInt(amount));
        assert.strictEqual(afterBalance2 - beforeBalance2,BigInt(amount));
    }

    public async approve(){
        const amount1 = 150;
        const amount2 = 100;

        const call1 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const beforeBalance1 = BigInt(call1.decoded[0]);

        const call2 = await this.contract.call("balanceOf",this.wallet.list[4].address);
        const beforeBalance2 = BigInt(call2.decoded[0]);

        const clause1 = this.contract.send("approve",0,this.wallet.list[3].address,amount1);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[2].address)
                .request();

        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);

        if(receipt1 == null || receipt1.reverted){
            assert.fail('approve faild');
        }
        
        const call3 = await this.contract.call("allowance",this.wallet.list[2].address,this.wallet.list[3].address);
        const allowance1 = BigInt(call3.decoded[0]);

        assert.strictEqual(allowance1,BigInt(amount1));

        const clause2 = this.contract.send("transferFrom",0,this.wallet.list[2].address,this.wallet.list[4].address,amount2);
        const txRep2 = await this.connex.vendor.sign('tx', [clause2])
            .signer(this.wallet.list[3].address)
            .request();

        const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail('transferFrom faild');
        }

        const call4 = await this.contract.call("balanceOf",this.wallet.list[2].address);
        const afterBalance4 = BigInt(call4.decoded[0]);

        const call5 = await this.contract.call("balanceOf",this.wallet.list[4].address);
        const afterBalance5 = BigInt(call5.decoded[0]);

        const call6 = await this.contract.call("allowance",this.wallet.list[2].address,this.wallet.list[3].address);
        const allowance2 = BigInt(call6.decoded[0]);

        assert.strictEqual(beforeBalance1 - afterBalance4,BigInt(amount2));
        assert.strictEqual(afterBalance5 - beforeBalance2,BigInt(amount2));
        assert.strictEqual(allowance2,BigInt(amount1 - amount2));
    }
}

describe('vETH Contract test',() =>{
    let testcase:VETHTestCase = new VETHTestCase();

    before( async () => {
        await testcase.init();
    });

    it("deploy vETH contract", async() => {
        await testcase.deploy();
    });

    it("vEth mint", async() => {
        await testcase.mint();
    });

    it("vEth recovery", async() => {
        await testcase.recovery();
    });

    it("vEth transfer", async() => {
        await testcase.transfer();
    });

    it("vEth approve", async() => {
        await testcase.approve();
    });
})

