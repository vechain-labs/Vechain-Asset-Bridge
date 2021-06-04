import { Driver, SimpleNet, SimpleWallet, Wallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as Devkit from 'thor-devkit';
import assert from 'assert';
import path from 'path';
import { compileContract } from 'myvetools/dist/utils';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import fs from 'fs';
import { SwapTx } from '../../../src/ValidationNode/utils/types/swapTx';
import BridgeMerkleTree from '../../../src/ValidationNode/utils/bridgeMerkleTree';
import { keccak256 } from 'thor-devkit';
import { SwapBatchInfo } from '../../../src/ValidationNode/utils/types/swapBatchInfo';

export class BridgeTestCase {
    public connex!: Framework;
    public driver!: Driver;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname, './test.config.json');
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

            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async deploy(): Promise<string> {
        if (this.config.contracts.v2eBridgeAddr.length == 42) {
            this.bridgeContract.at(this.config.contracts.v2eBridgeAddr);
        } else {
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
        }
        return this.config.contracts.v2eBridgeAddr;
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

    public async swapVVET() {
        const amount = 100000;

        const clause1 = await this.vVetContract.send('deposit', amount);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);

        if (receipt1 == null || receipt1.reverted) {
            assert.fail("vVET deposit faild");
        }

        const call1 = await this.vVetContract.call("balanceOf", this.wallet.list[1].address);
        const beforeWalletBalance = BigInt(call1.decoded[0]);

        const call2 = await this.vVetContract.call("balanceOf", this.config.contracts.v2eBridgeAddr);
        const beforeContractBalance = BigInt(call2.decoded[0]);

        const clause2 = await this.vVetContract.send("approve", 0, this.config.contracts.v2eBridgeAddr, amount);
        const clause3 = await this.bridgeContract.send("swap", 0, this.config.contracts.vVetAddr, amount, this.wallet.list[2].address);

        const txRep2 = await this.connex.vendor.sign('tx', [clause2, clause3])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);

        if (receipt2 == null || receipt2.reverted) {
            assert.fail("vVET swap faild");
        }

        const call3 = await this.vVetContract.call("balanceOf", this.wallet.list[1].address);
        const afterWalletBalance = BigInt(call3.decoded[0]);

        const call4 = await this.vVetContract.call("balanceOf", this.config.contracts.v2eBridgeAddr);
        const afterContractBalance = BigInt(call4.decoded[0]);

        assert.strictEqual(beforeWalletBalance - afterWalletBalance, BigInt(amount));
        assert.strictEqual(afterContractBalance - beforeContractBalance, BigInt(amount));
    }

    public async claimVETH() {
        let swaptx: SwapTx = {
            chainName: "vechain",
            chainId: "0x6f",
            blockNumber: 10000,
            clauseIndex: 0,
            index: 0,
            to: this.wallet.list[1].address,
            token: this.config.contracts.vEthAddr,
            balance: BigInt(1000)
        };

        let batchInfo:SwapBatchInfo = {
            lastMerkleRoot:"0x535a20c29bd0ece3f1520e25a44508b53f9d2314a1fbdffef37cec8d48c9150b",
            chains:[{
                chainName:"vechain",
                chainId: "0x6f",
                fromBlockNum:10000,
                endBlockNum:10100
            },
            {
                chainName:"ethereum",
                chainId: "3",
                fromBlockNum:12560500,
                endBlockNum:12560696
            }]
        }
        let tree = new BridgeMerkleTree(batchInfo);
        tree.addSwapTx(swaptx);

        let leaf = '0x' + keccak256(BridgeMerkleTree.stxEncodePacked(swaptx.to, swaptx.token, swaptx.balance)).toString('hex');
        let root = tree.getRoot();
        let proof = tree.getMerkleProof(leaf);

        const call1 = await this.vEthContract.call('balanceOf', swaptx.to);
        const beforeBalance = BigInt(call1.decoded[0]);

        const call2 = await this.bridgeContract.call('merkleRoot');
        const lastMerkleRoot = String(call2.decoded[0]);

        const clause1 = await this.bridgeContract.send('lock', 0,lastMerkleRoot);
        const txRep1 = await this.connex.vendor.sign('tx', [clause1])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt1 = await getReceipt(this.connex, 5, txRep1.txid);

        if (receipt1 == null || receipt1.reverted) {
            assert.fail("lock faild");
        }

        const clause2 = await this.bridgeContract.send('updateMerkleRoot', 0, root);
        const txRep2 = await this.connex.vendor.sign('tx', [clause2])
            .signer(this.wallet.list[1].address)
            .request();
        const receipt2 = await getReceipt(this.connex, 5, txRep2.txid);

        if (receipt2 == null || receipt2.reverted) {
            assert.fail("updateMerkleRoot faild");
        }

        const clause3 = await this.bridgeContract.send('claim', 0, swaptx.token, swaptx.to, '0x' + swaptx.balance.toString(16), proof);
        const txRep3 = await this.connex.vendor.sign('tx', [clause3])
            .signer(this.wallet.list[2].address)
            .request();
        const receipt3 = await getReceipt(this.connex, 5, txRep3.txid);

        if (receipt3 == null || receipt3.reverted) {
            assert.fail('claim faild');
        }

        const call3 = await this.vEthContract.call('balanceOf', swaptx.to);
        const afterBalance = BigInt(call3.decoded[0]);

        assert.strictEqual(afterBalance - beforeBalance, swaptx.balance);
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
            const clause2 = this.bridgeContract.send("setToken",0,this.config.contracts.vVetAddr,1);
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
}

describe('V2E bridge test', () => {
    let testcase: BridgeTestCase = new BridgeTestCase();

    before(async () => {
        await testcase.init();
    });

    it('deploy bridge contract', async () => {
        await testcase.deploy();
    });

    it('init VVet token', async () => {
        await testcase.initVVETToken();
    });

    it('init VETH token', async () => {
        await testcase.initVETHToken();
    });

    it('swap VVET', async() => {
        await testcase.swapVVET();
    });

    it('claim VETH', async() =>{
        await testcase.claimVETH();
    });
})

