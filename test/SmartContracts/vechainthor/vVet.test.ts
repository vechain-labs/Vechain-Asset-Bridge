import { Driver, SimpleNet, SimpleWallet, Wallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as Devkit from 'thor-devkit';
import  assert  from 'assert';
import path from 'path';
import { compileContract } from 'myvetools/dist/utils';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import fs from 'fs';

export class VVETTestCase{
    public connex!: Framework;
	public driver!: Driver;
    public wallet = new SimpleWallet();
    public contract!:Contract;

    public configPath = path.join(__dirname,'../test.config.json');
    public config:any = {};

    public async init(){
        if(fs.existsSync(this.configPath)){
            this.config = require(this.configPath);

            let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
            for(let index = 0; index < 10; index++){
                let account = masterNode.derive(index);
                this.wallet.import(account.privateKey!.toString('hex'));
            }

            try {
                this.driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string),this.wallet);
                this.connex = new Framework(this.driver);

                const filePath = path.join(__dirname,"../../../src/SmartContracts/contracts/vechainthor/Contract_vVet.sol");
                const abi = JSON.parse(compileContract(filePath, 'VVET', 'abi'));
                const bin = compileContract(filePath, 'VVET', 'bytecode');

                this.contract = new Contract({ abi: abi, connex: this.connex, bytecode: bin });
            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy():Promise<string>{
        if(this.config.vechain.contracts.vVet != undefined && this.config.vechain.contracts.vVet.length == 42){
            this.contract.at(this.config.vechain.contracts.vVet);
        } else {
            const clause1 = this.contract.deploy(0);

            const txRep: Connex.Vendor.TxResponse = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[0].address)
            .request();

            const receipt = await getReceipt(this.connex, 5, txRep.txid);
            if(receipt == null || receipt.reverted){
                assert.fail("vVET deploy faild");
            }

            this.contract.at(receipt.outputs[0]!.contractAddress!);
            this.config.vechain.contracts.vVet = receipt.outputs[0].contractAddress;

            try {
                fs.writeFileSync(this.configPath,JSON.stringify(this.config));
            } catch (error) {
                assert.fail("save config faild");
            }
        }
        return this.config.vechain.contracts.vVet;
    }

    public async deposit(){
        const amount = 100000;

        // get balance before deposit
        const call1 = await this.contract.call('balanceOf',this.wallet.list[1].address);
        const beforeTokenBalance = BigInt(call1.decoded[0]);
        const beforeVetBalance = (await this.connex.thor.account(this.wallet.list[1].address).get()).balance;


        const clause1 = await this.contract.send('deposit',amount);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[1].address)
                .request();

        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);
        if(receipt1 != null && receipt1.reverted == false){
            const call2 = await this.contract.call('balanceOf',this.wallet.list[1].address);
            const afterTokenBalance = BigInt(call2.decoded[0]);
            const afterVETBalance = (await this.connex.thor.account(this.wallet.list[1].address).get()).balance;

            assert.strictEqual(afterTokenBalance - beforeTokenBalance,BigInt(amount));
            assert.strictEqual(BigInt(beforeVetBalance) - BigInt(afterVETBalance),BigInt(amount));
        }
    }

    public async withdraw(){
        const amount = 100;

        const call1 = await this.contract.call('balanceOf',this.wallet.list[1].address);
        const beforeTokenBalance = BigInt(call1.decoded[0]);
        const beforeVetBalance = (await this.connex.thor.account(this.wallet.list[1].address).get()).balance;

        const clause1 = await this.contract.send('withdraw',0,amount);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[1].address)
                .request();
        
        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);

        if(receipt1 == null || receipt1.reverted){
            assert.fail("withdraw faild");
        }

        const call2 = await this.contract.call('balanceOf',this.wallet.list[1].address);
        const afterTokenBalance = BigInt(call2.decoded[0]);
        const afterVETBalance = (await this.connex.thor.account(this.wallet.list[1].address).get()).balance;

        assert.strictEqual(beforeTokenBalance - afterTokenBalance,BigInt(amount));
        assert.strictEqual(BigInt(afterVETBalance) - BigInt(beforeVetBalance),BigInt(amount));
    }
}

describe('VVet Contract test',() =>{ 
    
    let testcase:VVETTestCase = new VVETTestCase();

    before( async () => {
        await testcase.init();
    });

    it("deploy VVet contract", async() => {
        await testcase.deploy();
    });

    it("deposit VVet", async() => {
        await testcase.deposit();
    });

    it("withdraw VVet", async() => {
        await testcase.withdraw();
    });
})

