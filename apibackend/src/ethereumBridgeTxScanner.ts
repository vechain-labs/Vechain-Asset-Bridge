import Web3 from "web3";
import { EthereumCommon } from "./common/ethereum/ethereumCommon";
import { EthereumFTBridge } from "./common/ethereum/ethereumFTBridge";
import BridgeTxModel from "./common/model/bridgeTxModel";
import ConfigModel from "./common/model/configModel";
import TokenInfoModel from "./common/model/tokenInfoModel";
import { ActionResult } from "./common/utils/components/actionResult";
import { BlockRange } from "./common/utils/types/blockRange";
import { TokenInfo } from "./common/utils/types/tokenInfo";

export class EthereumBridgeTxScanner {

    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.web3 = env.web3;
        this.configModel = new ConfigModel();
        this.tokenModel = new TokenInfoModel();
        this.ethereumFTBridge = new EthereumFTBridge(env);
        this.bridgeTxModel = new BridgeTxModel(env);
        this.ethereumCommon = new EthereumCommon(env);
    }

    public async run():Promise<ActionResult>{
        let result = new ActionResult();

        try {
            const latestBlock = (await this.web3.eth.getBlock('latest')).number;
            if(this.env.ethereumSyncBlock == undefined){
                const configResult = await this.configModel.get(['ethereumSyncBlock']);
                if(configResult.error == undefined && configResult.data!.has('ethereumSyncBlock')){
                    this.env.ethereumSyncBlock = Number(configResult.data!.get('ethereumSyncBlock'));
                } else {
                    this.env.ethereumSyncBlock = this.config.ethereum.startBlockNum;
                }
            }

            for(let block = this.env.ethereumSyncBlock +1;block <= latestBlock;){
                let from = block;
                let to = block + this.scanBlockStep > latestBlock ? latestBlock : block + this.scanBlockStep;
                console.info(`Sync Ethereum Bridge Data ${from} - ${to}`);

                console.debug('Sync Ethereum TokenInfos');
                const syncTokensResult = await this.syncTokens(from,to);
                if(syncTokensResult.error){
                    result.error = syncTokensResult.error;
                    return result;
                }

                console.debug('Sync Ethereum BridgeTxs');
                const syncBridgeTxsResult = await this.syncBridgeTxs(from,to);
                if(syncBridgeTxsResult.error){
                    result.error = syncBridgeTxsResult.error;
                    return result;
                }
                await this.configModel.save(new Map([['ethereumSyncBlock',String(to)]]));
                this.env.ethereumSyncBlock = to;
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

        const getResult = await this.ethereumFTBridge.getTokenInfosByRange(from,to);
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
        const getResult = await this.ethereumFTBridge.getBridgeTxByRange(from,to);
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
            console.debug('Begin handle  Ethereum Fork');
            while(true){
                const lastResult = await this.bridgeTxModel.getLastBridgeTx(this.config.ethereum.chainName,this.config.ethereum.chainId);
                if(lastResult.error){
                    result.error = lastResult.error;
                    return result;
                }
                if(lastResult.data == undefined){
                    return result;
                }
                const blockId = lastResult.data.blockId;
                const forkResult = await this.ethereumCommon.blockIsFork(blockId);
                if(forkResult.error){
                    result.error = forkResult.error;
                    return result;
                }
                if(forkResult.data == true){
                    console.debug(`Ethereum blockId: ${blockId} is fork`);
                    range = {blockNum:{from:lastResult.data.blockNumber}};
                    continue;
                } else {
                    break;
                }
            }

            if(range.blockNum?.from != undefined) {
                await this.tokenModel.removeByBlockRange(this.config.ethereum.chainName,this.config.ethereum.chainId,range);
                await this.bridgeTxModel.removeByBlockRange(this.config.ethereum.chainName,this.config.ethereum.chainId,range);
                await this.configModel.save(new Map([['ethereumSyncBlock',String(range.blockNum.from -1)]]));
                this.env.ethereumSyncBlock = range.blockNum.from - 1;
            }
            console.debug('End handle Ethereum Fork');
        } catch (error) {
            result.error = error;
        }
        return result;
    }
    
    
    private env:any;
    private config:any;
    private web3!:Web3;
    private configModel:ConfigModel;
    private tokenModel:TokenInfoModel;
    private ethereumFTBridge:EthereumFTBridge
    private bridgeTxModel:BridgeTxModel;
    private ethereumCommon:EthereumCommon;
    private readonly scanBlockStep = 200;
}