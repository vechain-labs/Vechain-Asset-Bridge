import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import path from 'path';
import { Contract } from 'myvetools';
import fs from 'fs';
import * as Devkit from 'thor-devkit';
import { compileContract } from "myvetools/dist/utils";
import assert from 'assert';
import { getReceipt } from "myvetools/dist/connexUtils";
import { tokenid, TokenInfo } from "../../../src/common/utils/types/tokenInfo";
import { BridgeSnapshoot, ZeroRoot } from "../../../src/common/utils/types/bridgeSnapshoot";
import { BridgeTx } from "../../../src/common/utils/types/bridgeTx";
import { keccak256 } from "thor-devkit";
import BridgeStorage from "../../../src/common/bridgeStorage";

export class V2EBridgeVerifierTestCase {
    public connex!: Framework;
    public driver!: Driver;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname, '../test.config.json');
    public config: any = {};

    public bridgeContract!: Contract;
    public vVetContract!: Contract;
    public vEthContract!: Contract;
    public v2eBridgeVerifier!: Contract;
    public tokenInfo:Array<TokenInfo> = new Array();
    
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

                const libPath = path.join(__dirname,"../../../src/SmartContracts/contracts/");

                const bridgeFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/common/Contract_BridgeHead.sol");
                const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'BridgeHead', 'abi'));
                const bridgeBin = compileContract(bridgeFilePath, 'BridgeHead', 'bytecode');
                this.bridgeContract = new Contract({ abi: bridgeAbi, connex: this.connex, bytecode: bridgeBin, address: this.config.vechain.contracts.v2eBridge != "" ? this.config.vechain.contracts.v2eBridge : undefined });

                const vVetFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_vVet.sol");
                const vVetAbi = JSON.parse(compileContract(vVetFilePath, 'VVET', 'abi'));
                const vVetBin = compileContract(vVetFilePath, 'VVET', 'bytecode');
                this.vVetContract = new Contract({ abi: vVetAbi, connex: this.connex, bytecode: vVetBin, address: this.config.vechain.contracts.vVet != "" ? this.config.vechain.contracts.vVet : undefined });

                const vEthFilePath = path.join(__dirname, "../../../src/SmartContracts/contracts/common/Contract_BridgeWrappedToken.sol");
                const vEthAbi = JSON.parse(compileContract(vEthFilePath, 'BridgeWrappedToken', 'abi'));
                const vEthBin = compileContract(vEthFilePath, 'BridgeWrappedToken', 'bytecode');
                this.vEthContract = new Contract({ abi: vEthAbi, connex: this.connex, bytecode: vEthBin, address: this.config.vechain.contracts.vEth != "" ? this.config.vechain.contracts.vEth : undefined });

                const vBridgeVerifierPath = path.join(__dirname, "../../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeVerifier.sol");
                const vBridgeVerifierAbi = JSON.parse(compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'abi',[libPath]));
                const vBridgeVerifierBin = compileContract(vBridgeVerifierPath, 'V2EBridgeVerifier', 'bytecode',[libPath]);
                this.v2eBridgeVerifier = new Contract({ abi: vBridgeVerifierAbi, connex: this.connex, bytecode: vBridgeVerifierBin, address: this.config.vechain.contracts.v2eBridge != "" ? this.config.vechain.contracts.v2eBridge : undefined });

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy(): Promise<string>{
        if(this.config.vechain.contracts.v2eBridgeVerifier.length == 42){
            this.v2eBridgeVerifier.at(this.config.vechain.contracts.v2eBridgeVerifier);
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
            this.config.vechain.contracts.v2eBridgeVerifier = receipt.outputs[0].contractAddress;
            try {
                fs.writeFileSync(this.configPath, JSON.stringify(this.config));
                const clause2 = this.v2eBridgeVerifier.send("setGovernance", 0, this.wallet.list[1].address);
                const txRep2: Connex.Vendor.TxResponse = await this.connex.vendor.sign('tx', [clause2])
                    .signer(this.wallet.list[0].address)
                    .request();

                const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);
                if (receipt2 == null || receipt2.reverted) {
                    assert.fail("set governance faild");
                }
            } catch (error) {
                assert.fail("save config faild");
            }
        }
        return this.config.vechain.contracts.v2eBridgeVerifier;
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
    
    public async initBridge(){
        if(this.config.vechain.contracts.v2eBridge == ""){
            let bridgeAddr = await this.deployBridge();
            this.config.vechain.contracts.v2eBridge = bridgeAddr;
        }
        this.bridgeContract.at(this.config.vechain.contracts.v2eBridge);

        const call1 = await this.bridgeContract.call('verifier');
        const verifierAddr = String(call1.decoded[0]);
        if(verifierAddr.toLocaleLowerCase() != this.config.vechain.contracts.v2eBridgeVerifier.toLocaleLowerCase()){
            const clause1 = await this.bridgeContract.send('setVerifier',0,this.config.vechain.contracts.v2eBridgeVerifier);
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
        if(bridegAddr.toLocaleLowerCase() != this.config.vechain.contracts.v2eBridge.toLocaleLowerCase()){
            const clause1 = await this.v2eBridgeVerifier.send('setBridge',0,this.config.vechain.contracts.v2eBridge);
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

        await this.initTokens();
        const swapTx1 = await this.mockSwapVVET();
        const swapTx2 = await this.mockSwapVETH();

        const call1 = await this.bridgeContract.call('merkleRoot');
        const lastMerkleroot = String(call1.decoded[0]);

        const sign1 = await this.wallet.list[5].sign(this.signEncodePacked("lockBridge",lastMerkleroot));
        const clause1 = this.v2eBridgeVerifier.send('lockBridge',0,lastMerkleroot,sign1);
        const txRep1 = await this.connex.vendor.sign('tx',[clause1])
            .signer(this.wallet.list[5].address)
            .request();
        const receipt1 = await getReceipt(this.connex,5,txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail(`addr5:${this.wallet.list[5].address} lock bridge faild. txid:${txRep1.txid}`);
        }

        const sign2 = await this.wallet.list[6].sign(this.signEncodePacked("lockBridge",lastMerkleroot));
        const clause2 = this.v2eBridgeVerifier.send('lockBridge',0,lastMerkleroot,sign2);
        const txRep2 = await this.connex.vendor.sign('tx',[clause2])
            .signer(this.wallet.list[6].address)
            .request();
        const receipt2 = await getReceipt(this.connex,5,txRep2.txid);
        if(receipt2 == null || receipt2.reverted){
            assert.fail(`addr6:${this.wallet.list[6].address} lock bridge faild. txid:${txRep2.txid}`, );
        }
 
        const call2 = await this.bridgeContract.call('locked');
        const locked = Boolean(call2.decoded[0]);

        assert.strictEqual(locked,true,"bridge not locked");

        const rootHash = this.initStorage(this.config.vechain.startBlockNum,receipt2.meta.blockNumber,[swapTx1,swapTx2]);
        
        const sign3 = await this.wallet.list[6].sign(this.signEncodePacked("updateBridgeMerkleRoot",rootHash));
        const clause3 = this.v2eBridgeVerifier.send('updateBridgeMerkleRoot',0,lastMerkleroot,rootHash,sign3);
        const txRep3 = await this.connex.vendor.sign('tx',[clause3])
            .signer(this.wallet.list[6].address)
            .request();
        const receipt3 = await getReceipt(this.connex,5,txRep3.txid);
        if(receipt3 == null || receipt3.reverted){
            assert.fail(`addr6:${this.wallet.list[6].address} updateBridgeMerkleRoot faild. txid:${txRep3.txid}`);
        }

        const sign4 = await this.wallet.list[7].sign(this.signEncodePacked("updateBridgeMerkleRoot",rootHash));
        const clause4 = this.v2eBridgeVerifier.send('updateBridgeMerkleRoot',0,lastMerkleroot,rootHash,sign4);
        const txRep4 = await this.connex.vendor.sign('tx',[clause4])
            .signer(this.wallet.list[7].address)
            .request();
        const receipt4 = await getReceipt(this.connex,5,txRep4.txid);
        if(receipt4 == null || receipt4.reverted){
            assert.fail(`addr7:${this.wallet.list[7].address} updateBridgeMerkleRoot faild`);
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
        this.config.vechain.contracts.vVet = receipt.outputs[0].contractAddress;

        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config));
        } catch (error) {
            assert.fail("save config faild");
        }

        const clause2 = this.bridgeContract.send("setWrappedNativeCoin",0,this.config.vechain.contracts.vVet,this.config.ethereum.contracts.wVet,this.config.vechain.startBlockNum,0);
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
        const clause1 = this.vEthContract.deploy(0, "VeChain Wrapped ETH","VETH",18,addr);
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
            const clause2 = this.bridgeContract.send('setToken',0,this.config.vechain.contracts.vEth,2,this.config.ethereum.contracts.wEth,this.config.vechain.startBlockNum,0);
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

        return this.config.vechain.contracts.vEth;
    }

    private async deployBridge():Promise<string> {
        const clause1 = this.bridgeContract.deploy(0,this.config.vechain.chainName,this.config.vechain.chainId);
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

        return this.config.vechain.contracts.v2eBridge;
    }

    private initTokens(){
        this.tokenInfo = [
            {
                tokenid:"",
                chainName:this.config.vechain.chainName,
                chainId:this.config.vechain.chainId,
                name:"VVET",
                symbol:"VVET",
                decimals:18,
                address:this.config.vechain.contracts.vVet,
                nativeCoin:false,
                tokenType:"1",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            },
            {
                tokenid:"",
                chainName:this.config.vechain.chainName,
                chainId:this.config.vechain.chainId,
                name:"VETH",
                symbol:"VETH",
                decimals:18,
                address:this.config.vechain.contracts.vEth,
                nativeCoin:false,
                tokenType:"2",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            },
            {
                tokenid:"",
                chainName:this.config.ethereum.chainName,
                chainId:this.config.ethereum.chainId,
                name:"WVET",
                symbol:"WVET",
                decimals:18,
                address:this.config.ethereum.contracts.wVet,
                nativeCoin:false,
                tokenType:"2",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            },
            {
                tokenid:"",
                chainName:this.config.ethereum.chainName,
                chainId:this.config.ethereum.chainId,
                name:"WVET",
                symbol:"WETH",
                decimals:18,
                address:this.config.ethereum.contracts.wEth,
                nativeCoin:false,
                tokenType:"1",
                targetTokenId:"",
                begin:0,
                end:0,
                update:0
            }
        ]

        for(let token of this.tokenInfo){
            token.tokenid = tokenid(token.chainName,token.chainId,token.address);
        }
        this.tokenInfo[0].targetTokenId = this.tokenInfo[2].tokenid;
        this.tokenInfo[2].targetTokenId = this.tokenInfo[0].tokenid;
        this.tokenInfo[1].targetTokenId = this.tokenInfo[3].tokenid;
        this.tokenInfo[3].targetTokenId = this.tokenInfo[1].tokenid;
    }

    private async mockSwapVVET():Promise<BridgeTx>{
        const amount = 100000000;
        const clause1 = this.vVetContract.send("deposit",amount);
        const clause2 = this.vVetContract.send("approve",0,this.config.vechain.contracts.v2eBridge,amount);
        const clause3 = this.bridgeContract.send("swap",0,this.config.vechain.contracts.vVet,amount,this.wallet.list[4].address);

        const txRep1 = await this.connex.vendor.sign("tx",[clause1,clause2,clause3])
                .signer(this.wallet.list[3].address)
                .request();
        const receipt1 = await getReceipt(this.connex,5,txRep1.txid);
        if(receipt1 == null || receipt1.reverted){
            assert.fail("swap faild");
        }
        
        let result:BridgeTx = {
            chainName:this.config.vechain.chainName,
            chainId:this.config.vechain.chainId,
            blockNumber:receipt1.meta.blockNumber,
            blockId:receipt1.meta.blockID,
            txid:receipt1.meta.txID,
            clauseIndex:2,
            index:0,
            account:this.wallet.list[4].address,
            token:this.config.vechain.contracts.vVet,
            amount:BigInt(amount),
            reward:BigInt(0),
            timestamp:receipt1.meta.blockTimestamp,
            type:"swap"
        }

        return result;
    }

    private async mockSwapVETH():Promise<BridgeTx>{
        const amount = 200000000;
        let result:BridgeTx = {
            chainName:this.config.vechain.chainName,
            chainId:this.config.vechain.chainId,
            blockNumber:100000000,
            blockId:"0x009fa94909c7379638f5b8ce49c574d3ab95e5b89c810f7acc0734c63dcfe7c0",
            txid:"0x3273443c8c795077583b1601b1d219f56236c22deb88833df3970a138021083b",
            clauseIndex:0,
            index:0,
            account:this.wallet.list[4].address,
            token:this.config.vechain.contracts.vEth,
            amount:BigInt(amount),
            reward:BigInt(0),
            timestamp:(new Date()).getTime(),
            type:"swap"
        }

        return result;
    }

    private initStorage(begin:number,end:number,swapTxs:BridgeTx[]):string{
        let result = "";
        const sn:BridgeSnapshoot = {
            parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            chains:[
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    beginBlockNum:begin,
                    lockedBlockNum:begin,
                    endBlockNum:end},
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    beginBlockNum:begin,
                    lockedBlockNum:begin,
                    endBlockNum:end}
            ]
        }

        let storage = new BridgeStorage(sn,this.tokenInfo);
        storage.updateLedgers(swapTxs);
        storage.buildTree();
        result = storage.getMerkleRoot();
        return result;
    }

    private signEncodePacked(opertion:string,hash:string):Buffer {
        let hashBuffer = hash != ZeroRoot() ? Buffer.from(hash.substr(2),'hex') : Buffer.alloc(32);
        let encode = Buffer.concat([
            Buffer.from(opertion),
            hashBuffer
        ]);
        return keccak256(encode);
    }

}

describe("V2E verifier test", ()=>{
    let testcase = new V2EBridgeVerifierTestCase();

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

    // it('add verifiers', async() => {
    //    await testcase.addVerifiers();         
    // });

    // it('remove verifiers', async() => {
    //     await testcase.removeVerifier();
    // });

    // it('update Merkleroot', async() => {
    //     await testcase.updateMerkleRoot();
    // });
});