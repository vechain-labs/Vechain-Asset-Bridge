import Web3 from "web3";
import { ActionData } from "../utils/components/actionResult";
import {Contract as EthContract, EventData} from 'web3-eth-contract';
import path from "path";
import { compileContract } from "myvetools/dist/utils";
import { SimpleWallet } from "@vechain/connex-driver";

export class EthereumBridgeVerifier {
    constructor(env:any){
        this.env = env;
        this.config = this.env.config;
        this.web3 = this.env.web3;
        this.wallet = this.env.wallet;
        this.initE2VBridgeVerifier();
    }

    public async isVerifier(address:string):Promise<ActionData<boolean>>{
        let result = new ActionData<boolean>();

        try {
            const call = await this.e2vBridgeVerifier.methods.verifiers().call();
            result.data = Boolean(call);
        } catch (error) {
            result.error = error;   
        }

        return result;
    }

    public async getLockBridgeProposal(hash:string):Promise<ActionData<BaseProposal>>{
        let result = new ActionData<BaseProposal>();

        try {
            const call = await this.e2vBridgeVerifier.methods.lockBridgeProposals().call();
            let p:BaseProposal = {
                hash:hash,
                executed:Boolean(call)
            };
            result.data = p;
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async updateBridgeMerkleRoot(hash:string):Promise<ActionData<BaseProposal>>{
        let result = new ActionData<BaseProposal>();

        try {
            const call = await this.e2vBridgeVerifier.methods.merkleRootProposals().call();
            let p:BaseProposal = {
                hash:hash,
                executed:Boolean(call)
            };
            result.data = p;
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async lockBridge(lastRoot:string,sigs:string[]):Promise<ActionData<string>>{
        let result = new ActionData<string>();

        try {
            const bestBlockNum = await this.web3.eth.getBlockNumber();
            const expirnum = this.config.ethereum.expiration as number;
            this.e2vBridgeVerifier.methods.lockBridge(lastRoot,sigs,bestBlockNum,expirnum).send({from:this.wallet.list[0].address});
            

        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private initE2VBridgeVerifier(){
        const filePath = path.join(__dirname,"../../../src/SmartContracts/contracts/ethereum/Contract_E2VBridgeVerifier.sol");
        const abi = JSON.parse(compileContract(filePath,"E2VBridgeVerifier","abi"));
        this.e2vBridgeVerifier = new this.web3.eth.Contract(abi,this.config.ethereum.contracts.e2vBridgeVerifier);
    }

    private env:any;
    private config:any;
    private web3!:Web3;
    private e2vBridgeVerifier!:EthContract;
    private wallet!:SimpleWallet;
}

export type BaseProposal = {
    hash:string;
    executed:boolean;
}

