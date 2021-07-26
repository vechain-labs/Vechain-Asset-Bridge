import Web3 from "web3";
import { ActionData } from "../utils/components/actionResult";
import {Contract as EthContract} from 'web3-eth-contract';
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
            const call = await this.e2vBridgeVerifier.methods.verifiers(address).call();
            result.data = Boolean(call);
        } catch (error) {
            result.error = error;   
        }

        return result;
    }

    public async getLockProposal(hash:string):Promise<ActionData<BaseProposal>>{
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

    public async getUpdateMerkleRootProposal(hash:string):Promise<ActionData<BaseProposal>>{
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
            const blockRef = await this.web3.eth.getBlockNumber();
            const expirnum = this.config.ethereum.expiration as number;
            const gasprice = await this.web3.eth.getGasPrice();
            const gas = await this.e2vBridgeVerifier.methods.lockBridge(lastRoot,sigs,blockRef,expirnum).estimateGas();
            

            const receipt = await this.e2vBridgeVerifier.methods.lockBridge(lastRoot,sigs,blockRef,expirnum).send({
                from:this.wallet.list[0].address,
                gas:gas,
                gasprice:gasprice
            });
            result.data = receipt.transactionHash;
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async updateBridgeMerkleRoot(lastRoot:string,newRoot:string,signs:string[]):Promise<ActionData<string>>{
        let result = new ActionData<string>();

        try {
            const blockRef = await this.web3.eth.getBlockNumber();
            const expirnum = this.config.ethereum.expiration as number;
            const gasprice = await this.web3.eth.getGasPrice();
            const gas = await this.e2vBridgeVerifier.methods.updateBridgeMerkleRoot(lastRoot,newRoot,signs,blockRef,expirnum).estimateGas();

            const receipt = await this.e2vBridgeVerifier.methods.updateBridgeMerkleRoot(lastRoot,newRoot,signs,blockRef,expirnum).send({
                from:this.wallet.list[0].address,
                gas:gas,
                gasprice:gasprice
            });
            result.data = receipt.transactionHash;
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async confirmTx(txhash:string):Promise<ActionData<"reverted"|"confirmed"|"timeout">>{
        let result = new ActionData<"reverted"|"confirmed"|"timeout">();
        const blockRef = await this.web3.eth.getBlockNumber();
        while(true){
            const bestBlock = await this.web3.eth.getBlockNumber();
            try {
                
            } catch (error) {
                
            }
        }
        return result;
    }

    private initE2VBridgeVerifier(){
        const filePath = path.join(this.env.contractdir,"/ethereum/Contract_E2VBridgeVerifier.sol");
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

