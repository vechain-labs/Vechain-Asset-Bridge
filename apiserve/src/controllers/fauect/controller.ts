import Router from "koa-router";
import TokenInfoModel from "../../common/model/tokenInfoModel";
import { BaseMiddleware } from "../../utils/baseMiddleware";
import FauectModel from "./fauectModel";
import ConvertJSONResponeMiddleware from "../../middleware/convertJSONResponeMiddleware";
import { ParamtsError } from "../../middleware/queryParamtsMiddleware";
import { ActionData, ActionResult } from "../../common/utils/components/actionResult";
import { VIP180Token } from "../../common/vechain/vip180Token";
import { Framework } from "@vechain/connex-framework";
import { SystemDefaultError } from "../../utils/error";
import Web3 from "web3";
import { ERC20Token } from "../../common/ethereum/erc20Token";

export default class FauectController extends BaseMiddleware{

    public fauect:Router.IMiddleware;

    constructor(env:any){
        super(env);
        this.config = env.config;
        this.tokenInfoModel = new TokenInfoModel(env);
        this.fauectModel = new FauectModel(env);

        this.fauect = async (ctx:Router.IRouterContext,next: () => Promise<any>) => {
            const chainName = String(ctx.request.body.chainname).trim().toLowerCase();
            const chainId = String(ctx.request.body.chainid).trim().toLowerCase();

            if(this.isAddress(ctx.request.body.receiver)){
                const receiver = (ctx.request.body.receiver as string).trim().toLowerCase();
                const tokenAddr = ((ctx.request.body.token || "") as string).trim().toLowerCase();
                const limitResult = await this.fauectLimit(chainName,chainId,receiver,tokenAddr);

                if(limitResult == false){
                    ConvertJSONResponeMiddleware.errorJSONResponce(ctx,new Error('Limit exceeded.'));
                    return;
                }

                if(this.isAddress(tokenAddr)){
                    const tokensResult = await this.tokenInfoModel.getTokenInfos();
                    const target = tokensResult.data!.find( t => {return t.chainName == chainName && t.chainId == chainId && t.tokenAddr.toLocaleLowerCase() == tokenAddr});
                    if(target == undefined){
                        ConvertJSONResponeMiddleware.errorJSONResponce(ctx,new Error('Token not found.'));
                        return;
                    }
                }

                var sendResult = new ActionData<{chainName:string,chainId:string,txid:string}>();
                if(chainName == this.config.vechain.chainName){
                    sendResult = await this.sendToVechain(receiver,tokenAddr);
                } else if (chainName == this.config.ethereum.chainName){
                    sendResult = await this.sendToEthereum(receiver,tokenAddr);
                }
                if(sendResult.error == undefined){
                    ConvertJSONResponeMiddleware.bodyToJSONResponce(ctx,{chainName:sendResult.data?.chainName,chainId:sendResult.data?.chainId,txid:sendResult.data?.txid});
                } else {
                    ConvertJSONResponeMiddleware.errorJSONResponce(ctx,SystemDefaultError.INTERNALSERVERERROR);
                }
            } else {
                ConvertJSONResponeMiddleware.errorJSONResponce(ctx,ParamtsError.ADDRESSINVALID);
            }
            await next();
        }
    }

    private isAddress(value:any|undefined):boolean {
        return value != undefined && typeof (value) == 'string' && value.length == 42 && /^0x[0-9a-fA-f]+/i.test(value.trim());
    }

    private async sendToVechain(receiver:string,tokenAddr?:any):Promise<ActionData<{chainName:string,chainId:string,txid:string}>>{
        let result = new ActionData<{chainName:string,chainId:string,txid:string}>();
        result.data = {chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,txid:''};
        try {
            if(this.isAddress(tokenAddr)){
                const vip180 = new VIP180Token(tokenAddr,this.environment.connex);
                const decimals = await vip180.decimals();
                const amount = BigInt(1) * BigInt(10**decimals);
                const resp = await vip180.transfer(amount,receiver,undefined);
                await this.fauectModel.saveFauect(this.config.vechain.chainName,this.config.vechain.chainId,tokenAddr,receiver,amount,resp.txid);
                result.data.txid = resp.txid;
           } else {
            const vetAmount = BigInt(1) * BigInt(10**18);
            const vthoAmount = BigInt(500) * BigInt(10**18);

            const transferMethod = this.environment.connex.thor.account('0x0000000000000000000000000000456E65726779').method(this.transferABI);
            const energyClause = transferMethod.asClause(receiver, '0x' + vthoAmount.toString(16))
            const resp = await (this.environment.connex as Framework).vendor.sign("tx",[
                {to:receiver,value:("0x"+ vetAmount.toString(16)) },
                energyClause
            ]).request();
            await this.fauectModel.saveFauect(this.config.vechain.chainName,this.config.vechain.chainId,"",receiver,vetAmount,resp.txid);
            await this.fauectModel.saveFauect(this.config.vechain.chainName,this.config.vechain.chainId,"0x0000000000000000000000000000456E65726779",receiver,vthoAmount,resp.txid);
            result.data.txid = resp.txid;
           }
        } catch (error) {
            result.error = error;
        }
        
        return result;
    }

    private async sendToEthereum(receiver:string,tokenAddr?:any):Promise<ActionData<{chainName:string,chainId:string,txid:string}>>{
        let result = new ActionData<{chainName:string,chainId:string,txid:string}>();
        result.data = {chainName:this.config.ethereum.chainName,chainId:this.config.ethereum.chainId,txid:''};
        try {
            if(this.isAddress(tokenAddr)){
                const erc20 = new ERC20Token(tokenAddr,this.environment.web3);
                const decimals = await erc20.decimals();
                const amount = BigInt(1) * BigInt(10**decimals);
                const resp = await erc20.transfer(amount,receiver,undefined);
                await this.fauectModel.saveFauect(this.config.ethereum.chainName,this.config.ethereum.chainId,tokenAddr,receiver,amount,resp.txid);
                result.data.txid = resp.txid;
            } else {
                const amount = BigInt(1) * BigInt(10**18);
                const priKey = (this.environment.web3 as Web3).eth.accounts.wallet[0].privateKey;
                const gasPrice = await (this.environment.web3 as Web3).eth.getGasPrice();
                const signedTx = await (this.environment.web3 as Web3).eth.accounts.signTransaction({
                    to:receiver,
                    value:'0x' + amount.toString(16),
                    gas:21000,
                    gasPrice:gasPrice
                },priKey);
                const resp = await (this.environment.web3 as Web3).eth.sendSignedTransaction(signedTx.rawTransaction!);
                await this.fauectModel.saveFauect(this.config.ethereum.chainName,this.config.ethereum.chainId,"",receiver,amount,resp.transactionHash);
                result.data.txid = resp.transactionHash;
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private async fauectLimit(chainName:string,chainId:string,receiver:string,tokenAddr:string):Promise<boolean>{
        const endTs = (new Date()).getTime();
        const beginTs = endTs - (1000*36*24);
        const historyResult = await this.fauectModel.getFauectHistory(chainName,chainId,tokenAddr,beginTs,endTs,receiver);
        return historyResult.error == undefined && historyResult.data!.length <= 5;
    }

    private config:any;
    private tokenInfoModel:TokenInfoModel;
    private fauectModel:FauectModel;
    private readonly transferABI = {"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_amount","type":"uint256"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}
}