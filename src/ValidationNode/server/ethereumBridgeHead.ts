import { compileContract } from "myvetools/dist/utils";
import path from "path";
import Web3 from "web3";
import { ActionData } from "../utils/components/actionResult";
import { IBridgeHead } from "../utils/iBridgeHead";
import { BridgeSnapshoot } from "../utils/types/bridgeSnapshoot";
import { SwapTx } from "../utils/types/swapTx"; 
import {Contract as EthContract, EventData} from 'web3-eth-contract';
const sortArray = require('sort-array');

export class EthereumBridgeHead implements IBridgeHead{

    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.web3 = this.env.web3;
        this.initE2VBridge();
    }

    private readonly scanBlockStep = 100;

    public async getLashSnapshootOnChain(): Promise<ActionData<BridgeSnapshoot>> {
        let result = new ActionData<BridgeSnapshoot>();

        try {
            const bestBlockNum = await this.web3.eth.getBlockNumber();
            const startBlockNum = this.config.vechain.startBlockNum;

            let snapshoot:BridgeSnapshoot = {
                parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
                merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
                chains:[
                    {chainName:this.config.ethereum.chainName,chainId:this.config.ethereum.chainId,fromBlockNum:startBlockNum,endBlockNum:bestBlockNum}
                ]
            };

            for(let blockNum = bestBlockNum;blockNum >= startBlockNum;){
                let from = blockNum - this.scanBlockStep >= startBlockNum ? blockNum - this.scanBlockStep : startBlockNum;
                let to = blockNum;

                const evets = await this.e2vBridge.getPastEvents("UpdateMerkleRoot",{fromBlock:from,toBlock:to});
                if(evets.length == 0){
                    blockNum = from - 1;
                    continue;
                }
                const sorted:Array<EventData> = sortArray(evets,[
                    {by:"blockNumber",order:"desc"},
                    {by:"transactionIndex",order:"desc"}]);

                const ev = sorted[0];
                snapshoot.merkleRoot = ev.raw.topics[1];
                snapshoot.parentMerkleRoot = ev.raw.topics[3];
                snapshoot.chains[0].fromBlockNum = parseInt(ev.raw.topics[2],16);
                snapshoot.chains[0].endBlockNum = ev.blockNumber;
                break;
            }
            result.data = snapshoot;
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getLockedStatus(): Promise<ActionData<boolean>> {
        let result = new ActionData<boolean>();
        try {
            const data = await this.e2vBridge.methods.locked().call();
            result.data = Boolean(data);
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async getMerkleRoot(): Promise<ActionData<string>> {
        let result = new ActionData<string>();
        try {
            const data = await this.e2vBridge.methods.merkleRoot().call();
            result.data = String(data);
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async scanTxs(begin:number,end:number): Promise<ActionData<SwapTx[]>> {
        let result = new ActionData<SwapTx[]>();
        result.data = new Array<SwapTx>();

        for(let block = begin; block <= end;){
            let from = block;
            let to = block + this.scanBlockStep > end ? end:block + this.scanBlockStep;

            const swapEvents = await this.e2vBridge.getPastEvents("Swap",{fromBlock:from,toBlock:to});
            for(const swapEvent of swapEvents){
                let swapTx:SwapTx = {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    blockNumber:swapEvent.blockNumber,
                    txid:swapEvent.transactionHash,
                    clauseIndex:0,
                    index:swapEvent.logIndex,
                    account:swapEvent.raw.topics[3],
                    token:swapEvent.raw.topics[1],
                    amount:BigInt(swapEvent.raw.data),
                    type:"swap"
                };
                result.data.push(swapTx)
            }

            const claimEvents = await this.e2vBridge.getPastEvents("Claim",{fromBlock:from,toBlock:to});
            for(const claimEvent of claimEvents){
                let swapTx:SwapTx = {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    blockNumber:claimEvent.blockNumber,
                    txid:claimEvent.transactionHash,
                    clauseIndex:0,
                    index:claimEvent.logIndex,
                    account:claimEvent.raw.topics[2],
                    token:claimEvent.raw.topics[1],
                    amount:BigInt(claimEvent.raw.data),
                    type:"claim"
                };
                result.data.push(swapTx)
            }

            block = to + 1;
        }
        return result;
    }

    private initE2VBridge(){
        const filePath = path.join(__dirname,"../../../src/SmartContracts/contracts/ethereum/Contract_E2VBridgeHead.sol");
        const abi = JSON.parse(compileContract(filePath, "E2VBridgeHead", "abi"));
        this.e2vBridge = new this.web3.eth.Contract(abi,this.config.ethereum.contracts.e2vBridge);
    }

    private env:any;
    private web3!:Web3;
    private config:any;
    private e2vBridge!:EthContract;

}