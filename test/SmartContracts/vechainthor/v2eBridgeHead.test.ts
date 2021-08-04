import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import { Contract } from "myvetools";
import path from "path";
import fs from 'fs';
import * as Devkit from 'thor-devkit';
import { compileContract } from "myvetools/dist/utils";
import assert from 'assert';
import { getReceipt } from "myvetools/dist/connexUtils";
import { BridgeLedger, ledgerHash, ledgerID } from "../../../src/ValidationNode/utils/types/bridgeLedger";
import { BridgeSnapshoot } from "../../../src/ValidationNode/utils/types/bridgeSnapshoot";
import BridgeStorage from "../../../src/ValidationNode/server/bridgeStorage";

export class V2EBridgeHeadTestCase {

    public connex!: Framework;
    public driver!: Driver;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname, '../test.config.json');
    public config: any = {};

    public bridgeContract!: Contract;
    public vVetContract!: Contract;
    public vEthContract!: Contract;

    public async init() {
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);
            let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
            for (let index = 0; index < 10; index++) {
                let account = masterNode.derive(index);
                this.wallet.import(account.privateKey!.toString('hex'));
            }

            try {
                this.driver = await Driver.connect(new SimpleNet(this.config.vechain.nodeHost as string), this.wallet);
                this.connex = new Framework(this.driver);

                const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeHead.sol");
                const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'V2EBridgeHead', 'abi'));
                const bridgeBin = compileContract(bridgeFilePath, 'V2EBridgeHead', 'bytecode');
                this.bridgeContract = new Contract({ abi: bridgeAbi, connex: this.connex, bytecode: bridgeBin, address: this.config.vechain.contracts.v2eBridge != "" ? this.config.vechain.contracts.v2eBridge : undefined });

                const vVetFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_vVet.sol");
                const vVetAbi = JSON.parse(compileContract(vVetFilePath, 'VVET', 'abi'));
                const vVetBin = compileContract(vVetFilePath, 'VVET', 'bytecode');
                this.vVetContract = new Contract({ abi: vVetAbi, connex: this.connex, bytecode: vVetBin, address: this.config.vechain.contracts.vVet != "" ? this.config.vechain.contracts.vVet : undefined });

                const vEthFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_vEth.sol");
                const vEthAbi = JSON.parse(compileContract(vEthFilePath, 'VETH', 'abi'));
                const vEthBin = compileContract(vEthFilePath, 'VETH', 'bytecode');
                this.vEthContract = new Contract({ abi: vEthAbi, connex: this.connex, bytecode: vEthBin, address: this.config.vechain.contracts.vEth != "" ? this.config.vechain.contracts.vEth : undefined });

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy(): Promise<string> {
        if (this.config.vechain.contracts.v2eBridge.length == 42) {
            this.bridgeContract.at(this.config.vechain.contracts.v2eBridge);
        } else {
            const clause1 = this.bridgeContract.deploy(0, "vechain", "0xf6");
            const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[0].address)
                .request();
            const receipt = await getReceipt(this.connex, 5, txRep1.txid);
            if (receipt == null || receipt.reverted || receipt.outputs[0].contractAddress == undefined) {
                assert.fail('deploy faild');
            }

            this.bridgeContract.at(receipt.outputs[0].contractAddress);
            this.config.vechain.contracts.v2eBridge = receipt.outputs[0].contractAddress;
            this.config.vechain.startBlockNum = receipt.meta.blockNumber;
            try {
                fs.writeFileSync(this.configPath, JSON.stringify(this.config));
                const clause2 = this.bridgeContract.send("setVerifier", 0, this.wallet.list[1].address);
                const clause3 = this.bridgeContract.send("setGovernance", 0, this.wallet.list[1].address);
                const txRep2: Connex.Vendor.TxResponse = await this.connex.vendor.sign('tx', [clause2, clause3])
                    .signer(this.wallet.list[0].address)
                    .request();
                const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);
                if (receipt2 == null || receipt2.reverted) {
                    assert.fail("set verifier & governance faild");
                }
            } catch (error) {
                assert.fail("save config faild");
            }
        }
        return this.config.vechain.contracts.v2eBridge;
    }

    public async lock() {
        const call1 = await this.bridgeContract.call("locked");
        let status = Boolean(call1.decoded[0]);
        assert.strictEqual(status, false);

        const call2 = await this.bridgeContract.call("merkleRoot");
        let root = String(call2.decoded[0]);

        const clause1 = this.bridgeContract.send("lock", 0, root);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);
        if (receipt1 == null || receipt1.reverted) {
            assert.fail("lock bridge faild");
        }

        const call3 = await this.bridgeContract.call("locked");
        status = Boolean(call3.decoded[0]);
        assert.strictEqual(status, true);

        const clause2 = this.bridgeContract.send("unlock", 0, root);
        const txRep2 = await this.connex.vendor.sign('tx', [clause2])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);
        if (receipt2 == null || receipt2.reverted) {
            assert.fail("unlock bridge faild");
        }

        const call4 = await this.bridgeContract.call("locked");
        status = Boolean(call4.decoded[0]);
        assert.strictEqual(status, false);
    }

    public async updateMerkleRoot() {
        const call1 = await this.bridgeContract.call("merkleRoot");
        const root = String(call1.decoded[0]);

        const newRoot = "0x45b0cfc220ceec5b7c1c62c4d4193d38e4eba48e8815729ce75f9c0ab0e4c1c0";

        const clause1 = this.bridgeContract.send("lock", 0, root);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);
        if (receipt1 == null || receipt1.reverted) {
            assert.fail("Lock bridge faild");
        }

        const clause2 = this.bridgeContract.send("updateMerkleRoot", 0, root, newRoot);
        const txRep2 = await this.connex.vendor.sign('tx', [clause2])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);
        if (receipt2 == null || receipt2.reverted) {
            assert.fail("Update merkleroot faild");
        }

        const call2 = await this.bridgeContract.call("locked");
        const lockStatus = Boolean(call2.decoded[0]);
        if (lockStatus) {
            assert.fail("bridge not lock");
        }

        const call3 = await this.bridgeContract.call("merkleRoot");
        const getRoot = String(call3.decoded[0]);

        assert.strictEqual(newRoot, getRoot);

    }

    public async swapVVET() {
        const amount = 100000000;

        const clause1 = this.vVetContract.send("deposit",amount);
        const txRep1 = await this.connex.vendor.sign('tx',[clause1])
            .signer(this.wallet.list[3].address)
            .request();
        const receipt1 = await getReceipt(this.connex,5,txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail("deposit vvet faild");
        }

        const call1 = await this.vVetContract.call("balanceOf",this.config.vechain.contracts.v2eBridge);
        const before = Number(call1.decoded[0]);

        const clause2 = this.vVetContract.send("approve",0,this.config.vechain.contracts.v2eBridge,amount);
        const clause3 = this.bridgeContract.send("swap",0,this.config.vechain.contracts.vVet,amount,this.wallet.list[4].address);
        const txRep2 = await this.connex.vendor.sign("tx",[clause2,clause3])
                .signer(this.wallet.list[3].address)
                .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail("swap faild");
        }

        const call2 = await this.vVetContract.call("balanceOf",this.config.vechain.contracts.v2eBridge);
        const after = Number(call2.decoded[0]);

        assert.strictEqual(after - before,amount);
    }

    public async claimVVET() {
        let ledgers:Array<BridgeLedger> = [
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[6].address,token:this.config.vechain.contracts.vVet,balance:BigInt(100)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[7].address,token:this.config.vechain.contracts.vVet,balance:BigInt(500)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[8].address,token:this.config.vechain.contracts.vVet,balance:BigInt(50000)},
        ];

        ledgers.forEach(ledger =>{
            ledger.chainName = this.config.vechain.chainName;
            ledger.chainId = this.config.vechain.chainId;
            ledger.ledgerid = ledgerID(ledger.chainName,ledger.chainId,ledger.account,ledger.token);
        });

        let genesisSnapshoot:BridgeSnapshoot = {
            parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            merkleRoot:"",
            chains:[
                {chainName:this.config.ethereum.chainName,chainId:this.config.ethereum.chainId,beginBlockNum:100,endBlockNum:150},
                {chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,beginBlockNum:1000,endBlockNum:3000}
            ]
        }

        let storage:BridgeStorage = new BridgeStorage(genesisSnapshoot,ledgers);
        storage.buildTree();

        let newRoot = storage.getMerkleRoot();
        let merkleProof = storage.getMerkleProof(ledgers[1]);

        const call1 = await this.bridgeContract.call("merkleRoot");
        let lastRoot = String(call1.decoded[0]);

        const clause1 = this.bridgeContract.send('lock',0,lastRoot);
        const clause2 = this.bridgeContract.send('updateMerkleRoot',0,lastRoot,newRoot);
        const txRep1 = await this.connex.vendor.sign('tx',[clause1,clause2])
                .signer(this.wallet.list[1].address)
                .request();
        const receipt1 = await getReceipt(this.connex,5,txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail("update merkleroot faild");
        }

        const call2 = await this.vVetContract.call("balanceOf",ledgers[1].account);
        const balanceBefore = Number(call2.decoded[0]);

        const clause3 = this.bridgeContract.send("claim",0,ledgers[1].token,ledgers[1].account,Number(ledgers[1].balance),merkleProof);
        const txRep2 = await this.connex.vendor.sign("tx",[clause3])
                .signer(ledgers[1].account)
                .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail("claim VVET faild");
        }

        const call3 = await this.vVetContract.call("balanceOf",ledgers[1].account);
        const balanceAfter = Number(call3.decoded[0]);

        if(BigInt(balanceAfter - balanceBefore) != ledgers[1].balance){
            assert.fail("balance check faild");
        }

        const call4 = await this.bridgeContract.call("isClaim",newRoot,ledgerHash(ledgers[1]));
        const isClaim = Boolean(call4.decoded[0]);

        if(!isClaim){
            assert.fail("IsClaim check faild");
        }
    }

    public async claimVETH() {
        let ledgers:Array<BridgeLedger> = [
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[6].address,token:this.config.vechain.contracts.vEth,balance:BigInt(100)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[7].address,token:this.config.vechain.contracts.vEth,balance:BigInt(500)},
            {root:"",ledgerid:"",chainName:"",chainId:"",account:this.wallet.list[8].address,token:this.config.vechain.contracts.vEth,balance:BigInt(50000)},
        ];

        ledgers.forEach(ledger =>{
            ledger.chainName = this.config.vechain.chainName;
            ledger.chainId = this.config.vechain.chainId;
            ledger.ledgerid = ledgerID(ledger.chainName,ledger.chainId,ledger.account,ledger.token);
        });

        let genesisSnapshoot:BridgeSnapshoot = {
            parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            merkleRoot:"",
            chains:[
                {chainName:this.config.ethereum.chainName,chainId:this.config.ethereum.chainId,beginBlockNum:100,endBlockNum:150},
                {chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,beginBlockNum:1000,endBlockNum:3000}
            ]
        }

        let storage:BridgeStorage = new BridgeStorage(genesisSnapshoot,ledgers);
        storage.buildTree();

        let newRoot = storage.getMerkleRoot();
        let merkleProof = storage.getMerkleProof(ledgers[1]);

        const call1 = await this.bridgeContract.call("merkleRoot");
        let lastRoot = String(call1.decoded[0]);

        const clause1 = this.bridgeContract.send('lock',0,lastRoot);
        const clause2 = this.bridgeContract.send('updateMerkleRoot',0,lastRoot,newRoot);
        const txRep1 = await this.connex.vendor.sign('tx',[clause1,clause2])
                .signer(this.wallet.list[1].address)
                .request();
        const receipt1 = await getReceipt(this.connex,5,txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail("update merkleroot faild");
        }

        const call2 = await this.vEthContract.call("balanceOf",ledgers[1].account);
        const balanceBefore = Number(call2.decoded[0]);

        const clause3 = this.bridgeContract.send("claim",0,ledgers[1].token,ledgers[1].account,Number(ledgers[1].balance),merkleProof);
        const txRep2 = await this.connex.vendor.sign("tx",[clause3])
                .signer(ledgers[1].account)
                .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail("claim VVET faild");
        }

        const call3 = await this.vEthContract.call("balanceOf",ledgers[1].account);
        const balanceAfter = Number(call3.decoded[0]);

        if(BigInt(balanceAfter - balanceBefore) != ledgers[1].balance){
            assert.fail("balance check faild");
        }

        const call4 = await this.bridgeContract.call("isClaim",newRoot,ledgerHash(ledgers[1]));
        const isClaim = Boolean(call4.decoded[0]);

        if(!isClaim){
            assert.fail("IsClaim check faild");
        }
        
    }

    public async swapVETH() {

        const call1 = await this.vEthContract.call("balanceOf",this.wallet.list[7].address);
        const before = Number(call1.decoded[0]);

        const amount = before / 2;

        const clause2 = this.vEthContract.send("approve",0,this.config.vechain.contracts.v2eBridge,amount);
        const clause3 = this.bridgeContract.send("swap",0,this.config.vechain.contracts.vEth,amount,this.wallet.list[4].address);
        const txRep2 = await this.connex.vendor.sign("tx",[clause2,clause3])
                .signer(this.wallet.list[7].address)
                .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail("swap faild");
        }

        const call2 = await this.vEthContract.call("balanceOf",this.wallet.list[7].address);
        const after = Number(call2.decoded[0]);

        assert.strictEqual(before - after,amount);
    }

    public async initVVETToken() {
        let vVETAddr = "";
        if (this.config.vechain.contracts.vVet.length == 42) {
            const call1 = await this.bridgeContract.call('tokens', this.config.vechain.contracts.v2eBridge);
            const type = Number(call1.decoded[0]);
            if (type == 1) {
                vVETAddr = this.config.vechain.contracts.vVet;
            } else {
                vVETAddr = await this.deployVVet();
            }
        } else {
            vVETAddr = await this.deployVVet();
        }
        this.vVetContract.at(vVETAddr);
    }

    public async initVETHToken() {
        let vETHAddr = "";
        if (this.config.vechain.contracts.vEth.length == 42) {
            const call1 = await this.bridgeContract.call('tokens', this.config.vechain.contracts.v2eBridge);
            const type = Number(call1.decoded[0]);
            if (type == 2) {
                vETHAddr = this.config.vechain.contracts.vVet;
            } else {
                vETHAddr = await this.deployVETH(this.config.vechain.contracts.v2eBridge);
            }
        } else {
            vETHAddr = await this.deployVETH(this.config.vechain.contracts.v2eBridge);
        }
        this.vEthContract.at(vETHAddr);
    }

    private async deployVVet(): Promise<string> {
        const clause1 = this.vVetContract.deploy(0);
        const txRep: Connex.Vendor.TxResponse = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[0].address)
            .request();
        const receipt = await getReceipt(this.connex, 5, txRep.txid);
        if (receipt == null || receipt.reverted || receipt.outputs[0].contractAddress == undefined) {
            assert.fail("vVET deploy faild");
        }
        this.vVetContract.at(receipt.outputs[0]!.contractAddress!);
        this.config.vechain.contracts.vVet = receipt.outputs[0].contractAddress;

        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config));
        } catch (error) {
            assert.fail("save config faild");
        }

        const clause2 = this.bridgeContract.send("setToken", 0, this.config.vechain.contracts.vVet, 1);
        const txRep2 = await this.connex.vendor.sign('tx', [clause2])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);
        if (receipt2 == null || receipt2.reverted) {
            assert.fail('setToken faild');
        }

        return this.config.vechain.contracts.vVet;
    }

    private async deployVETH(addr: string): Promise<string> {
        const clause1 = this.vEthContract.deploy(0, addr);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[0].address)
            .request();
        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);
        if (receipt1 == null || receipt1.reverted || receipt1.outputs[0].contractAddress == undefined) {
            assert.fail("VETH deploy faild");
        }

        this.vEthContract.at(receipt1.outputs[0]!.contractAddress!);
        this.config.vechain.contracts.vEth = receipt1.outputs[0]!.contractAddress!;

        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config));
            const clause2 = this.bridgeContract.send('setToken', 0, this.config.vechain.contracts.vEth, 2);
            const txRep2 = await this.connex.vendor.sign('tx', [clause2])
                .signer(this.wallet.list[1].address)
                .request();
            const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);
            if (receipt2 == null || receipt2.reverted) {
                assert.fail('register token faild');
            }
        } catch (error) {
            assert.fail("save config faild");
        }

        return this.config.vechain.contracts.vEth;
    }

}

describe("V2E bridge test", () => {
    let testcase = new V2EBridgeHeadTestCase();

    before(async () => {
        await testcase.init();
    });

    it("deploy bridge contract", async () => {
        await testcase.deploy();
    });

    it("init VVet token", async () => {
        await testcase.initVVETToken();
    });

    it("init VETH token", async () => {
        await testcase.initVETHToken();
    });

    it("lock bridge", async () => {
        await testcase.lock();
    });

    it("update merkleroot", async () => {
        await testcase.updateMerkleRoot();
    });

    it("swap VVET",async() =>{
        await testcase.swapVVET();
    });

    it("claim VVET", async() =>{
        await testcase.claimVVET();
    });

    it("claim VETH", async() =>{
        await testcase.claimVETH();
    });

    it("swap VETH",async() =>{
        await testcase.swapVETH();
    });
});