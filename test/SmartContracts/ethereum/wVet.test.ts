import { SimpleWallet } from "@vechain/connex-driver";
import path from "path";
import Web3 from "web3";
import { Contract as EthContract } from "web3-eth-contract";
import fs from 'fs';
import * as Devkit from 'thor-devkit';
import { compileContract } from "myvetools/dist/utils";
import  assert  from 'assert';

export class WVETTestCase {
    public web3!:Web3;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname,'../test.config.json');
    public config:any = {};

    private libPath = path.join(__dirname,"../../../src/SmartContracts/contracts/");
    private contractPath = path.join(__dirname,"../../../src/SmartContracts/contracts/common/Contract_BridgeWrappedToken.sol");
    private contract!:EthContract;

    

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

                const abi = JSON.parse(compileContract(this.contractPath,"BridgeWrappedToken","abi",[this.libPath]));
                this.contract = new this.web3.eth.Contract(abi);

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy(){
        if(this.config.ethereum.contracts.wVet != undefined && this.config.ethereum.contracts.wVet.length == 42){
            this.contract.options.address = this.config.ethereum.contracts.wVet;
        } else {
            let txhash = "";
            try {
                const cdata = compileContract(this.contractPath, 'BridgeWrappedToken', 'bytecode',[this.libPath]);
                const deploy = this.contract.deploy({data:cdata,arguments:["Wrapped VET","WVET",18,this.wallet.list[0].address]});
                
                const gas = await deploy.estimateGas({
                    from:this.wallet.list[0].address
                });
                this.contract = await deploy.send({
                    from:this.wallet.list[0].address,
                    gas:gas,
                    gasPrice:"1"
                }).on("receipt",(receipt) =>{
                    txhash = receipt.transactionHash;
                });
                this.config.ethereum.contracts.wVet = this.contract.options.address;
                fs.writeFileSync(this.configPath,JSON.stringify(this.config));
            } catch (error) {
                assert.fail(`deploy faild: ${error}, txhash:${txhash}`); 
            }
        }
        return this.config.ethereum.contracts.wVet;
    }

    public async mint(){
        const amount = 100000;

        const beforeTokenTotal = BigInt(await this.contract.methods.totalSupply().call());
        const beforeTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[0].address).call());
        let txhash = "";
        try {
            const mint = this.contract.methods.mint(amount);
            const gas = await mint.estimateGas({
                from:this.wallet.list[0].address
            });

            await mint.send({
                from:this.wallet.list[0].address,
                gas:gas,
                gasPrice:"1"
            }).on("receipt",(receipt:any) =>{
                txhash = receipt.transactionHash;
            });
        } catch (error) {
            assert.fail(`WVET mint faild: ${error}`)
        }

        const afterTokenTotal = BigInt(await this.contract.methods.totalSupply().call());
        const afterTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[0].address).call());

        assert.strictEqual(afterTokenTotal - beforeTokenTotal,BigInt(amount));
        assert.strictEqual(afterTokenBalance - beforeTokenBalance,BigInt(amount));
    }

    public async burn(){
        const amount = 100;

        const beforeTokenTotal = BigInt(await this.contract.methods.totalSupply().call());
        const beforeTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[0].address).call());

        try {
            const burn = this.contract.methods.burn(amount);
            const gas = await burn.estimateGas({
                from:this.wallet.list[0].address
            });
            await burn.send({
                from:this.wallet.list[0].address,
                gas:gas,
                gasPrice:"1"
            });
        } catch (error) {
            assert.fail(`WVET burn faild: ${error}`);
        }

        const afterTokenTotal = BigInt(await this.contract.methods.totalSupply().call());
        const afterTokenBalance = BigInt(await this.contract.methods.balanceOf(this.wallet.list[0].address).call());

        assert.strictEqual(beforeTokenTotal - afterTokenTotal,BigInt(amount));
        assert.strictEqual(beforeTokenBalance - afterTokenBalance,BigInt(amount));
    }

    public async transfer(){

        const amount = 10000000;
        let txhash = "";

        const mint = this.contract.methods.mint(amount);
        const gas1 = await mint.estimateGas({
            from:this.wallet.list[0].address
        });
        await mint.send({
            from:this.wallet.list[0].address,
            gas:gas1,
            gasPrice:"1"
        }).on("receipt",(receipt:any) =>{
            txhash = receipt.transactionHash;
        });

        const beforeBalance1 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[0].address).call());
        const beforeBalance2 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());

        const gas2 = await this.contract.methods.transfer(this.wallet.list[1].address,amount).estimateGas({
            from:this.wallet.list[0].address
        });

        await this.contract.methods.transfer(this.wallet.list[1].address,amount).send({
            from:this.wallet.list[0].address,
            gas:gas2,
            gasPrice:"1"
        }).on("receipt",(receipt:any) =>{
            txhash = receipt.transactionHash;
        });

        const afterBalance1 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[0].address).call());
        const afterBalance2 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());

        assert.strictEqual(beforeBalance1 - afterBalance1,BigInt(amount));
        assert.strictEqual(afterBalance2 - beforeBalance2,BigInt(amount));
    }

    public async approve(){
        const amount1 = 150;
        const amount2 = 100;
        let allowance1 = BigInt(0);

        let txhash = "";

        const beforeBalance1 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());
        const beforeBalance2 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[2].address).call());

        try {
            const gas = await this.contract.methods.approve(this.wallet.list[0].address,amount1).estimateGas({
                from:this.wallet.list[1].address
            });
            await this.contract.methods.approve(this.wallet.list[0].address,amount1).send({
                from:this.wallet.list[1].address,
                gas:gas,
                gasPrice:"1"
            }).on("receipt",(receipt:any) =>{
                txhash = receipt.transactionHash;
            });;

            allowance1 = BigInt(await this.contract.methods.allowance(this.wallet.list[1].address,this.wallet.list[0].address).call());
            assert.strictEqual(allowance1,BigInt(amount1));

            const gas2 = await this.contract.methods.transferFrom(this.wallet.list[1].address,this.wallet.list[2].address,amount2).estimateGas({
                from:this.wallet.list[0].address
            });
            await this.contract.methods.transferFrom(this.wallet.list[1].address,this.wallet.list[2].address,amount2).send({
                from:this.wallet.list[0].address,
                gas:gas2,
                gasPrice:"1"
            }).on("receipt",(receipt:any) =>{
                txhash = receipt.transactionHash;
            });
        } catch (error) {
            assert.fail(`wVET approve or transferFrom faild: ${error}, txhash = ${txhash}`);
        }
        
        const afterBalance1 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[1].address).call());
        const afterBalance2 = BigInt(await this.contract.methods.balanceOf(this.wallet.list[2].address).call());
        const allowance2 = BigInt(await this.contract.methods.allowance(this.wallet.list[1].address,this.wallet.list[0].address).call());

        assert.strictEqual(beforeBalance1 - afterBalance1,BigInt(amount2));
        assert.strictEqual(afterBalance2 - beforeBalance2,BigInt(amount2));
        assert.strictEqual(allowance1 - allowance2,BigInt(amount1 - (amount1 - amount2)));
    }
}

describe('wVET Contract test',() =>{
    let testcase:WVETTestCase = new WVETTestCase();

    before( async () => {
        await testcase.init();
    });

    it("deploy vETH contract", async() => {
        await testcase.deploy();
    });

    it("vEth mint", async() => {
        await testcase.mint();
    });

    it("vEth burn", async() => {
        await testcase.burn();
    });

    it("vEth transfer", async() => {
        await testcase.transfer();
    });

    it("vEth approve", async() => {
        await testcase.approve();
    });
})