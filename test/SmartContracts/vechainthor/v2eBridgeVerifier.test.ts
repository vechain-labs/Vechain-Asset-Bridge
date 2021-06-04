import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import path from 'path';
import { Contract } from 'myvetools';
import fs from 'fs';
import * as Devkit from 'thor-devkit';
import { compileContract } from "myvetools/dist/utils";
import assert from 'assert';
import { getReceipt } from "myvetools/dist/connexUtils";

export class BridgeVerifierTestCase {
    public connex!: Framework;
    public driver!: Driver;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};

    public bridgeContract!: Contract;
    public vVetContract!: Contract;
    public vEthContract!: Contract;
    public v2eBridgeVerifier!: Contract;

    public async init() {
        if (fs.existsSync(this.configPath)) {
            this.config = require(this.configPath);
            let masterNode = Devkit.HDNode.fromMnemonic((this.config.mnemonic as string).split(' '));
            for (let index = 0; index < 10; index++) {
                let account = masterNode.derive(index);
                this.wallet.import(account.privateKey!.toString('hex'));
            }

            try {
                this.driver = await Driver.connect(new SimpleNet(this.config.nodeHost as string), this.wallet);
                this.connex = new Framework(this.driver);

                const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeHead.sol");
                const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'V2EBridgeHead', 'abi'));
                const bridgeBin = compileContract(bridgeFilePath, 'V2EBridgeHead', 'bytecode');
                this.bridgeContract = new Contract({ abi: bridgeAbi, connex: this.connex, bytecode: bridgeBin, address: this.config.contracts.v2eBridgeAddr != "" ? this.config.contracts.v2eBridgeAddr : undefined });

                const vVetFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_vVet.sol");
                const vVetAbi = JSON.parse(compileContract(vVetFilePath, 'VVET', 'abi'));
                const vVetBin = compileContract(vVetFilePath, 'VVET', 'bytecode');
                this.vVetContract = new Contract({ abi: vVetAbi, connex: this.connex, bytecode: vVetBin, address: this.config.contracts.vVetAddr != "" ? this.config.contracts.vVetAddr : undefined });

                const vEthFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_vEth.sol");
                const vEthAbi = JSON.parse(compileContract(vEthFilePath, 'VETH', 'abi'));
                const vEthBin = compileContract(vEthFilePath, 'VETH', 'bytecode');
                this.vEthContract = new Contract({ abi: vEthAbi, connex: this.connex, bytecode: vEthBin, address: this.config.contracts.vEthAddr != "" ? this.config.contracts.vEthAddr : undefined });

                const vBridgeVerifierPath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeVerifier.sol");
                const vBridgeVerifierAbi = JSON.parse(compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'abi'));
                const vBridgeVerifierBin = compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'bytecode');
                this.v2eBridgeVerifier = new Contract({ abi: vBridgeVerifierAbi, connex: this.connex, bytecode: vBridgeVerifierBin, address: this.config.contracts.v2eBridgeVerifier != "" ? this.config.contracts.v2eBridgeVerifier : undefined });

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy(): Promise<string>{
        if(this.config.contracts.v2eBridgeVerifier.length == 42){
            this.v2eBridgeVerifier.at(this.config.contracts.v2eBridgeVerifier);
        } else {
            const clause1 = this.v2eBridgeVerifier.deploy(0);
            const txRep1 = await this.connex.vendor.sign('tx', [clause1])
                .signer(this.wallet.list[0].address)
                .request();
            const receipt = await getReceipt(this.connex, 5, txRep1.txid);
            if (receipt == null || receipt.reverted || receipt.outputs[0].contractAddress == undefined) {
                assert.fail('deploy faild');
            }

            this.v2eBridgeVerifier.at(receipt.outputs[0].contractAddress);
            this.config.contracts.v2eBridgeVerifier = receipt.outputs[0].contractAddress;
            try {
                fs.writeFileSync(this.configPath, JSON.stringify(this.config));
                const clause2 = this.v2eBridgeVerifier.send("setGovernance", 0, this.wallet.list[1].address);
                const txRep2: Connex.Vendor.TxResponse = await this.connex.vendor.sign('tx', [clause2])
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
        return this.config.contracts.v2eBridgeVerifier;
    }

    public async initVVETToken() {
        let vVETAddr = "";
        if (this.config.contracts.vVetAddr.length == 42) {
            const call1 = await this.bridgeContract.call('tokens', this.config.contracts.v2eBridgeAddr);
            const type = Number(call1.decoded[0]);
            if (type == 1) {
                vVETAddr = this.config.contracts.vVetAddr;
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
        if (this.config.contracts.vEthAddr.length == 42) {
            const call1 = await this.bridgeContract.call('tokens', this.config.contracts.v2eBridgeAddr);
            const type = Number(call1.decoded[0]);
            if (type == 2) {
                vETHAddr = this.config.contracts.vVetAddr;
            } else {
                vETHAddr = await this.deployVVet();
            }
        } else {
            vETHAddr = await this.deployVETH(this.config.contracts.v2eBridgeAddr);
        }
    }
    
    public async initBridge(){
        if(this.config.contracts.v2eBridgeAddr == ""){
            let bridgeAddr = await this.deployBridge();
            this.config.contracts.v2eBridgeAddr = bridgeAddr;
        }
        this.bridgeContract.at(this.config.contracts.v2eBridgeAddr);

        const call1 = await this.bridgeContract.call('verifier');
        const verifierAddr = String(call1.decoded[0]);
        if(verifierAddr.toLocaleLowerCase() != this.config.contracts.v2eBridgeVerifier.toLocaleLowerCase()){
            const clause1 = await this.bridgeContract.send('setVerifier',0,this.config.contracts.v2eBridgeVerifier);
            const txRep1 = await this.connex.vendor.sign('tx',[clause1])
                .signer(this.wallet.list[1].address)
                .request();
            const receipt = await getReceipt(this.connex,5,txRep1.txid);
            if(receipt == null || receipt.reverted){
                assert.fail("setVerifier faild");
            }
        }

        const call2 =await this.v2eBridgeVerifier.call('bridge');
        const bridegAddr = String(call2.decoded[0]);
        if(bridegAddr.toLocaleLowerCase() != this.config.contracts.v2eBridgeAddr.toLocaleLowerCase()){
            const clause1 = await this.v2eBridgeVerifier.send('setBridge',0,this.config.contracts.v2eBridgeAddr);
            const txRep1 = await this.connex.vendor.sign('tx',[clause1])
                .signer(this.wallet.list[1].address)
                .request();
            const receipt = await getReceipt(this.connex,5,txRep1.txid);
            if(receipt == null || receipt.reverted){
                assert.fail("setBridge faild");
            }
        }
    }

    public async addVerifiers() {
        const clause1 = await this.v2eBridgeVerifier.send('addVerifier',0,this.wallet.list[5].address);
        const clause2 = await this.v2eBridgeVerifier.send('addVerifier',0,this.wallet.list[6].address);
        const clause3 = await this.v2eBridgeVerifier.send('addVerifier',0,this.wallet.list[7].address);

        const txRep = await this.connex.vendor.sign('tx',[clause1,clause2,clause3])
                .signer(this.wallet.list[1].address)
                .request();
        const receipt = await getReceipt(this.connex,5,txRep.txid);
        if(receipt == null || receipt.reverted){
            assert.fail("addVerifier faild");
        }

        const call1 = await this.v2eBridgeVerifier.call('verifiers',this.wallet.list[5].address);
        const status1 = Boolean(call1.decoded[0]);

        const call2 = await this.v2eBridgeVerifier.call('verifiers',this.wallet.list[6].address);
        const status2 = Boolean(call2.decoded[0]);

        const call3 = await this.v2eBridgeVerifier.call('verifiers',this.wallet.list[7].address);
        const status3 = Boolean(call3.decoded[0]);

        if(!status1 && !status2 && !status3){
            assert.fail("check status faild");
        }
    }

    public async removeVerifier() {
        const clause1 = await this.v2eBridgeVerifier.send('addVerifier',0,this.wallet.list[8].address);
        const txRep = await this.connex.vendor.sign('tx',[clause1])
        .signer(this.wallet.list[1].address)
        .request();
        const receipt = await getReceipt(this.connex,5,txRep.txid);
        if(receipt == null || receipt.reverted){
            assert.fail("addVerifier faild");
        }

        const clause2 = await this.v2eBridgeVerifier.send('removeVerifier',0,this.wallet.list[8].address);
        const txRep2 = await this.connex.vendor.sign('tx',[clause2])
        .signer(this.wallet.list[1].address)
        .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail("removeVerifier faild");
        }

        const call1 = await this.v2eBridgeVerifier.call('verifiers',this.wallet.list[8].address);
        const status = Boolean(call1.decoded[0]);
        assert.strictEqual(status,false);
    }

    public async updateMerkleRoot(){
        const call1 = await this.bridgeContract.call('merkleRoot');
        const lastMerkleroot = String(call1.decoded[0]);

        const sign1 = await this.wallet.list[5].sign(Buffer.from(lastMerkleroot.substr(2),'hex'));
        const clause1 = await this.v2eBridgeVerifier.send('lockBridge',0,lastMerkleroot,sign1);
        const txRep1 = await this.connex.vendor.sign('tx',[clause1])
            .signer(this.wallet.list[5].address)
            .request();
        const receipt1 = await getReceipt(this.connex,5,txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail(`addr5:${this.wallet.list[5].address} lock bridge faild`);
        }

        const sign2 = await this.wallet.list[6].sign(Buffer.from(lastMerkleroot.substr(2),'hex'));
        const clause2 = await this.v2eBridgeVerifier.send('lockBridge',0,lastMerkleroot,sign2);
        const txRep2 = await this.connex.vendor.sign('tx',[clause2])
            .signer(this.wallet.list[6].address)
            .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail(`addr6:${this.wallet.list[6].address} lock bridge faild`);
        }

        const call2 = await this.bridgeContract.call('locked');
        const locked = Boolean(call2.decoded[0]);

        assert.strictEqual(locked,true,"bridge not locked");

        const rootHash = "0xe5cf3f0d618545e911e46507c696459b0e01187c09bb0118f8eeb797bd0d8b90";
        
        const sign3 = await this.wallet.list[6].sign(Buffer.from(rootHash.substr(2),'hex'));
        const clause3 = await this.v2eBridgeVerifier.send('updateBridgeMerkleRoot',0,lastMerkleroot,rootHash,sign3);
        const txRep3 = await this.connex.vendor.sign('tx',[clause3])
            .signer(this.wallet.list[6].address)
            .request();
        const receipt3 = await getReceipt(this.connex,5,txRep3.txid);
        if(receipt3 == null || receipt3.reverted){
            assert.fail(`addr6:${this.wallet.list[6].address} updateBridgeMerkleRoot faild`);
        }

        const sign4 = await this.wallet.list[7].sign(Buffer.from(rootHash.substr(2),'hex'));
        const clause4 = await this.v2eBridgeVerifier.send('updateBridgeMerkleRoot',0,lastMerkleroot,rootHash,sign4);
        const txRep4 = await this.connex.vendor.sign('tx',[clause4])
            .signer(this.wallet.list[7].address)
            .request();
        const receipt4 = await getReceipt(this.connex,5,txRep4.txid);
        if(receipt4 == null || receipt4.reverted){
            assert.fail(`addr6:${this.wallet.list[6].address} updateBridgeMerkleRoot faild`);
        }

        const call3 = await this.bridgeContract.call('locked');
        const locked3 = Boolean(call3.decoded[0]);

        assert.strictEqual(locked3,false,"bridge not unlocked");

        const call4 = await this.bridgeContract.call('merkleRoot');
        const newMerkleRoot = String(call4.decoded[0]);
        assert.strictEqual(newMerkleRoot,rootHash,"Merkle Root not updated");
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
        this.config.contracts.vVetAddr = receipt.outputs[0].contractAddress;

        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config));
        } catch (error) {
            assert.fail("save config faild");
        }

        const clause2 = this.bridgeContract.send("setToken",0,this.config.contracts.vVetAddr,1);
        const txRep2 = await this.connex.vendor.sign('tx',[clause2])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail('register token faild');
        }

        return this.config.contracts.vVetAddr;
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
        this.config.contracts.vEthAddr = receipt1.outputs[0]!.contractAddress!;

        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config));
            const clause2 = this.bridgeContract.send('setToken',0,this.config.contracts.vEthAddr,2);
            const txRep2 = await this.connex.vendor.sign('tx',[clause2])
                .signer(this.wallet.list[1].address)
                .request();
            const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
            if(receipt2 == null || receipt2.reverted){
                assert.fail('register token faild');
            }
        } catch (error) {
            assert.fail("save config faild");
        }

        return this.config.contracts.vEthAddr;
    }

    private async deployBridge():Promise<string> {
        const clause1 = this.bridgeContract.deploy(0);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[0].address)
            .request();
        const receipt = await getReceipt(this.connex, 5, txRep1.txid);
        if (receipt == null || receipt.reverted || receipt.outputs[0].contractAddress == undefined) {
            assert.fail('deploy faild');
        }

        this.bridgeContract.at(receipt.outputs[0].contractAddress);
        this.config.contracts.v2eBridgeAddr = receipt.outputs[0].contractAddress;
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

        return this.config.contracts.v2eBridgeAddr;
    }


}

describe("V2E verifier test", ()=>{
    let testcase = new BridgeVerifierTestCase();

    before(async() =>{
        await testcase.init();
    });

    it('deploy verifier contract', async() => {
        await testcase.deploy();
    });

    it('init bridge', async() =>{
        await testcase.initBridge();
    });

    it('init VVet token', async () => {
        await testcase.initVVETToken();
    });

    it('init VETH token', async () => {
        await testcase.initVETHToken();
    });

    it('add verifiers', async() => {
       await testcase.addVerifiers();         
    });

    it('remove verifiers', async() => {
        await testcase.removeVerifier();
    });

    it('update Merkleroot', async() => {
        await testcase.updateMerkleRoot();
    });
});