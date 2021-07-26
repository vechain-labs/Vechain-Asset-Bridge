import Web3 from "web3";
import path from 'path';
import { SimpleWallet } from "@vechain/connex-driver";
import fs from 'fs';
import  assert  from 'assert';
import * as Devkit from 'thor-devkit';
import { Contract as EthContract } from "web3-eth-contract";
import { compileContract } from "myvetools/dist/utils";

export class WETHTestCase{
    public web3!:Web3;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname,'../test.config.json');
    public config:any = {};

    private contractPath = path.join(__dirname,"../../../src/SmartContracts/contracts/ethereum/Contract_wEth.sol");
    private contract!:EthContract

    public async init(){
        if(fs.existsSync(this.configPath)){
            this.config = require(this.configPath);
            try {
                this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));

                let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
                for(let index = 0; index < 10; index++){
                    let account = masterNode.derive(index);
                    this.wallet.import(account.privateKey!.toString('hex'));
                    this.web3.eth.accounts.wallet.add(account.privateKey!.toString('hex'));
                }

                const abi = JSON.parse(compileContract(this.contractPath,"WETH9","abi"));
                this.contract = new this.web3.eth.Contract(abi);

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy():Promise<string>{
        if(this.config.ethereum.contracts.wEth != undefined && this.config.ethereum.contracts.wEth.length == 42){
            this.contract.options.address = this.config.ethereum.contracts.wEth;
        } else {

            try {
                const cdata = compileContract(this.contractPath, 'WETH9', 'bytecode');
                this.contract = await this.contract.deploy({data:cdata}).send({
                    from:this.wallet.list[0].address,
                    gas:1000000,
                    gasPrice:"1"
                });
                this.config.ethereum.contracts.wEth = this.contract.options.address;
                fs.writeFileSync(this.configPath,JSON.stringify(this.config));
            } catch (error) {
                assert.fail(`deploy faild: ${error}`);
            }
        }
        return this.config.ethereum.contracts.wEth;
    }

    public async deposit(){
        const amount = 100000;

        const beforeTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());
        const beforeETHBalance = BigInt(await this.web3.eth.getBalance(this.wallet.list[1].address));
        let receipt:any = {}

        try {
            receipt = await this.contract.methods.deposit().send({
                from: this.wallet.list[1].address,
                gasPrice: "1",
                gas: 300000,
                value: amount
            });
        } catch (error) {
            assert.fail(`WETH deposit faild: ${error}`);
        }
        const afterTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());
        const afterETHBalance = BigInt(await this.web3.eth.getBalance(this.wallet.list[1].address)); 

        assert.strictEqual(afterTokenBalance - beforeTokenBalance,BigInt(amount));
        assert.strictEqual(beforeETHBalance - afterETHBalance,BigInt(amount + receipt.gasUsed));
    }

    public async withdraw(){
        const amount = 100;

        const beforeTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());
        const beforeETHBalance = BigInt(await this.web3.eth.getBalance(this.wallet.list[1].address));
        let receipt:any = {}

        try {
            receipt = await this.contract.methods.withdraw(amount).send({
                from: this.wallet.list[1].address,
                gasPrice: "1",
                gas: 300000
            });
        } catch (error) {
            assert.fail(`WETH withdraw faild: ${error}`);
        }
        const afterTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());
        const afterETHBalance = BigInt(await this.web3.eth.getBalance(this.wallet.list[1].address)); 

        assert.strictEqual(beforeTokenBalance - afterTokenBalance,BigInt(amount));
        assert.strictEqual(afterETHBalance - beforeETHBalance,BigInt(amount - receipt.gasUsed));
    }
}

describe('WEth Contract test',() =>{
    let testcase:WETHTestCase = new WETHTestCase();

    before( async () => {
        await testcase.init();
    });

    it("deploy WEth contract", async() =>{
        await testcase.deploy();
    });

    it("deposit WEth", async() =>{
        await testcase.deposit();
    });

    it("withdraw WEth", async() =>{
        await testcase.withdraw();
    });
});