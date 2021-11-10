import Web3 from "web3";
import path from 'path';
import fs, { stat } from 'fs';
import { SimpleWallet } from "@vechain/connex-driver";
import { Contract } from "web3-eth-contract";
import * as Devkit from 'thor-devkit';
import assert from 'assert';
import { compileContract } from "myvetools/dist/utils";
import { BridgeLedger, ledgerHash, ledgerID } from "../../../src/common/utils/types/bridgeLedger";
import { BridgeSnapshoot } from "../../../src/common/utils/types/bridgeSnapshoot";
import BridgeStorage from "../../../src/common/bridgeStorage";

export class E2VBridgeHeadTestCase{

    public web3!:Web3;
    public wallet = new SimpleWallet();
    public configPath = path.join(__dirname,'../test.config.json');
    private libPath = path.join(__dirname,"../../../src/SmartContracts/contracts/");
    public config:any = {};

    public wEthContract!:Contract;
    public wVetContract!:Contract;
    public bridgeContract!:Contract;

    public gasPrice!:string;
    

    public async init(){
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);
            this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));
                let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
                for (let index = 0; index < 10; index++) {
                    let account = masterNode.derive(index);
                    this.wallet.import(account.privateKey!.toString('hex'));
                    this.web3.eth.accounts.wallet.add(account.privateKey!.toString('hex'));
                }
            
            try {
                const wEthFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/ethereum/Contract_wEth.sol");
                const wEthAbi = JSON.parse(compileContract(wEthFilePath,"WETH9","abi"));
                this.wEthContract = new this.web3.eth.Contract(wEthAbi,this.config.ethereum.contracts.wEth.length == 42 ? this.config.ethereum.contracts.wEth : undefined);

                const wVetFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/common/Contract_BridgeWrappedToken.sol");
                const wVetAbi = JSON.parse(compileContract(wVetFilePath,"BridgeWrappedToken","abi",[this.libPath]));
                this.wVetContract = new this.web3.eth.Contract(wVetAbi,this.config.ethereum.contracts.wVet.length == 42 ? this.config.ethereum.contracts.wVet : undefined);

                const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/common/Contract_BridgeHead.sol");
                const bridgeAbi = JSON.parse(compileContract(bridgeFilePath,"BridgeHead","abi",[this.libPath]));
                this.bridgeContract = new this.web3.eth.Contract(bridgeAbi,this.config.ethereum.contracts.e2vBridge.length == 42 ? this.config.ethereum.contracts.e2vBridge : undefined);

                this.gasPrice = await this.web3.eth.getGasPrice();
                console.info(this.gasPrice);

            } catch (error) {
                assert.fail(`init faild`);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy():Promise<string>{
        if(this.config.ethereum.contracts.e2vBridge.length == 42){
            this.bridgeContract.options.address = this.config.ethereum.contracts.e2vBridge;
        } else {
            let startBlockNum = 0;
            let txhash = "";
            try {
                const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/common/Contract_BridgeHead.sol");
                const bytecode = compileContract(bridgeFilePath,"BridgeHead","bytecode",[this.libPath]);

                const gas1 = await this.bridgeContract.deploy({data:bytecode,arguments:[this.config.ethereum.chainName.toString(),this.config.ethereum.chainId.toString()]}).estimateGas({
                    from:this.wallet.list[0].address
                });
                
                this.bridgeContract = await this.bridgeContract.deploy({data:bytecode,arguments:[this.config.ethereum.chainName.toString(),this.config.ethereum.chainId.toString()]}).send({
                    from:this.wallet.list[0].address,
                    gas:gas1,
                    gasPrice:this.gasPrice
                }).on("receipt",function(receipt){
                    txhash = receipt.transactionHash,
                    startBlockNum = receipt.blockNumber;
                });

                const gas2 = await this.bridgeContract.methods.setVerifier(this.wallet.list[1].address).estimateGas({
                    from:this.wallet.list[0].address
                });

                await this.bridgeContract.methods.setVerifier(this.wallet.list[1].address).send({
                    from:this.wallet.list[0].address,
                    gas:gas2,
                    gasPrice:this.gasPrice
                }).on("receipt",function(receipt:any){
                    txhash = receipt.transactionHash
                });

                const gas3 = await this.bridgeContract.methods.setGovernance(this.wallet.list[1].address).estimateGas({
                    from:this.wallet.list[0].address
                });
                await this.bridgeContract.methods.setGovernance(this.wallet.list[1].address).send({
                    from:this.wallet.list[0].address,
                    gas:gas3,
                    gasPrice:this.gasPrice
                }).on("receipt",function(receipt:any){
                    txhash = receipt.transactionHash
                });

                this.config.ethereum.contracts.e2vBridge = this.bridgeContract.options.address;
                this.config.ethereum.startBlockNum = startBlockNum;
                fs.writeFileSync(this.configPath,JSON.stringify(this.config));
            } catch (error) {
                assert.fail(`deploy faild: ${error}, txhash: ${txhash}`);   
            }
        }

        return this.config.ethereum.contracts.e2vBridge;
    }

    public async lock():Promise<any>{
        let status:boolean = await this.bridgeContract.methods.locked().call();
        assert.strictEqual(status,false);

        const root = await this.bridgeContract.methods.merkleRoot().call();

        const gas1 = await this.bridgeContract.methods.lock(root).estimateGas({
            from:this.wallet.list[1].address
        });
        const s1 =  await this.bridgeContract.methods.lock(root).send({
            from:this.wallet.list[1].address,
            gas:gas1,
            gasPrice: this.gasPrice
        });
        const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("lock bridge faild");
        }

        status = await this.bridgeContract.methods.locked().call();
        assert.strictEqual(status,true);

        const gas2 = await this.bridgeContract.methods.unlock(root).estimateGas({
            from:this.wallet.list[1].address
        });
        const s2 = await this.bridgeContract.methods.unlock(root).send({
            from:this.wallet.list[1].address,
            gas:gas2,
            gasPrice: this.gasPrice
        });
        const receipt2 = await this.web3.eth.getTransactionReceipt(s2.transactionHash);
        if(receipt2 == null || receipt2.status == false){
            assert.fail("unlock bridge faild");
        }

        status = await this.bridgeContract.methods.locked().call();
        assert.strictEqual(status,false);
    }

    public async updateMerkleRoot():Promise<any>{
        const root = await this.bridgeContract.methods.merkleRoot().call();
        const newRoot = "0x45b0cfc220ceec5b7c1c62c4d4193d38e4eba48e8815729ce75f9c0ab0e4c1c0";
        const gas1 = await this.bridgeContract.methods.lock(root).estimateGas({
            from:this.wallet.list[1].address
        });
        const s1 = await this.bridgeContract.methods.lock(root).send({
            from:this.wallet.list[1].address,
            gas:gas1,
            gasPrice: this.gasPrice,
        });

        const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("lock bridge faild");
        }

        const gas2 = await this.bridgeContract.methods.updateMerkleRoot(root,newRoot).estimateGas({
            from:this.wallet.list[1].address
        });
        const s2 = await this.bridgeContract.methods.updateMerkleRoot(root,newRoot).send({
            from:this.wallet.list[1].address,
            gas:gas2,
            gasPrice:this.gasPrice
        });

        const receipt2 = await this.web3.eth.getTransactionReceipt(s2.transactionHash);
        if(receipt2 == null || receipt2.status == false){
            assert.fail("lock bridge faild");
        }

        const lockStatus = await this.bridgeContract.methods.locked().call();
        assert.strictEqual(lockStatus,false);

        const markleRoot = await this.bridgeContract.methods.merkleRoot().call();
        assert.strictEqual(markleRoot,newRoot);
    }

    public async swapWETH(){
        const amount = 100000000;

        const gas1 = await this.wEthContract.methods.deposit().estimateGas({
            from:this.wallet.list[2].address,
            value:amount
        });
        const s1 = await this.wEthContract.methods.deposit().send({
            from:this.wallet.list[2].address,
            value:amount,
            gas:gas1,
            gasPrice:this.gasPrice
        });
        const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("deposit WETH faild");
        }

        const beforeBalance = await this.wEthContract.methods.balanceOf(this.config.ethereum.contracts.e2vBridge).call();

        const gas2 = await this.wEthContract.methods.approve(this.config.ethereum.contracts.e2vBridge,amount).estimateGas({
            from:this.wallet.list[2].address
        });
        const s2 = await this.wEthContract.methods.approve(this.config.ethereum.contracts.e2vBridge,amount).send({
            from:this.wallet.list[2].address,
            gas:gas2,
            gasPrice:this.gasPrice
        });
        const receipt2 = await this.web3.eth.getTransactionReceipt(s2.transactionHash);
        if(receipt2 == null || receipt2.status == false){
            assert.fail("approve WETH faild");
        }

        const gas3 = await this.bridgeContract.methods.swap(this.config.ethereum.contracts.wEth,amount,this.wallet.list[3].address).estimateGas({
            from:this.wallet.list[2].address
        });
        const s3 = await this.bridgeContract.methods.swap(this.config.ethereum.contracts.wEth,amount,this.wallet.list[3].address).send({
            from:this.wallet.list[2].address,
            gas:gas3,
            gasPrice:this.gasPrice
        });

        const receipt3 = await this.web3.eth.getTransactionReceipt(s3.transactionHash);
        if(receipt3 == null || receipt3.status == false){
            assert.fail("swap WETH faild");
        }

        const afterBalance = await this.wEthContract.methods.balanceOf(this.config.ethereum.contracts.e2vBridge).call();
        assert.strictEqual(afterBalance - beforeBalance,amount);
    }

    public async claimWETH(){
        let ledgers:Array<BridgeLedger> = [
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[6].address,token:this.config.ethereum.contracts.wEth,balance:BigInt(100)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[7].address,token:this.config.ethereum.contracts.wEth,balance:BigInt(500)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[8].address,token:this.config.ethereum.contracts.wEth,balance:BigInt(50000)},
        ];

        ledgers.forEach(ledger =>{
            ledger.chainName = this.config.ethereum.chainName;
            ledger.chainId = this.config.ethereum.chainId;
            ledger.ledgerid = ledgerID(ledger.chainName,ledger.chainId,ledger.account,ledger.token);
        });

        const bestBlock = await this.web3.eth.getBlockNumber();

        let genesisSnapshoot:BridgeSnapshoot = {
            parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            merkleRoot:"",
            chains:[
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    beginBlockNum:100,
                    lockedBlockNum:100,
                    endBlockNum:bestBlock},
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    beginBlockNum:1000,
                    lockedBlockNum:1000,
                    endBlockNum:bestBlock}
            ]
        }

        let storage:BridgeStorage = new BridgeStorage(genesisSnapshoot,[],ledgers);
        storage.buildTree();

        let newRoot = storage.getMerkleRoot();
        let merkleProof = storage.getMerkleProof(ledgers[1]);

        const root = await this.bridgeContract.methods.merkleRoot().call();
        const gas1 = await this.bridgeContract.methods.lock(root).estimateGas({
            from:this.wallet.list[1].address
        });
        const s1 = await this.bridgeContract.methods.lock(root).send({
            from:this.wallet.list[1].address,
            gas:gas1,
            gasPrice: this.gasPrice,
        });
        const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("lock bridge faild");
        }

        const gas2 = await this.bridgeContract.methods.updateMerkleRoot(root,newRoot).estimateGas({
            from:this.wallet.list[1].address
        });
        const s2 = await this.bridgeContract.methods.updateMerkleRoot(root,newRoot).send({
            from:this.wallet.list[1].address,
            gas:gas2,
            gasPrice:this.gasPrice
        });

        const receipt2 = await this.web3.eth.getTransactionReceipt(s2.transactionHash);
        if(receipt2 == null || receipt2.status == false){
            assert.fail("lock bridge faild");
        }

        const beforeBalance = await this.wEthContract.methods.balanceOf(ledgers[1].account).call();

        const gas3 = await this.bridgeContract.methods.claim(this.config.ethereum.contracts.wEth,ledgers[1].account,ledgers[1].balance,merkleProof).estimateGas({
            from:this.wallet.list[1].address
        });
        const s3 = await this.bridgeContract.methods.claim(this.config.ethereum.contracts.wEth,ledgers[1].account,ledgers[1].balance,merkleProof).send({
            from:this.wallet.list[1].address,
            gas:gas3,
            gasPrice:this.gasPrice
        });
        const receipt3 = await this.web3.eth.getTransactionReceipt(s3.transactionHash);
        if(receipt3 == null || receipt3.status == false){
            assert.fail("lock bridge faild");
        }

        const afterBalance = await this.wEthContract.methods.balanceOf(ledgers[1].account).call();
        
        assert.strictEqual(BigInt(afterBalance) - BigInt(beforeBalance),ledgers[1].balance);

        const claimStatus1 = await this.bridgeContract.methods.isClaim(newRoot,ledgerHash(ledgers[1])).call();

        assert.strictEqual(claimStatus1,true);

        const claimStatus2 = await this.bridgeContract.methods.isClaim(newRoot,ledgerHash(ledgers[2])).call();

        assert.strictEqual(claimStatus2,false);


    }

    public async claimWVET() {
        let ledgers:Array<BridgeLedger> = [
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[6].address,token:this.config.ethereum.contracts.wVet,balance:BigInt(10000000)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[7].address,token:this.config.ethereum.contracts.wVet,balance:BigInt(50000)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[8].address,token:this.config.ethereum.contracts.wVet,balance:BigInt(50000000)},
        ];

        ledgers.forEach(ledger =>{
            ledger.chainName = this.config.ethereum.chainName;
            ledger.chainId = this.config.ethereum.chainId;
            ledger.ledgerid = ledgerID(ledger.chainName,ledger.chainId,ledger.account,ledger.token);
        });

        const bestBlock = await this.web3.eth.getBlockNumber();

        let genesisSnapshoot:BridgeSnapshoot = {
            parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            merkleRoot:"",
            chains:[
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    beginBlockNum:100,
                    lockedBlockNum:100,
                    endBlockNum:bestBlock},
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    beginBlockNum:1000,
                    lockedBlockNum:1000,
                    endBlockNum:bestBlock}
            ]
        }

        let storage:BridgeStorage = new BridgeStorage(genesisSnapshoot,[],ledgers);
        storage.buildTree();

        let newRoot = storage.getMerkleRoot();
        let merkleProof = storage.getMerkleProof(ledgers[1]);

        const root = await this.bridgeContract.methods.merkleRoot().call();

        const gas1 = await this.bridgeContract.methods.lock(root).estimateGas({
            from:this.wallet.list[1].address
        });
        const s1 = await this.bridgeContract.methods.lock(root).send({
            from:this.wallet.list[1].address,
            gas:gas1,
            gasPrice: this.gasPrice,
        });
        const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("lock bridge faild");
        }

        const gas2 = await this.bridgeContract.methods.updateMerkleRoot(root,newRoot).estimateGas({
            from:this.wallet.list[1].address
        });
        const s2 = await this.bridgeContract.methods.updateMerkleRoot(root,newRoot).send({
            from:this.wallet.list[1].address,
            gas:gas2,
            gasPrice:this.gasPrice
        });

        const receipt2 = await this.web3.eth.getTransactionReceipt(s2.transactionHash);
        if(receipt2 == null || receipt2.status == false){
            assert.fail("lock bridge faild");
        }

        const beforeBalance = await this.wVetContract.methods.balanceOf(ledgers[1].account).call();

        const gas3 = await this.bridgeContract.methods.claim(this.config.ethereum.contracts.wVet,ledgers[1].account,ledgers[1].balance,merkleProof).estimateGas({
            from:this.wallet.list[1].address
        });
        const s3 = await this.bridgeContract.methods.claim(this.config.ethereum.contracts.wVet,ledgers[1].account,ledgers[1].balance,merkleProof).send({
            from:this.wallet.list[1].address,
            gas:gas3,
            gasPrice:this.gasPrice
        });
        const receipt3 = await this.web3.eth.getTransactionReceipt(s3.transactionHash);
        if(receipt3 == null || receipt3.status == false){
            assert.fail("claim faild");
        }

        const afterBalance = await this.wVetContract.methods.balanceOf(ledgers[1].account).call();
        
        assert.strictEqual(BigInt(afterBalance) - BigInt(beforeBalance),ledgers[1].balance);

        const claimStatus1 = await this.bridgeContract.methods.isClaim(newRoot,ledgerHash(ledgers[1])).call();

        assert.strictEqual(claimStatus1,true);

        const claimStatus2 = await this.bridgeContract.methods.isClaim(newRoot,ledgerHash(ledgers[2])).call();

        assert.strictEqual(claimStatus2,false);
    }

    public async swapWVET() {

        const beforeBalance = await this.wVetContract.methods.balanceOf(this.wallet.list[7].address).call();
        const amount = beforeBalance / 2;

        const beforeBalance1 = await this.wVetContract.methods.balanceOf(this.config.ethereum.contracts.e2vBridge).call();

        const approveMethod = this.wVetContract.methods.approve(this.config.ethereum.contracts.e2vBridge,amount);

        const gas1 = await approveMethod.estimateGas({
            from:this.wallet.list[7].address
        });
        const s1 = await approveMethod.send({
            from:this.wallet.list[7].address,
            gas:gas1,
            gasPrice:this.gasPrice
        });

        const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
        if(receipt1 == null || receipt1.status == false){
            assert.fail("approve faild");
        }

        const swapMethod = this.bridgeContract.methods.swap(this.config.ethereum.contracts.wVet,amount,this.wallet.list[8].address);
        const gas2 = await swapMethod.estimateGas({
            from:this.wallet.list[7].address
        });
        const s2 = await swapMethod.send({
            from:this.wallet.list[7].address,
            gas:gas2,
            gasPrice:this.gasPrice
        });
        const receipt2 = await this.web3.eth.getTransactionReceipt(s2.transactionHash);
        if(receipt2 == null || receipt2.status == false){
            assert.fail("swap wVet faild");
        }

        const afterBalance1 = await this.wVetContract.methods.balanceOf(this.config.ethereum.contracts.e2vBridge).call();

        assert.strictEqual(afterBalance1 - beforeBalance1,0);
    }

    public async initWETHToken(){
        let wEthAddr = "";
        if(this.config.ethereum.contracts.wEth.length == 42){
            const call = await this.bridgeContract.methods.tokens(this.config.ethereum.contracts.wEth).call();
            const type = Number(call[0]);
            if(type == 1){
                wEthAddr = this.config.ethereum.contracts.wEth;
            } else {
                wEthAddr = await this.deployWETH();
            }
        } else {
            wEthAddr = await this.deployWETH();
        }
        this.wEthContract.options.address = wEthAddr;
    }

    public async initWVETToken(){
        let wVetAddr = "";
        if(this.config.ethereum.contracts.wVet.length == 42){
            const call = await this.bridgeContract.methods.tokens(this.config.ethereum.contracts.wVet).call();
            const type = Number(call[0]);
            if(type == 2){
                wVetAddr = this.config.ethereum.contracts.wVet;
            } else {
                wVetAddr = await this.deployWVET(this.config.ethereum.contracts.e2vBridge);
            }
        } else {
            wVetAddr = await this.deployWVET(this.config.ethereum.contracts.e2vBridge);
        }
        this.wVetContract.options.address = wVetAddr;
    }

    private async deployWETH():Promise<string>{
        const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/ethereum/Contract_wEth.sol");
        const bytecode = compileContract(bridgeFilePath,"WETH9","bytecode"); 
        let txhash = "";

        try {
            const gas = await this.wEthContract.deploy({data:bytecode}).estimateGas({
                from:this.wallet.list[0].address
            });
            this.wEthContract = await this.wEthContract.deploy({data:bytecode}).send({
                from:this.wallet.list[0].address,
                gas:gas,
                gasPrice:this.gasPrice
            }).on("receipt",function(receipt:any){
                txhash = receipt.transactionHash
            });

            this.config.ethereum.contracts.wEth = this.wEthContract.options.address;
    
            const gas2 = await this.bridgeContract.methods.setWrappedNativeCoin(this.config.ethereum.contracts.wEth,"0x0000000000000000000000000000000000000000",this.config.ethereum.startBlockNum,0).estimateGas({
                from:this.wallet.list[1].address
            });
            const s1 = await this.bridgeContract.methods.setWrappedNativeCoin(this.config.ethereum.contracts.wEth,"0x0000000000000000000000000000000000000000",this.config.ethereum.startBlockNum,0).send({
                from:this.wallet.list[1].address,
                gas:gas2,
                gasPrice:this.gasPrice
            }).on("receipt",function(receipt:any){
                txhash = receipt.transactionHash
            });

            const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
            if(receipt1 == null || receipt1.status == false){
                assert.fail("setWrappedNativeCoin faild");
            }
            fs.writeFileSync(this.configPath,JSON.stringify(this.config));
        } catch (error) {
            assert.fail(`deploy WETH faild: ${error}, txhash:${txhash}`);
        }

        return this.config.ethereum.contracts.wEth;
    }

    private async deployWVET(addr:string):Promise<string>{
        const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/common/Contract_BridgeWrappedToken.sol");
        const bytecode = compileContract(bridgeFilePath,"BridgeWrappedToken","bytecode",[this.libPath]);
        let txhash = "";

        try {
            const gas = await this.wVetContract.deploy({data:bytecode,arguments:["Wrapped VET","WVET",18,addr]}).estimateGas({
                from:this.wallet.list[0].address
            });
            this.wVetContract = await this.wVetContract.deploy({data:bytecode,arguments:["Wrapped VET","WVET",18,addr]}).send({
                from:this.wallet.list[0].address,
                gas:gas,
                gasPrice:this.gasPrice
            }).on("receipt",function(receipt:any){
                txhash = receipt.transactionHash
            });
            this.config.ethereum.contracts.wVet = this.wVetContract.options.address;
    
            const gas2 = await this.bridgeContract.methods.setToken(this.config.ethereum.contracts.wVet,2,"0x0000000000000000000000000000000000000000",this.config.ethereum.startBlockNum,0).estimateGas({
                from:this.wallet.list[1].address
            });
            const s1 = await this.bridgeContract.methods.setToken(this.config.ethereum.contracts.wVet,2,"0x0000000000000000000000000000000000000000",this.config.ethereum.startBlockNum,0).send({
                from:this.wallet.list[1].address,
                gas:gas2,
                gasPrice:this.gasPrice
            }).on("receipt",function(receipt:any){
                txhash = receipt.transactionHash
            });
            const receipt1 = await this.web3.eth.getTransactionReceipt(s1.transactionHash);
            if(receipt1 == null || receipt1.status == false){
                assert.fail("setToken faild");
            }
            fs.writeFileSync(this.configPath,JSON.stringify(this.config));
        } catch (error) {
            assert.fail(`deploy WVET faild: ${error}`);
        }

        return this.config.ethereum.contracts.wVet;
    }
}

describe("E2V bridge test", () => {
    let testcase = new E2VBridgeHeadTestCase();

    before(async () => {
        await testcase.init();
    });

    it("deploy bridge contract", async() =>{
        await testcase.deploy();
    });

    it("init WETH token", async() =>{
        await testcase.initWETHToken();
    });

    it("init WVET token", async() =>{
        await testcase.initWVETToken();
    });

    it("lock bridge", async() =>{
        await testcase.lock();
    });

    it("update merkleroot", async()=>{
        await testcase.updateMerkleRoot();
    });

    it("swap WETH",async()=>{
        await testcase.swapWETH();
    });

    it("claim WETH",async()=>{
        await testcase.claimWETH();
    });

    it("claim WVET", async()=>{
        await testcase.claimWVET();
    });

    it("swap WVET",async()=>{
        await testcase.swapWVET();
    });
});