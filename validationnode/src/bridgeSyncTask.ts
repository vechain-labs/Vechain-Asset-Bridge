import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import { EthereumBridgeCore } from "./common/ethereum/ethereumBridgeCore";
import { EthereumCommon } from "./common/ethereum/ethereumCommon";
import BlockIndexModel from "./common/model/blockIndexModel";
import ConfigModel from "./common/model/configModel";
import { SnapshootModel } from "./common/model/snapshootModel";
import ValidatorModel from "./common/model/validatorModel";
import BridgeStorage from "./common/utils/bridgeStorage";
import { ActionData, ActionResult } from "./common/utils/components/actionResult";
import { BlockRange } from "./common/utils/types/blockRange";
import { BridgeSnapshoot, ZeroRoot } from "./common/utils/types/bridgeSnapshoot";
import { SwapBridgeTx } from "./common/utils/types/bridgeTx";
import { HashEvent } from "./common/utils/types/hashEvent";
import { TokenInfo } from "./common/utils/types/tokenInfo";
import { Validator } from "./common/utils/types/validator";
import { VeChainBridgeCore } from "./common/vechain/vechainBridgeCore";
import { VeChainBridgeValidator } from "./common/vechain/vechainBridgeValidator";
import { VeChainCommon } from "./common/vechain/vechainCommon";

export class BridgeSyncTask {
    constructor(env:any) {
        this.env = env;
        this.config = env.config;
        this.connex = env.connex;
        this.web3 = env.web3;
        this.validators = new Array();
        this.configModel = new ConfigModel(env);
        this.blockIndexModel = new BlockIndexModel(env);
        this.validatorModel = new ValidatorModel(env);
        this.vechainBridgeValidator = new VeChainBridgeValidator(env);
        this.vechainCommon = new VeChainCommon(env);
        this.ethereumCommon = new EthereumCommon(env);
        this.snapshootModel = new SnapshootModel(env);
        this.veChainBridgeCore = new VeChainBridgeCore(env);
        this.ethereumBridgeCore = new EthereumBridgeCore(env);
    }

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            console.info(`Sync VeChain Block Index`);
            const syncVeChainResult = await this.snycVeChainBlockIndex();
            if(syncVeChainResult.error){
                result.error = syncVeChainResult.error;
                return result;
            }

            console.info(`Sync Ethereum Block Index`);
            const syncEthereumResult = await this.snycEthereumBlockIndex();
            if(syncEthereumResult.error){
                result.error = syncEthereumResult.error;
                return result;
            }

            console.info(`Sync Validator List`);
            const syncValidatorResult = await this.snycValidatorList();
            if(syncValidatorResult.error){
                result.error = syncValidatorResult.error;
                return result;
            }

            console.info(`Sync Snapshoot`);
            const syncSnapshootResult = await this.syncSnapshoots();
            if(syncSnapshootResult.error){
                result.error = syncSnapshootResult.error;
                return result;
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private async snycVeChainBlockIndex():Promise<ActionResult>{
        let result = new ActionResult();
        const chainName = this.config.vechain.chainName as string;
        const chainId = this.config.vechain.chainId as string;
        if(this.env.syncVeChainBlockNum == undefined){
            const latestResult = await this.blockIndexModel.getLatestBlock(chainName,chainId);
            if(latestResult.error){
                result.error = latestResult.error;
                console.error(`GetLatestBlock error: ${result.error}`);
                return result;
            }
            if(latestResult.data != undefined){
                this.env.syncVeChainBlockNum = latestResult.data.blockNum;
            } else {
                this.env.syncVeChainBlockNum = this.config.vechain.startBlockNum as number - 1;
            }
        }

        const beginBlock = this.env.syncVeChainBlockNum + 1;
        const endBlock = (await this.connex.thor.block().get())!.number;

        while(true){
            let tBlockNum = endBlock - this.config.vechain.confirmHeight >= this.env.syncVeChainBlockNum ? this.env.syncVeChainBlockNum - this.config.vechain.confirmHeight : endBlock - this.config.vechain.confirmHeight;
            const getResult = await this.blockIndexModel.getBlockByNumber(chainName,chainId,tBlockNum);
            if(getResult.error){
                result.error = getResult.error;
                return result;
            }
            if(getResult.data != undefined){
                const isForkResult = await this.vechainCommon.blockIsFork(getResult.data.blockId);
                if(isForkResult.error){
                    result.error = isForkResult.error;
                    return result;
                }
                if(isForkResult.data){
                    let delRange:BlockRange = {
                        blockNum:{
                            from:tBlockNum
                        }
                    }
                    await this.blockIndexModel.removeByBlockRange(chainName,chainId,delRange);
                    continue;
                }
                break;
            } else {
                break;
            }
        }

        for(let block = beginBlock;block <= endBlock;){
            let from = block;
            let to = block + this.vechainBlockStep > endBlock ? endBlock:block + this.vechainBlockStep - 1;
            console.debug(`Scan vechain block index: ${from} - ${to}`);
            const getBlockIndexResutl = await this.vechainCommon.getBlockIndex(from,to);
            if(getBlockIndexResutl.error != undefined){
                result.error = getBlockIndexResutl.error;
                console.error(`VeChain getBlockIndex error: ${result.error}`);
                break;
            }
            const saveResult = await this.blockIndexModel.save(getBlockIndexResutl.data!);
            if(saveResult.error != undefined){
                console.error(`Save blockindex error: ${result.error}`);
                result.error = saveResult.error;
            }
            block = to + 1;
            this.env.syncVeChainBlockNum = to;
        }
        return result;
    }

    private async snycEthereumBlockIndex():Promise<ActionResult>{
        let result = new ActionResult();
        const chainName = this.config.ethereum.chainName as string;
        const chainId = this.config.ethereum.chainId as string;
        if(this.env.syncEthereumBlockNum == undefined){
            const latestResult = await this.blockIndexModel.getLatestBlock(chainName,chainId);
            if(latestResult.error){
                result.error = latestResult.error;
                console.error(`GetLatestBlock error: ${result.error}`);
                return result;
            }
            if(latestResult.data != undefined){
                this.env.syncEthereumBlockNum = latestResult.data.blockNum;
            } else {
                this.env.syncEthereumBlockNum = this.config.ethereum.startBlockNum as number - 1;
            }
        }

        const beginBlock = this.env.syncEthereumBlockNum + 1;
        const endBlock = await this.web3.eth.getBlockNumber();

        while(true){
            const tBlockNum = endBlock - this.config.ethereum.confirmHeight >= this.env.syncEthereumBlockNum ? this.env.syncEthereumBlockNum : endBlock - this.config.ethereum.confirmHeight;
            const getResult = await this.blockIndexModel.getBlockByNumber(chainName,chainId,tBlockNum);
            if(getResult.error){
                result.error = getResult.error;
                return result;
            }
            if(getResult.data != undefined){
                const isForkResult = await this.ethereumCommon.blockIsFork(getResult.data.blockId);
                if(isForkResult.error){
                    result.error = isForkResult.error;
                    return result;
                }
                if(isForkResult.data){
                    let delRange:BlockRange = {
                        blockNum:{
                            from:tBlockNum
                        }
                    }
                    await this.blockIndexModel.removeByBlockRange(chainName,chainId,delRange);
                    continue;
                }
                break;
            } else {
                break;
            }
        }

        for(let block = beginBlock;block <= endBlock;){
            let from = block;
            let to = block + this.ethereumBlockStep > endBlock ? endBlock:block + this.ethereumBlockStep - 1;
            console.debug(`Scan ethereum block index: ${from} - ${to}`);
            const getBlockIndexResutl = await this.ethereumCommon.getBlockIndex(from,to);
            if(getBlockIndexResutl.error != undefined){
                result.error = getBlockIndexResutl.error;
                console.error(`Ethereum getBlockIndex error: ${result.error}`);
                break;
            }
            const saveResult = await this.blockIndexModel.save(getBlockIndexResutl.data!);
            if(saveResult.error != undefined){
                console.error(`Save blockindex error: ${result.error}`);
                result.error = saveResult.error;
            }
            block = to + 1;
            this.env.syncEthereumBlockNum = to;
        }
        return result;
    }

    private async snycValidatorList():Promise<ActionResult>{
        let result = new ActionResult();
        let needUpdate = false;

        if(this.env.validatorsSync == undefined){
            const configResult = await this.configModel.get(['validatorsSync']);
            if(configResult.error == undefined && configResult.data!.has('validatorsSync')){
                this.env.validatorsSync = Number(configResult.data!.get('validatorsSync'));
            } else {
                this.env.validatorsSync = this.config.vechain.startBlockNum;
            }
        }

        if(this.validators.length == 0){
            const localValidatorResult = await this.validatorModel.getValidators();
            if(localValidatorResult.error){
                result.error = localValidatorResult.error;
                return result;
            }   
            this.validators = localValidatorResult.data!;
        } else {
            this.validators = this.env.validators;
        }

        const bestBlock = this.connex.thor.status.head.number;
        if(this.env.validatorsSync < bestBlock){
            const getValidatorsResult = await this.vechainBridgeValidator.getValidators(this.env.validatorsSync + 1,bestBlock);
            if(getValidatorsResult.error){
                result.error = getValidatorsResult.error;
                return result;
            }
            if(getValidatorsResult.data!.length > 0){
                needUpdate = true;
                for(const item of getValidatorsResult.data!){
                    const index = this.validators.findIndex( validator => {return validator.validator == validator.validator;});
                    if(index == -1){
                        this.validators.push(item);
                    } else {
                        this.validators[index] = item;
                    }
                }
            }
            if(needUpdate){
                await this.validatorModel.save(this.validators);
            }

            if(bestBlock - this.env.validatorsSync > 0 ){
                await this.configModel.save(new Map([['validatorsSync',bestBlock.toString()]]));
            }
            this.env.validatorsSync = bestBlock;
            this.env.validators = this.validators;
        }
        return result;
    }

    private async syncSnapshoots():Promise<ActionResult>{
        let result = new ActionResult();

        const getRangeResult = await this.noSyncRange();
        if(getRangeResult.error){
            result.error = getRangeResult.error;
            return result;
        }

        let range = getRangeResult.data!;
        if(range.begin == range.end){
            console.info(`Complete synchronization`);
            return result;
        }

        for(let index = range.begin + 1;index <= range.end;index++){
            const getRootResult = await this.veChainBridgeCore.getSnapshootByIndex(index);
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

            const vechainInfo = snapshoot.chains.find( i => {return i.chainName == this.config.vechain.chainName && i.chainId == this.config.vechain.chainId;})!;
            const ethereumInfo = snapshoot.chains.find( i => {return i.chainName == this.config.ethereum.chainName && i.chainId == this.config.ethereum.chainId;})!;
            const delVeChainCacheRange:BlockRange = {
                blockNum:{
                    to:vechainInfo.endBlockNum > this.blockCacheLimit ? vechainInfo.endBlockNum - this.blockCacheLimit : this.blockCacheLimit
                }
            }
            const delEthereumCacheRange:BlockRange = {
                blockNum:{
                    to:ethereumInfo.endBlockNum > this.blockCacheLimit ? ethereumInfo.endBlockNum - this.blockCacheLimit : this.blockCacheLimit
                }
            }

            await this.blockIndexModel.removeByBlockRange(this.config.vechain.chainName,this.config.vechain.chainId,delVeChainCacheRange);
            await this.blockIndexModel.removeByBlockRange(this.config.ethereum.chainName,this.config.ethereum.chainId,delEthereumCacheRange);
        }
        return result;
    }

    private async noSyncRange():Promise<ActionData<{begin:number,end:number}>>{
        let result = new ActionData<{begin:number,end:number}>();
        result.data = {begin:0,end:0};

        const lastIndexResult = await this.veChainBridgeCore.getRootCount();
        if(lastIndexResult.error){
            result.error = lastIndexResult.error;
            return result;
        }

        const localSnResult = await this.snapshootModel.getLastSnapshoot();
        if(localSnResult.error){
            result.error = localSnResult.error;
            return result;
        }
        
        const indexResult = await this.veChainBridgeCore.getSnapshootByRoot(localSnResult.data!.merkleRoot);
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
            const getEventsResult = await this.veChainBridgeCore.getSubmitEventsByRange(vechain.beginBlockNum,vechain.endBlockNum);
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
    private connex:Framework;
    private web3:Web3;
    private validators:Array<Validator>;
    private configModel:ConfigModel;
    private blockIndexModel:BlockIndexModel;
    private validatorModel:ValidatorModel;
    private readonly vechainBlockStep:number = 200;
    private readonly ethereumBlockStep:number = 200;
    private readonly blockCacheLimit:number = 2000;
    private vechainBridgeValidator!:VeChainBridgeValidator;
    private vechainCommon!:VeChainCommon;
    private ethereumCommon!:EthereumCommon;
    private snapshootModel!:SnapshootModel;
    private veChainBridgeCore!:VeChainBridgeCore;
    private ethereumBridgeCore!:EthereumBridgeCore;

}