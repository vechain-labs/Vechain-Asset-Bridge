import { Framework } from "@vechain/connex-framework";
import Web3 from "web3";
import { EthereumCommon } from "./common/ethereumCommon";
import BlockIndexModel, { BlockRange } from "./common/model/blockIndexModel";
import ConfigModel from "./common/model/configModel";
import ValidatorModel from "./common/model/validatorModel";
import { ActionResult } from "./common/utils/components/actionResult";
import { TokenInfo } from "./common/utils/types/tokenInfo";
import { Validator } from "./common/utils/types/validator";
import { VeChainCommon } from "./common/vechainCommon";

export class BridgeSyncTask {
    constructor(env:any) {
        this.env = env;
        this.config = env.config;
        this.connex = env.connex;
        this.web3 = env.web3;
        this.tokenInfo = new Array();
        this.validators = new Array();
        this.configModel = new ConfigModel();
        this.blockIndexModel = new BlockIndexModel();
        this.vechainCommon = new VeChainCommon(env);
        this.ethereumCommon = new EthereumCommon(env);
        this.validatorModel = new ValidatorModel();
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
            console.info(`Sync Snapshoot`);
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
                this.env.syncVeChainBlockNum = this.config.vechain.startBlockNum as number;
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
                    await this.blockIndexModel.delete(chainName,chainId,delRange);
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
                this.env.syncEthereumBlockNum = await this.web3.eth.getBlockNumber();
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
                    await this.blockIndexModel.delete(chainName,chainId,delRange);
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
            this.env.validatorsSync = {endBlock:this.config.vechain.startBlockNum};
        }

        if(this.validators.length == 0){
            const localValidatorResult = await this.validatorModel.getValidators();
            if(localValidatorResult.error){
                result.error = localValidatorResult.error;
                return result;
            }
            this.validators = localValidatorResult.data!;
        }

        // if(this.env.verifiers.length == 0){
        //     const localVerifiersResult = await (new VerifierModel()).getVerifiers();
        //     if(localVerifiersResult.error){
        //         result.error = localVerifiersResult.error;
        //         return result;
        //     }
        //     this.verifiers = localVerifiersResult.data!;
        // } else {
        //     this.verifiers = this.env.verifiers;
        // }
        
        return result;
    }

    private async snycSnapshoot():Promise<ActionResult>{
        let result = new ActionResult();
        return result;
    }

    private env:any;
    private config:any;
    private connex:Framework;
    private web3:Web3;
    private tokenInfo:Array<TokenInfo>;
    private validators:Array<Validator>;
    private configModel:ConfigModel;
    private blockIndexModel:BlockIndexModel;
    private validatorModel:ValidatorModel;
    private vechainCommon:VeChainCommon;
    private ethereumCommon:EthereumCommon;
    private vechainBlockStep:number = 500;
    private ethereumBlockStep:number = 200;
}