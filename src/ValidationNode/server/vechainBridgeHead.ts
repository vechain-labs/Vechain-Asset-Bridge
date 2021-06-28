import { Framework } from "@vechain/connex-framework";
import { Contract } from "myvetools";
import { compileContract } from "myvetools/dist/utils";
import path from "path";
import { abi } from "thor-devkit";
import { ActionData } from "../utils/components/actionResult";
import { IBridgeHead } from "../utils/iBridgeHead";
import { BridgeSnapshoot } from "../utils/types/bridgeSnapshoot";
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
                {name:"_lastRoot",type:"bytes32",indexed:true}
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


    public async getLashSnapshootOnChain(): Promise<ActionData<BridgeSnapshoot>> {
        let result = new ActionData<BridgeSnapshoot>();

        const bestBlockNum = this.connex.thor.status.head.number;
        const startBlockNum = this.config.vechain.startBlockNum;

        let snapshoot:BridgeSnapshoot = {
            parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
            chains:[
                {chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,fromBlockNum:startBlockNum,endBlockNum:bestBlockNum}
            ]
        };

        let filter = this.connex.thor.filter("event",[{
            address:this.config.vechain.contracts.v2eBridge,
            topic0:this.UpdateMerkleRootEvent.signature
        }]).order("desc"); 

        for(let blockNum = bestBlockNum;blockNum >= startBlockNum;){
            let from = blockNum - this.scanBlockStep >= startBlockNum ? blockNum - this.scanBlockStep : startBlockNum;
            let to = blockNum;
            let filterResult = await filter.range({unit:"block",from:from,to:to}).apply(0,1);
            if(filterResult.length == 1){
                let ev = filterResult[0];
                snapshoot.merkleRoot = ev.topics[1];
                snapshoot.parentMerkleRoot = ev.topics[3];
                snapshoot.chains[0].fromBlockNum = parseInt(ev.topics[2],16);
                snapshoot.chains[0].endBlockNum = ev.meta.blockNumber;
                break;
            } else {
                blockNum = from - 1;
                continue;
            }
        }

        result.data = snapshoot;
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
        const filePath = path.join(__dirname,"../../../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeHead.sol");
        const abi = JSON.parse(compileContract(filePath, 'V2EBridgeHead', 'abi'));
        this.v2eBridge = new Contract({abi:abi,connex:this.connex,address:this.config.vechain.contracts.v2eBridge});
    }

    private env:any;
    private config:any;
    private v2eBridge!:Contract;
    private connex!:Framework;
}