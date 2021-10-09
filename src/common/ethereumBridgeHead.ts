import { compileContract } from "myvetools/dist/utils";
import path from "path";
import Web3 from "web3";
import Web3Eth from 'web3-eth';
import {Contract as EthContract, EventData} from 'web3-eth-contract';
import { ActionData } from "./utils/components/actionResult";
import { ThorDevKitEx } from "./utils/extensions/thorDevkitExten";
import { IBridgeHead } from "./utils/iBridgeHead";
import { BridgeSnapshoot, ZeroRoot } from "./utils/types/bridgeSnapshoot";
import { SwapTx } from "./utils/types/swapTx";

export class EthereumBridgeHead implements IBridgeHead{

    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.web3 = this.env.web3;
        this.initE2VBridge();
    }

    private readonly scanBlockStep = 100;

    public async getLastSnapshoot(): Promise<ActionData<{sn:BridgeSnapshoot,txid:string,blocknum:number}>>{
        let result = new ActionData<{sn:BridgeSnapshoot,txid:string,blocknum:number}>();

        try {

            let snapshoot:BridgeSnapshoot = {
                parentMerkleRoot:ZeroRoot(),
                merkleRoot:ZeroRoot(),
                chains:[
                    {
                        chainName:this.config.ethereum.chainName,
                        chainId:this.config.ethereum.chainId,
                        beginBlockNum:this.config.ethereum.startBlockNum,
                        lockedBlockNum:this.config.ethereum.startBlockNum,
                        endBlockNum:0
                    }
                ]
            };
            let txid:string = "";
            let blocknum:number = 0;

            const begin = this.config.ethereum.startBlockNum;
            const end = await this.web3.eth.getBlockNumber();


            for(let blockNum = end;blockNum >= begin;){
                let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
                let to = blockNum;

                const events = await this.e2vBridge.getPastEvents("UpdateMerkleRoot",{fromBlock:from,toBlock:to});
                if(events.length == 0){
                    blockNum = from - 1;
                    continue;
                }

                const ev = events[events.length - 1];
                snapshoot.merkleRoot = ev.raw.topics[1];
                snapshoot.parentMerkleRoot = ev.raw.topics[3];
                snapshoot.chains[0].beginBlockNum = parseInt(ev.raw.topics[2],16);
                snapshoot.chains[0].endBlockNum = ev.blockNumber;

                const lockevsResult = await this.lockChangeEvents(snapshoot.chains[0].beginBlockNum,snapshoot.chains[0].endBlockNum);
                if(lockevsResult.error != undefined){
                    result.copyBase(lockevsResult);
                    return result;
                }

                const lockevs = lockevsResult.data!.filter(ev =>{return ev.root == snapshoot.parentMerkleRoot && ev.status == true; });
                if(lockevs == undefined || lockevs.length == 0){
                    result.error = new Error(`can't found lockchange event, root:${snapshoot.parentMerkleRoot}`);
                    return result;
                }
                snapshoot.chains[0].lockedBlockNum = lockevs[0].blockNum;
                txid = ev.transactionHash;
                blocknum = ev.blockNumber;
                
                break;
            }
            result.data = {sn:snapshoot,txid:txid,blocknum:blocknum};
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getSnapshoot(begin:number,end:number):Promise<ActionData<BridgeSnapshoot[]>>{
        let result = new ActionData<BridgeSnapshoot[]>();
        result.data = new Array();

        const upEventResult = await this.updateMerkleRootEvents(begin,end);
        if(upEventResult.error != undefined){
            result.copyBase(upEventResult);
            return result;
        }
        let upEvents = upEventResult.data!;
        let lockEvents = new Array<{blockNum:number,root:string,status:boolean}>();

        if(upEvents.length>0){
            const lockEventsResult = await this.lockChangeEvents(upEvents[0].from,end);
            if(lockEventsResult.error != undefined){
                result.copyBase(lockEventsResult);
                return result;
            }
            lockEvents = lockEventsResult.data!;
        }

        for(const upEvent of upEvents){
            const targetLockEvent = lockEvents.filter( event => {return event.root == upEvent.parentRoot && event.status;})
                .sort((a,b) => {return b.blockNum - a.blockNum;});
            if(targetLockEvent.length == 0){
                result.error = new Error(`can't get LockChange Event of ${upEvent.parentRoot}`);
            }

            let sn:BridgeSnapshoot = {
                parentMerkleRoot:upEvent.parentRoot,
                merkleRoot:upEvent.root,
                chains:[{
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    lockedBlockNum:targetLockEvent[0].blockNum,
                    beginBlockNum:upEvent.from,endBlockNum:upEvent.blockNum
                }]
            }
            result.data.push(sn);
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

    public async getLastLocked():Promise<ActionData<{txhash:string,blocknum:number,root:string}>>{
        let result = new ActionData<{txhash:string,blocknum:number,root:string}>();

        try {
            const begin = this.config.ethereum.startBlockNum;
            const end = await this.web3.eth.getBlockNumber();

            for(let blockNum = end;blockNum >= begin;){
                let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
                let to = blockNum;

                const events = await this.e2vBridge.getPastEvents("BridgeLockChange",{fromBlock:from,toBlock:to});
                if(events.length == 0){
                    blockNum = from - 1;
                    continue;
                }
                const ev = events[events.length - 1];
                result.data = {txhash:ev.transactionHash,blocknum:ev.blockNumber,root:ev.raw.topics[1]}
                break;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async scanTxs(begin:number,end:number): Promise<ActionData<SwapTx[]>> {

        let result = new ActionData<SwapTx[]>();
        result.data = new Array<SwapTx>();
        let blockCache:Map<number,Web3Eth.BlockTransactionString> = new Map();

        try {
            for(let block = begin; block <= end;){
                let from = block;
                let to = block + this.scanBlockStep > end ? end:block + this.scanBlockStep;

                console.debug(`scan ethereum swaptxs blocknum: ${from} - ${to}`);
    
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
                        account:ThorDevKitEx.Bytes32ToAddress(swapEvent.raw.topics[3]),
                        token:ThorDevKitEx.Bytes32ToAddress(swapEvent.raw.topics[1]),
                        amount:BigInt('0x' + swapEvent.raw.data.substring(2,66)),
                        reward:BigInt('0x' + swapEvent.raw.data.substring(66)),
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
                        account:ThorDevKitEx.Bytes32ToAddress(claimEvent.raw.topics[2]),
                        token:ThorDevKitEx.Bytes32ToAddress(claimEvent.raw.topics[1]),
                        amount:BigInt(claimEvent.raw.data),
                        reward:BigInt(0),
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

    private async updateMerkleRootEvents(begin:number,end:number):Promise<ActionData<{blockNum:number,from:number,root:string,parentRoot:string}[]>>{
        let result = new ActionData<any>();
        result.data = Array();

        let eventData = {blockNum:0,from:0,root:ZeroRoot(),parentRoot:ZeroRoot()}

        for(let blockNum = end;blockNum >= begin;){
            let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
            let to = blockNum;

            const events = await this.e2vBridge.getPastEvents("UpdateMerkleRoot",{fromBlock:from,toBlock:to});
            if(events.length > 0){
                const lastEvent = events[events.length - 1];
                eventData = {
                    blockNum:lastEvent.blockNumber,
                    from:parseInt(lastEvent.raw.topics[2],16),
                    root:lastEvent.raw.topics[1],
                    parentRoot:lastEvent.raw.topics[3]
                }
                break;
            } else {
                blockNum = from - 1;
                continue;
            }
        }

        if(eventData.root == ZeroRoot()){
            return result;
        }

        result.data.push(eventData);

        if(eventData.from > begin && eventData.parentRoot != ZeroRoot()){
            let tagetBlock = eventData.from;
            while(true){
                const events = await this.e2vBridge.getPastEvents("UpdateMerkleRoot",{fromBlock:tagetBlock,toBlock:tagetBlock});
                if(events.length == 0){
                    result.error = new Error("can't found parent merkle root");
                    return result;
                }
                let eventData = {
                    blockNum:events[0].blockNumber,
                    from:parseInt(events[0].raw.topics[2],16),
                    root:events[0].raw.topics[1],
                    parentRoot:events[0].raw.topics[3]
                }
                result.data.push(eventData);
                if(eventData.from <= begin){
                    break;
                }
                tagetBlock = eventData.from;
            }
        }
        result.data = result.data.reverse();
        return result;
    }

    private async lockChangeEvents(begin:number,end:number):Promise<ActionData<{blockNum:number,root:string,status:boolean}[]>>{
        let result = new ActionData<{blockNum:number,root:string,status:boolean}[]>();
        result.data = Array();

        let eventData = {blockNum:0,root:ZeroRoot(),status:false}
        for(let blockNum = end;blockNum >= begin;){
            let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
            let to = blockNum;
            const events = await this.e2vBridge.getPastEvents("BridgeLockChange",{fromBlock:from,toBlock:to});
            if(events.length > 0){
                for(const ev of events){
                    eventData = {
                        blockNum:ev.blockNumber,
                        root:ev.raw.topics[1],
                        status:Boolean(ev.raw.topics[2] != ZeroRoot() ? true : false)
                    }
                    result.data.push(eventData);
                }
            }
            blockNum = from - 1;
        }
        result.data = result.data.reverse();
        return result;
    }

    private initE2VBridge(){
        const filePath = path.join(this.env.contractdir,"/common/Contract_BridgeHead.sol");
        const abi = JSON.parse(compileContract(filePath, "BridgeHead", "abi"));
        this.e2vBridge = new this.web3.eth.Contract(abi,this.config.ethereum.contracts.e2vBridge);
    }

    private env:any;
    private web3!:Web3;
    private config:any;
    private e2vBridge!:EthContract;
}