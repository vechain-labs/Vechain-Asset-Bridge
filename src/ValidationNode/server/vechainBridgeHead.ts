import { Framework } from "@vechain/connex-framework";
import { Contract } from "myvetools";
import { compileContract } from "myvetools/dist/utils";
import path from "path";
import { abi } from "thor-devkit";
import { ActionData } from "../utils/components/actionResult";
import { IBridgeHead } from "../utils/iBridgeHead";
import { BridgeSnapshoot, ZeroRoot } from "../utils/types/bridgeSnapshoot";
import { SwapTx } from "../utils/types/swapTx";

export class VeChainBridgeHead implements IBridgeHead {

    constructor(env:any){
        this.env = env;
        this.connex = this.env.connex;
        this.config = this.env.config;
        this.initV2EBridge();
    }

    private readonly scanBlockStep = 100;
    
    private readonly UpdateMerkleRootEvent = new abi.Event({
            type:"event",
            name:"UpdateMerkleRoot",
            inputs:[
                {name:"_root",type:"bytes32",indexed:true},
                {name:"_from",type:"uint",indexed:true},
                {name:"_parentRoot",type:"bytes32",indexed:true}
            ]
    });

    private readonly SwapEvent = new abi.Event({
        type:"event",
        name:"Swap",
        inputs:[
            {name:"_token",type:"address",indexed:true},
            {name:"_from",type:"address",indexed:true},
            {name:"_to",type:"address",indexed:true},
            {name:"_amount",type:"uint256",indexed:false}
        ]
    });

    private readonly ClaimEvent = new abi.Event({
        type:"event",
        name:"Claim",
        inputs:[
            {name:"_token",type:"address",indexed:true},
            {name:"_to",type:"address",indexed:true},
            {name:"_amount",type:"uint256",indexed:false}
        ]
    });

    public async getSnapshoot(begin:number,end:number):Promise<ActionData<BridgeSnapshoot[]>>{
        let result = new ActionData<BridgeSnapshoot[]>();
        result.data = new Array<BridgeSnapshoot>();
        let snapshoots = new Array<BridgeSnapshoot>();

        let filter = this.connex.thor.filter("event",[{
            address:this.config.vechain.contracts.v2eBridge,
            topic0:this.UpdateMerkleRootEvent.signature
        }]).order("desc"); 

        let snapShoot:BridgeSnapshoot = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {
                    chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,beginBlockNum:0,endBlockNum:0}
            ]
        };

        for(let blockNum = end;blockNum >= begin;){
            let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
            let to = blockNum;
            let events = await filter.range({unit:"block",from:from,to:to}).apply(0,1);
            if(events.length == 1){
                let ev = events[0];
                snapShoot.merkleRoot = ev.topics[1];
                snapShoot.parentMerkleRoot = ev.topics[3];
                snapShoot.chains[0].beginBlockNum = parseInt(ev.topics[2],16);
                snapShoot.chains[0].endBlockNum = ev.meta.blockNumber - 1;
                break;
            } else {
                blockNum = from - 1;
                continue;
            }
        }

        if(snapShoot.merkleRoot == ZeroRoot()){
            return result;
        }

        snapshoots.push(snapShoot);
        
        if(snapShoot.chains[0].beginBlockNum > begin && snapShoot.parentMerkleRoot != ZeroRoot()){
            let tagetBlock = snapShoot.chains[0].beginBlockNum;
            while(true){
                let events = await filter.range({unit:"block",from:tagetBlock,to:tagetBlock}).apply(0,1);
                if(events.length == 0){
                    result.error = "can't found parent merkle root";
                    return result;
                }
                let ev = events[0];
                let snap:BridgeSnapshoot = {
                    merkleRoot:ev.topics[1],
                    parentMerkleRoot:ev.topics[3],
                    chains:[{
                        chainName:this.config.vechain.chainName,
                        chainId:this.config.vechain.chainId,
                        beginBlockNum:parseInt(ev.topics[2],16),
                        endBlockNum:ev.meta.blockNumber - 1
                    }]
                };
                snapshoots.push(snap);
                if(snap.chains[0].beginBlockNum < begin){
                    break;
                }
                tagetBlock = snap.chains[0].beginBlockNum;
            }
        }

        result.data = snapshoots.reverse();
        return result;
    }

    public async getLastSnapshoot():Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();

        let filter = this.connex.thor.filter("event",[{
            address:this.config.vechain.contracts.v2eBridge,
            topic0:this.UpdateMerkleRootEvent.signature
        }]).order("desc"); 

        let snapShoot:BridgeSnapshoot = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    beginBlockNum:this.config.vechain.startBlockNum,
                    endBlockNum:0
                }
            ]
        };

        let begin = this.config.vechain.startBlockNum;
        let end = this.connex.thor.status.head.number;

        for(let blockNum = end;blockNum >= begin;){
            let from = blockNum - this.scanBlockStep >= begin ? blockNum - this.scanBlockStep : begin;
            let to = blockNum;
            const events = await filter.range({unit:"block",from:from,to:to}).apply(0,1);
            if(events.length == 1){
                let ev = events[0];
                snapShoot.merkleRoot = ev.topics[1];
                snapShoot.parentMerkleRoot = ev.topics[3];
                snapShoot.chains[0].beginBlockNum = parseInt(ev.topics[2],16);
                snapShoot.chains[0].endBlockNum = ev.meta.blockNumber - 1;
                break;
            } else {
                blockNum = from - 1;
                continue;
            }
        }

        result.data = snapShoot;
        return result;
    }

    public async getSnapshootByBlock(block:number):Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();

        let filter = this.connex.thor.filter("event",[{
            address:this.config.vechain.contracts.v2eBridge,
            topic0:this.UpdateMerkleRootEvent.signature
        }]).order("desc"); 

        let snapShoot:BridgeSnapshoot = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,beginBlockNum:0,endBlockNum:0}
            ]
        };

        const events = await filter.range({unit:"block",from:block,to:block}).apply(0,1);
        if(events.length == 1){
            let ev = events[0];
            snapShoot.merkleRoot = ev.topics[1];
            snapShoot.parentMerkleRoot = ev.topics[3];
            snapShoot.chains[0].beginBlockNum = parseInt(ev.topics[2],16);
            snapShoot.chains[0].endBlockNum = ev.meta.blockNumber - 1;
        }
        result.data = snapShoot;
        return result;
    }

    public async getLockedStatus(): Promise<ActionData<boolean>> {
        let result = new ActionData<boolean>();
        
        try {
            const call = await this.v2eBridge.call("locked");
            result.data = Boolean(call.decoded[0]);
        } catch (error) {
            result.error = error;
        }
        
        return result;
    }

    public async getMerkleRoot(): Promise<ActionData<string>> {
        let result = new ActionData<string>();

        try {
            const call = await this.v2eBridge.call("merkleRoot");
            result.data = String(call.decoded[0]);
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
            
            let filter = await this.connex.thor.filter("event",[
                {address:this.config.vechain.v2eBridge,topic0:this.SwapEvent.signature},
                {address:this.config.vechain.v2eBridge,topic0:this.ClaimEvent.signature}
            ]).order("asc").range({unit:"block",from:from,to:to});

            const limit = 200;
            let offset = 0;
            let eventIndex = 0;
            let blockNum = 0;
            let clauseIndex = 0;

            while(true){
                let events = await filter.apply(offset,limit);
                for(const event of events){
                    if(blockNum != event.meta.blockNumber || clauseIndex != event.meta.clauseIndex){
                        eventIndex = 0;
                        blockNum = event.meta.blockNumber;
                        clauseIndex = event.meta.clauseIndex;
                    }

                    let swapTx:SwapTx;
                    if(event.topics[0] == this.SwapEvent.signature){
                        swapTx = {
                            chainName:this.config.vechain.chainName,
                            chainId:this.config.vechain.chainId,
                            blockNumber:blockNum,
                            txid:event.meta.txID,
                            clauseIndex:clauseIndex,
                            index:eventIndex,
                            account:event.topics[3],
                            token:event.topics[1],
                            amount:BigInt(event.data),
                            timestamp:event.meta.blockTimestamp,
                            type:"swap"
                        }
                        
                    } else {
                        swapTx = {
                            chainName:this.config.vechain.chainName,
                            chainId:this.config.vechain.chainId,
                            blockNumber:blockNum,
                            txid:event.meta.txID,
                            clauseIndex:clauseIndex,
                            index:eventIndex,
                            account:event.topics[2],
                            token:event.topics[1],
                            amount:BigInt(event.data),
                            timestamp:event.meta.blockTimestamp,
                            type:"claim"
                        }
                    }
    
                    result.data.push(swapTx);
                    eventIndex++;
                }

                if(events.length == limit){
                    offset = offset + limit;
                    continue;
                } else {
                    break;
                }
            }
            block = to + 1;
        }
        return result;
    }

    private initV2EBridge(){
        const filePath = path.join(this.env.contractdir,"/vechainthor/Contract_V2EBridgeHead.sol");
        const abi = JSON.parse(compileContract(filePath, 'V2EBridgeHead', 'abi'));
        this.v2eBridge = new Contract({abi:abi,connex:this.connex,address:this.config.vechain.contracts.v2eBridge});
    }

    private env:any;
    private config:any;
    private v2eBridge!:Contract;
    private connex!:Framework;
}