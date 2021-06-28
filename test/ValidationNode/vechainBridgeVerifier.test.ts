import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
import { Framework } from "@vechain/connex-framework";
import { Contract } from "myvetools";
import { VeChainBridgeVerifiter } from "../../src/ValidationNode/server/vechainBridgeVerifier";
import path from "path";
import fs from 'fs';
import * as Devkit from 'thor-devkit';
import { compileContract } from "myvetools/dist/utils";
import assert from 'assert';
import { ActionData } from "../../src/ValidationNode/utils/components/actionResult";
import { Proposal } from "../../src/ValidationNode/utils/types/proposal";

export class VeChainBridgeVerifiterTestCase{
    public connex!: Framework;
    public driver!: Driver;
    public wallet = new SimpleWallet();

    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};
    private bridgeVerifier!:VeChainBridgeVerifiter;
    private bridgeVerifierContract!: Contract;

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
                const bridgeFilePath = path.join(__dirname, "../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeVerifier.sol");
                const bridgeAbi = JSON.parse(compileContract(bridgeFilePath, 'V2EBridgeVerifier', 'abi'));
                const bridgeBin = compileContract(bridgeFilePath, 'V2EBridgeVerifier', 'bytecode');
                this.bridgeVerifierContract = new Contract({ abi: bridgeAbi, connex: this.connex, bytecode: bridgeBin, address: this.config.vechain.contracts.v2eBridgeVerifier != "" ? this.config.vechain.contracts.v2eBridgeVerifier : undefined });

                let env = {
                    config:this.config,
                    connex:this.connex
                }

                this.bridgeVerifier = new VeChainBridgeVerifiter(env);
            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${this.configPath}`);
        }
    }

    public async getLockBridgeProposal():Promise<any>{
        let hash = "0xe5cf3f0d618545e911e46507c696459b0e01187c09bb0118f8eeb797bd0d8b90";
        await this.bridgeVerifier.getLockBridgeProposal(hash);
    }
}

describe("VeChain Bridge Verifiter Test",() =>{
    let testcase = new VeChainBridgeVerifiterTestCase();

    before(async() =>{
        await testcase.init();
    });

    it("get LockBridgeProposal", async() =>{
        await testcase.getLockBridgeProposal();
    });
});