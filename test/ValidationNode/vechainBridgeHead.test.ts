import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import path from "path";
import fs from 'fs';
import assert from 'assert';
import * as Devkit from 'thor-devkit';
import { Contract } from "myvetools";
import { compileContract } from "myvetools/dist/utils";
import { VeChainBridgeHead } from "../../src/ValidationNode/server/vechainBridgeHead";

export class VeChainBridgeHeadTestCase{
    public connex!: Framework;
    public driver!: Driver;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};
    private bridge!:VeChainBridgeHead;
    private bridgeContract!: Contract;

    public async init(){
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
                const bridgeFilePath = path.join(__dirname, "../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeHead.sol");
                const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'V2EBridgeHead', 'abi'));
                const bridgeBin = compileContract(bridgeFilePath, 'V2EBridgeHead', 'bytecode');
                this.bridgeContract = new Contract({ abi: bridgeAbi, connex: this.connex, bytecode: bridgeBin, address: this.config.vechain.contracts.v2eBridge != "" ? this.config.vechain.contracts.v2eBridge : undefined });

                let env = {
                    config:this.config,
                    connex:this.connex
                }

                this.bridge = new VeChainBridgeHead(env);
            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async getLashSnapshootOnChain():Promise<any>{
        let result = await this.bridge.getLashSnapshootOnChain();
        if(result.error){
            assert.fail(`get last snapshoot faild: ${result.error}`);
        }

        const call = await this.bridgeContract.call("merkleRoot");
        const root = String(call.decoded[0]);

        assert.strictEqual(root,result.data!.merkleRoot);
    }

    public async getLockedStatus():Promise<any>{
        let result = await this.bridge.getLockedStatus();
        if(result.error){
            assert.fail(`get lock status faild: ${result.error}`);
        }

        const call = await this.bridgeContract.call("locked");
        const root = Boolean(call.decoded[0]);

        assert.strictEqual(root,result.data!);
    }

    public async getMerkleRoot():Promise<any>{
        let result = await this.bridge.getMerkleRoot();
        if(result.error){
            assert.fail(`get lock status faild: ${result.error}`);
        }

        const call = await this.bridgeContract.call("merkleRoot");
        const root = String(call.decoded[0]);

        assert.strictEqual(root,result.data!);
    }

    public async scanTxs():Promise<any>{
        let from = this.config.vechain.startBlockNum;
        let end = this.connex.thor.status.head.number;

        let result = await this.bridge.scanTxs(from,end);
        if(result.error){
            assert.fail(`get scan txs faild: ${result.error}`);
        }
    }
}

describe("VeChain Bridge Test",() =>{

    let testcase = new VeChainBridgeHeadTestCase();

    before(async() =>{
        await testcase.init();
    });

    it("get last snapshoot", async() =>{
        await testcase.getLashSnapshootOnChain();
    });

    it("get bridge status", async() =>{
        await testcase.getLockedStatus();
    });

    it("get last merkleroot", async() =>{
        await testcase.getMerkleRoot();
    });

    it("scan txs", async() =>{
        await testcase.scanTxs();
    });
});