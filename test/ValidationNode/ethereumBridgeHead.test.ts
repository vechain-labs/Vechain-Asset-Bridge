import path from 'path';
import Web3 from 'web3';
import { SimpleWallet } from '@vechain/connex-driver';
import { compileContract } from 'myvetools/dist/utils';
import {Contract as EthContract} from 'web3-eth-contract';
import assert from 'assert';
import { EthereumBridgeHead } from '../../src/ValidationNode/server/ethereumBridgeHead';
import fs from 'fs';


export class EthereumBridgeHeadTestCase{
    public web3!:Web3;
    public configPath = path.join(__dirname, './test.config.json');
    public config: any = {};
    public wallet = new SimpleWallet();

    
    private privateKeys = [
        "0x99f0500549792796c14fed62011a51081dc5b5e68fe8bd8a13b86be829c4fd36",
        "0x7b067f53d350f1cf20ec13df416b7b73e88a1dc7331bc904b92108b1e76a08b1",
        "0xf4a1a17039216f535d42ec23732c79943ffb45a089fbb78a14daad0dae93e991",
        "0x35b5cc144faca7d7f220fca7ad3420090861d5231d80eb23e1013426847371c4",
        "0x10c851d8d6c6ed9e6f625742063f292f4cf57c2dbeea8099fa3aca53ef90aef1",
        "0x2dd2c5b5d65913214783a6bd5679d8c6ef29ca9f2e2eae98b4add061d0b85ea0",
        "0xe1b72a1761ae189c10ec3783dd124b902ffd8c6b93cd9ff443d5490ce70047ff",
        "0x35cbc5ac0c3a2de0eb4f230ced958fd6a6c19ed36b5d2b1803a9f11978f96072",
        "0xb639c258292096306d2f60bc1a8da9bc434ad37f15cd44ee9a2526685f592220",
        "0x9d68178cdc934178cca0a0051f40ed46be153cf23cb1805b59cc612c0ad2bbe0"
    ]
    private bridgeContract!: EthContract;
    private bridge!:EthereumBridgeHead;

    public async init(){
        if (fs.existsSync(this.configPath)) {
            try {
                this.config = require(this.configPath);
                this.web3 = new Web3(new Web3.providers.HttpProvider(this.config.ethereum.nodeHost));
    
                const filePath = path.join(__dirname,"../../src/SmartContracts/contracts/ethereum/Contract_E2VBridgeHead.sol");
                const abi = JSON.parse(compileContract(filePath, 'E2VBridgeHead', 'abi'));
                this.bridgeContract = new this.web3.eth.Contract(abi,this.config.ethereum.contracts.e2vBridge);
                
                let env = {
                    config:this.config,
                    web3:this.web3
                }
                this.bridge = new EthereumBridgeHead(env);
    
            } catch (error) {
                assert.fail(`init faild: ${JSON.stringify(error)}`);
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

        const data = await this.bridgeContract.methods.merkleRoot().call();
        const root = String(data);

        assert.strictEqual(root,result.data!.merkleRoot);
    }

    public async getLockedStatus():Promise<any>{
        let result = await this.bridge.getLockedStatus();
        if(result.error){
            assert.fail(`get lock status faild: ${result.error}`);
        }

        const data = await this.bridgeContract.methods.locked().call();
        const root = Boolean(data);

        assert.strictEqual(root,result.data!);
    }

    public async getMerkleRoot():Promise<any>{
        let result = await this.bridge.getMerkleRoot();
        if(result.error){
            assert.fail(`get last merkleroot faild: ${result.error}`);
        }

        const data = await this.bridgeContract.methods.merkleRoot().call();
        const root = String(data);

        assert.strictEqual(root,result.data!);
    }

    public async scanTxs():Promise<any>{
        let from = this.config.ethereum.startBlockNum;
        let end = await this.web3.eth.getBlockNumber();

        let result = await this.bridge.scanTxs(from,end);
        if(result.error){
            assert.fail(`get scan txs faild: ${result.error}`);
        }
    }
}

describe("Ethereum Bridge Test",() =>{
    let testcase = new EthereumBridgeHeadTestCase();

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