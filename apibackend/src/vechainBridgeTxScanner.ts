import { Framework } from "@vechain/connex-framework";
import BridgeTxModel from "./common/model/bridgeTxModel";
import ConfigModel from "./common/model/configModel";
import TokenInfoModel from "./common/model/tokenInfoModel";
import { ActionResult } from "./common/utils/components/actionResult";
import { BlockRange } from "./common/utils/types/blockRange";
import { TokenInfo } from "./common/utils/types/tokenInfo";
import { VeChainCommon } from "./common/vechain/vechainCommon";
import { VeChainFTBridge } from "./common/vechain/vechainFTBridge";

export class VeChainBridgeTxScanner {
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = env.connex;
        this.configModel = new ConfigModel();
        this.tokenModel = new TokenInfoModel();
        this.vechainFTBridge = new VeChainFTBridge(env);
        this.bridgeTxModel = new BridgeTxModel(env);
        this.vechainCommon = new VeChainCommon(env);
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();
        const bestBlock = this.connex.thor.status.head.number;

        try {
            if(this.env.vechainSyncBlock == undefined){
                const configResult = await this.configModel.get(['vechainSyncBlock']);
                if(configResult.error == undefined && configResult.data!.has('vechainSyncBlock')){
                    this.env.vechainSyncBlock = Number(configResult.data!.get('vechainSyncBlock'));
                } else {
                    this.env.vechainSyncBlock = this.config.vechain.startBlockNum;
                }
            }

            for(let block = this.env.vechainSyncBlock + 1;block <= bestBlock;){
                let from = block;
                let to = block + this.scanBlockStep > bestBlock ? bestBlock : block + this.scanBlockStep;
                console.info(`Sync VeChain Bridge Data ${from} - ${to}`);
                
                console.debug('Sync VeChain TokenInfos');
                const syncTokensResult = await this.syncTokens(from,to);
                if(syncTokensResult.error){
                    result.error = syncTokensResult.error;
                    return result;
                }

                console.debug('Sync VeChain BridgeTxs');
                const syncBridgeTxsResult = await this.syncBridgeTxs(from,to);
                if(syncBridgeTxsResult.error){
                    result.error = syncBridgeTxsResult.error;
                    return result;
                }
                await this.configModel.save(new Map([['vechainSyncBlock',String(to)]]));
                this.env.vechainSyncBlock = to;

                await this.handleFork();
                block = to + 1;
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    private async syncTokens(from:number,to:number):Promise<ActionResult>{
        let result = new ActionResult();
        let needUpdate = false;

        if(this.env.tokens == undefined || this.env.tokens.length == 0){
            const localResult = await this.tokenModel.getTokenInfos();
            if(localResult.error){
                result.error = localResult.error;
                return result;
            }
            this.env.tokens = localResult.data!;
        } else {
            this.env.tokens = new Array();
        }

        const getResult = await this.vechainFTBridge.getTokenInfosByRange(from,to);
        if(getResult.error){
            result.error = getResult.error;
            return result;
        }
        for(const info of getResult.data!){
            needUpdate = true;
            const index = (this.env.tokens as Array<TokenInfo>).findIndex( i => {return i.tokenid == info.tokenid;});
            if(index != -1){
                this.env.tokens[index] = info;
            } else {
                this.env.tokens.push(info);
            }
        }

        if(needUpdate){
            await this.tokenModel.save(this.env.tokens);
        }

        return result;
    }

    private async syncBridgeTxs(from:number,to:number):Promise<ActionResult>{
        let result = new ActionResult();

        const getResult = await this.vechainFTBridge.getBridgeTxByRange(from,to);
        if(getResult.error){
            result.error = getResult.error;
            return result;
        }
        
        if(getResult.data!.length > 0){
            console.debug(`Get ${getResult.data!.length} bridgeTx`);
            const saveResult = await this.bridgeTxModel.saveBridgeTxs(getResult.data!);
            if(saveResult.error){
                result.error = saveResult.error;
                return result;
            }
        }
        return result;
    }

    private async handleFork():Promise<ActionResult>{
        let result = new ActionResult();
        let range:BlockRange = {}
        try {
            console.debug('Begin handle VeChain Fork');
            while(true){
                const lastResult = await this.bridgeTxModel.getLastBridgeTx(this.config.vechain.chainName,this.config.vechain.chainId);
                if(lastResult.error){
                    result.error = lastResult.error;
                    return result;
                }
                if(lastResult.data == undefined){
                    return result;
                }
                const blockId = lastResult.data.blockId;
                const forkResult = await this.vechainCommon.blockIsFork(blockId);
                if(forkResult.error){
                    result.error = forkResult.error;
                    return result;
                }
                if(forkResult.data == true){
                    console.debug(`VeChain blockId: ${blockId} is fork`);
                    range = {blockNum:{from:lastResult.data.blockNumber}};
                    continue;
                } else {
                    break;
                }
            }

            if(range.blockNum?.from != undefined) {
                await this.tokenModel.removeByBlockRange(this.config.vechain.chainName,this.config.vechain.chainId,range);
                await this.bridgeTxModel.removeByBlockRange(this.config.vechain.chainName,this.config.vechain.chainId,range);
                await this.configModel.save(new Map([['vechainSyncBlock',String(range.blockNum.from -1)]]));
                this.env.vechainSyncBlock = range.blockNum.from - 1;
            }
            console.debug('End handle VeChain Fork');
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private env:any;
    private config:any;
    private connex!:Framework;
    private configModel:ConfigModel;
    private tokenModel:TokenInfoModel;
    private vechainFTBridge:VeChainFTBridge;
    private bridgeTxModel:BridgeTxModel;
    private vechainCommon:VeChainCommon;
    private readonly scanBlockStep = 200;
}