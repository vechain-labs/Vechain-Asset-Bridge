import Web3 from "web3";
import {Contract as EthContract} from 'web3-eth-contract';
import path from "path";
import { compileContract } from "myvetools/dist/utils";
import { SimpleWallet } from "@vechain/connex-driver";
import { ActionData } from "./utils/components/actionResult";
import { sleep } from "./utils/sleep";


export class EthereumBridgeVerifierReader {

    constructor(env:any){
        this.env = env;
        this.config = this.env.config;
        this.web3 = this.env.web3;
        
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

    public async getLockBridgeProposal(hash:string):Promise<ActionData<BaseProposal>>{
        let result = new ActionData<BaseProposal>();

        try {
            const call = await this.e2vBridgeVerifier.methods.lockBridgeProposals(hash).call();
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
            const call = await this.e2vBridgeVerifier.methods.merkleRootProposals(hash).call();
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

    private initE2VBridgeVerifier(){
        const filePath = path.join(this.env.contractdir,"/ethereum/Contract_E2VBridgeVerifier.sol");
        const abi = JSON.parse(compileContract(filePath,"E2VBridgeVerifier","abi",[this.env.contractdir]));
        this.e2vBridgeVerifier = new this.web3.eth.Contract(abi,this.config.ethereum.contracts.e2vBridgeVerifier);
    }

    protected env:any;
    protected config:any;
    protected web3!:Web3;
    protected e2vBridgeVerifier!:EthContract;
}
export class EthereumBridgeVerifier extends EthereumBridgeVerifierReader{
    
    constructor(env:any){
        super(env);
        this.wallet = this.env.wallet;
    }

    public async lockBridge(lastRoot:string,sigs:string[]):Promise<ActionData<string>>{
        let result = new ActionData<string>();

        try {
            const blockRef =  await this.web3.eth.getBlockNumber();
            const expirnum = this.config.ethereum.expiration as number;
            const gasprice = "0x" + await this.web3.eth.getGasPrice();
            const lockMethod = this.e2vBridgeVerifier.methods.lockBridge(lastRoot,sigs,blockRef,expirnum);
            const gas = await lockMethod.estimateGas({
                from:this.wallet.list[0].address
            });

            const receipt = await lockMethod.send({
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

    public async checkTxStatus(txhash:string,blockRef:number):Promise<ActionData<"reverted"|"confirmed"|"expired"|"pendding">>{
        let result = new ActionData<"reverted"|"confirmed"|"expired"|"pendding">();
        const bestBlock = await this.web3.eth.getBlockNumber();

        try {
            const receipt = await this.web3.eth.getTransactionReceipt(txhash);
            if(receipt != null && bestBlock - blockRef > this.config.ethereum.confirmHeight){
                if(receipt.status == false){
                    result.data = "reverted";
                } else {
                    result.data = "confirmed";
                }
            } else if(bestBlock - blockRef > this.config.ethereum.expiration) {
                result.data = "expired";
            } else {
                console.debug(`pending ${bestBlock - blockRef}/${this.config.ethereum.confirmHeight}`);
                result.data = "pendding";
            }
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
                const receipt = await this.web3.eth.getTransactionReceipt(txhash);
                if(receipt != null){
                    if(receipt.status == false){
                        result.data = "reverted";
                        break;
                    }
                    if(bestBlock - receipt.blockNumber >= this.config.ethereum.confirmHeight){
                        result.data = "confirmed";
                        break;
                    } else {
                        continue;
                    }
                } else {
                    if(bestBlock - blockRef > this.config.ethereum.expiration){
                        result.data = "timeout";
                        break;
                    }
                }
            } catch (error) {
                result.error = error;
                break;
            }
            await sleep(10 * 1000);
        }
        return result;
    }

    private wallet!:SimpleWallet;
}

export type BaseProposal = {
    hash:string;
    executed:boolean;
}

