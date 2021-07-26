import { compileContract } from "myvetools/dist/utils";
import path from "path";
import Web3 from "web3";
import Web3Eth from 'web3-eth';
import { ActionData } from "../utils/components/actionResult";
import { IBridgeHead } from "../utils/iBridgeHead";
import { BridgeSnapshoot, ZeroRoot } from "../utils/types/bridgeSnapshoot";
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

    public async getLastSnapshoot(): Promise<ActionData<BridgeSnapshoot>> {
        let result = new ActionData<BridgeSnapshoot>();

        try {

            let snapshoot:BridgeSnapshoot = {
                parentMerkleRoot:ZeroRoot(),
                merkleRoot:ZeroRoot(),
                chains:[
                    {
                        chainName:this.config.ethereum.chainName,
                        chainId:this.config.ethereum.chainId,
                        beginBlockNum:this.config.ethereum.startBlockNum,
                        endBlockNum:0
                    }
                ]
            };

            const begin = await this.web3.eth.getBlockNumber();
            const end = this.config.ethereum.startBlockNum;

            for(let blockNum = end;blockNum >= begin;){
                let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
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
                snapshoot.chains[0].beginBlockNum = parseInt(ev.raw.topics[2],16);
                snapshoot.chains[0].endBlockNum = ev.blockNumber - 1;
                break;
            }
            result.data = snapshoot;
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getSnapshoot(begin:number,end:number):Promise<ActionData<BridgeSnapshoot[]>>{
        let result = new ActionData<BridgeSnapshoot[]>();
        result.data = new Array<BridgeSnapshoot>();
        let snapshoots = new Array<BridgeSnapshoot>();

        try {

            let snapShoot:BridgeSnapshoot = {
                parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
                merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
                chains:[
                    {chainName:this.config.ethereum.chainName,chainId:this.config.ethereum.chainId,beginBlockNum:0,endBlockNum:0}
                ]
            };

            for(let blockNum = end;blockNum >= begin;){
                let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
                let to = blockNum;

                const events = await this.e2vBridge.getPastEvents("UpdateMerkleRoot",{fromBlock:from,toBlock:to});
                if(events.length == 0){
                    blockNum = from - 1;
                    continue;
                }
                const sorted:Array<EventData> = sortArray(events,[
                    {by:"blockNumber",order:"desc"},
                    {by:"transactionIndex",order:"desc"}]);

                const ev = sorted[0];
                snapShoot.merkleRoot = ev.raw.topics[1];
                snapShoot.parentMerkleRoot = ev.raw.topics[3];
                snapShoot.chains[0].beginBlockNum = parseInt(ev.raw.topics[2],16);
                snapShoot.chains[0].endBlockNum = ev.blockNumber - 1;
                break;
            }

            if(snapShoot.merkleRoot == "0x0000000000000000000000000000000000000000000000000000000000000000"){
                return result;
            }

            snapshoots.push(snapShoot);

            if(snapShoot.chains[0].beginBlockNum > begin && snapShoot.parentMerkleRoot != "0x0000000000000000000000000000000000000000000000000000000000000000"){
                let tagetBlock = snapShoot.chains[0].beginBlockNum;
                while(true){
                    const events = await this.e2vBridge.getPastEvents("UpdateMerkleRoot",{fromBlock:tagetBlock,toBlock:tagetBlock});
                    if(events.length == 0){
                        result.error = "can't found parent merkle root";
                        return result;
                    }
                    let ev = events[0];
                    let snap:BridgeSnapshoot = {
                        merkleRoot:ev.raw.topics[1],
                        parentMerkleRoot:ev.raw.topics[3],
                        chains:[{
                            chainName:this.config.ethereum.chainName,
                            chainId:this.config.ethereum.chainId,
                            beginBlockNum:parseInt(ev.raw.topics[2],16),
                            endBlockNum:ev.blockNumber - 1
                        }]
                    };
                    snapshoots.push(snap);
                    if(snap.chains[0].beginBlockNum < begin){
                        break;
                    }
                    tagetBlock = snap.chains[0].beginBlockNum;
                }
            }
        } catch (error) {
            result.error = error;
        }

        result.data = snapshoots.reverse();
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

        // DEBUG
        return result;

        let blockCache:Map<number,Web3Eth.BlockTransactionString> = new Map();
        

        try {
            for(let block = begin; block <= end;){
                let from = block;
                let to = block + this.scanBlockStep > end ? end:block + this.scanBlockStep;
    
                const swapEvents = await this.e2vBridge.getPastEvents("Swap",{fromBlock:from,toBlock:to});
                for(const swapEvent of swapEvents){

                    if(!blockCache.has(swapEvent.blockNumber)){
                        const block = await this.web3.eth.getBlock(swapEvent.blockNumber);
                        blockCache.set(block.number,block);
                    }

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
                        timestamp:blockCache.get(swapEvent.blockNumber)!.timestamp as number,
                        type:"swap"
                    };
                    result.data!.push(swapTx)
                }
    
                const claimEvents = await this.e2vBridge.getPastEvents("Claim",{fromBlock:from,toBlock:to});
                for(const claimEvent of claimEvents){

                    if(!blockCache.has(claimEvent.blockNumber)){
                        const block = await this.web3.eth.getBlock(claimEvent.blockNumber);
                        blockCache.set(block.number,block);
                    }


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
                        timestamp:blockCache.get(claimEvent.blockNumber)!.timestamp as number,
                        type:"claim"
                    };
                    result.data!.push(swapTx)
                }
    
                block = to + 1;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private initE2VBridge(){
        const filePath = path.join(this.env.contractdir,"/ethereum/Contract_E2VBridgeHead.sol");
        const abi = JSON.parse(compileContract(filePath, "E2VBridgeHead", "abi"));
        this.e2vBridge = new this.web3.eth.Contract(abi,this.config.ethereum.contracts.e2vBridge);
    }

    private env:any;
    private web3!:Web3;
    private config:any;
    private e2vBridge!:EthContract;
}