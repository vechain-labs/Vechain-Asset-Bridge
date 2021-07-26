import Web3 from "web3";
import path from 'path';
import fs, { stat } from 'fs';
import { SimpleWallet } from "@vechain/connex-driver";
import { Contract } from "web3-eth-contract";
import * as Devkit from 'thor-devkit';
import assert from 'assert';
import { compileContract } from "myvetools/dist/utils";

export class E2VBridgeHeadTestCase{

    public web3!:Web3;
    public wallet = new SimpleWallet();
    public configPath = path.join(__dirname,'../test.config.json');
    public config:any = {};

    public wEthContract!:Contract;
    public wVetContract!:Contract;
    public bridgeContract!:Contract;
    

    public async init(){
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);
            
            try {
                this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));
                let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
                for (let index = 0; index < 10; index++) {
                    let account = masterNode.derive(index);
                    this.wallet.import(account.privateKey!.toString('hex'));
                    this.web3.eth.accounts.wallet.add(account.privateKey!.toString('hex'));
                }

                const wEthFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/ethereum/Contract_wEth.sol");
                const wEthAbi = JSON.parse(compileContract(wEthFilePath,"WETH9","abi"));
                this.wEthContract = new this.web3.eth.Contract(wEthAbi,this.config.ethereum.contracts.wEth);

                const wVetFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/ethereum/Contract_wVet.sol");
                const wVetAbi = JSON.parse(compileContract(wVetFilePath,"WVet","abi"));
                this.wEthContract = new this.web3.eth.Contract(wVetAbi,this.config.ethereum.contracts.wVET);

                const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/ethereum/Contract_E2VBridgeHead.sol");
                const bridgeAbi = JSON.parse(compileContract(bridgeFilePath,"E2VBridgeHead","abi"));
                this.bridgeContract = new this.web3.eth.Contract(bridgeAbi,this.config.ethereum.contracts.e2vBridge);

                const verifier = await this.bridgeContract.methods.verifier().call();
                if(verifier.toLowerCase() != this.wallet.list[0].address){
                    const contract = await this.bridgeContract.methods.setVerifier(this.wallet.list[0].address).send({
                        from:this.wallet.list[0].address,
                        gasPrice: '10000000000',
                        gas:30000
                    });
                    const receipt = await this.web3.eth.getTransactionReceipt(contract.transactionHash);
                    if(receipt == null || receipt.status == false){
                        assert.fail("update verifier faild");
                    }
                }
            } catch (error) {
                assert.fail(`init faild`);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async lock():Promise<any>{
        let status:boolean = await this.bridgeContract.methods.locked().call();
        assert.strictEqual(status,false);

        const root = await this.bridgeContract.methods.merkleRoot().call();

        const c1 =  await this.bridgeContract.methods.lock(root).send({
            from:this.wallet.list[0].address,
            gasPrice: '10000000000',
            gas:50000
        });
        const receipt1 = await this.web3.eth.getTransactionReceipt(c1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("lock bridge faild");
        }

        status = await this.bridgeContract.methods.locked().call();
        assert.strictEqual(status,true);

        const c2 = await this.bridgeContract.methods.unlock(root).send({
            from:this.wallet.list[0].address,
            gasPrice: '10000000000',
            gas:50000
        });
        const receipt2 = await this.web3.eth.getTransactionReceipt(c2.transactionHash);
        if(receipt2 == null || receipt2.status == false){
            assert.fail("unlock bridge faild");
        }

        status = await this.bridgeContract.methods.locked().call();
        assert.strictEqual(status,false);
    }

    public async updateMerkleRoot():Promise<any>{
        const root = await this.bridgeContract.methods.merkleRoot().call();
        const newRoot = "0x45b0cfc220ceec5b7c1c62c4d4193d38e4eba48e8815729ce75f9c0ab0e4c1c0";
        const c1 = await this.bridgeContract.methods.lock(root).send({
            from:this.wallet.list[0].address,
            gasPrice: '10000000000',
            gas:100000
        });

        const receipt1 = await this.web3.eth.getTransactionReceipt(c1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("lock bridge faild");
        }

    }
}

describe("E2V bridge test", () => {
    let testcase = new E2VBridgeHeadTestCase();

    before(async () => {
        await testcase.init();
    });

    it("deploy bridge contract", async () => {
        console.log("");
        //await testcase.deploy();
    });
});