import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import { EthereumBridgeCore } from "./common/ethereum/ethereumBridgeCore";
import { SnapshootModel } from "./common/model/snapshootModel";
import BridgeStorage from "./common/utils/bridgeStorage";
import { ActionData, ActionResult } from "./common/utils/components/actionResult";
import { BridgeSnapshoot, ZeroRoot } from "./common/utils/types/bridgeSnapshoot";
import { HashEvent } from "./common/utils/types/hashEvent";
import { VeChainBridgeCore } from "./common/vechain/vechainBridgeCore";

export class FTSnapshootScanner {
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = this.env.connex;
        this.web3 = this.env.web3;
        this.vechainBridgeCore = new VeChainBridgeCore(env);
        this.ethereumBridgeCore = new EthereumBridgeCore(env);
        this.snapshootModel = new SnapshootModel(env);
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();
        
        const getRangeResult = await this.noSyncRange();
        if(getRangeResult.error){
            result.error = getRangeResult.error;
            return result;
        }
        let range = getRangeResult.data!;
        if(range.begin == range.end){
            console.debug(`Complete synchronization`);
            return result;
        }

        for(let index = range.begin + 1;index <= range.end;index++){
            const getRootResult = await this.vechainBridgeCore.getSnapshootByIndex(index);
            if(getRootResult.error){
                result.error = getRootResult.error;
                return result;
            } else if(getRootResult.data!.merkleRoot == ZeroRoot()){
                console.warn(`Can't load merkleroot by index ${index}`);
                result.error = new Error(`Can't load merkleroot by index ${index}`);
                return result;
            }

            const snapshoot = getRootResult.data!;
            const getHashEventsResult = await this.getSubmitEventsBySn(snapshoot);
            if(getHashEventsResult.error){
                result.error = getHashEventsResult.error;
                return result;
            }

            if(!this.checkSnapshoot(snapshoot,getHashEventsResult.data!)){
                result.error = new Error(`syncDataBySnapshoot error:hash mismatching, snRoot: ${snapshoot.merkleRoot}`);
                return result;
            }

            const saveResult = await this.snapshootModel.save([snapshoot],getHashEventsResult.data!);
            if(saveResult.error){
                result.error = saveResult.error;
                return result;
            }
        }
        return result;
    }

    private async noSyncRange():Promise<ActionData<{begin:number,end:number}>>{
        let result = new ActionData<{begin:number,end:number}>();
        result.data = {begin:0,end:0};

        const lastIndexResult = await this.vechainBridgeCore.getRootCount();
        if(lastIndexResult.error){
            result.error = lastIndexResult.error;
            return result;
        }

        const localSnResult = await this.snapshootModel.getLastSnapshoot();
        if(localSnResult.error){
            result.error = localSnResult.error;
            return result;
        }
        
        const indexResult = await this.vechainBridgeCore.getSnapshootByRoot(localSnResult.data!.merkleRoot);
        if(indexResult.error){
            result.error = indexResult.error;
            return result;
        }

        result.data = {begin:indexResult.data!.index,end:lastIndexResult.data!};
        return result;
    }

    private async getSubmitEventsBySn(sn:BridgeSnapshoot):Promise<ActionData<HashEvent[]>>{
        let result = new ActionData<HashEvent[]>();
        result.data = new Array();

        const vechain = sn.chains.find( item => {return item.chainName == this.config.vechain.chainName && item.chainId == this.config.vechain.chainId})!;
        const ethereum = sn.chains.find( item => {return item.chainName == this.config.ethereum.chainName && item.chainId == this.config.ethereum.chainId})!;

        if(vechain.beginBlockNum != 0 && vechain.endBlockNum != 0){
            const getEventsResult = await this.vechainBridgeCore.getSubmitEventsByRange(vechain.beginBlockNum,vechain.endBlockNum);
            if(getEventsResult.error){
                result.error = getEventsResult.error;
                return result;
            }
            result.data = result.data.concat(getEventsResult.data!);
        }

        if(ethereum.beginBlockNum != 0 && ethereum.endBlockNum != 0){
            const getEventsResult = await this.ethereumBridgeCore.getSubmitEventsByRange(ethereum.beginBlockNum,ethereum.endBlockNum);
            if(getEventsResult.error){
                result.error = getEventsResult.error;
                return result;
            }
            result.data = result.data.concat(getEventsResult.data!);
        }
        return result;
    }

    private checkSnapshoot(sn:BridgeSnapshoot,events:HashEvent[]):boolean{
        const storage = new BridgeStorage();
        const appid = events.length > 0 ? events[0].appid : "";
        storage.buildTree(appid,sn,events);
        const treeRoot = storage.getMerkleRoot();
        const result = treeRoot.toLowerCase() == sn.merkleRoot.toLowerCase();
        if(result == false){
            console.warn(`syncDataBySnapshoot error:hash mismatching, snRoot: ${sn.merkleRoot},treeRoot: ${treeRoot}`);
        }
        return result;
    }

    private env:any;
    private config:any;
    private connex!:Framework;
    private web3!:Web3;
    private vechainBridgeCore!:VeChainBridgeCore;
    private ethereumBridgeCore!:EthereumBridgeCore;
    private snapshootModel!:SnapshootModel;

}