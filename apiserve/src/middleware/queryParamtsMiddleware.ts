import Router from "koa-router";
import { BaseMiddleware } from "../utils/baseMiddleware";
import ConvertJSONResponeMiddleware from "./convertJSONResponeMiddleware";

export class QueryParamtsMiddleware extends BaseMiddleware{
    constructor(env:any){
        super(env);
    }

    public async chainInfoVerification(ctx:Router.IRouterContext,next:()=>Promise<any>){
        let chainName = String(ctx.query.chainname || "").toLowerCase();
        let chainid = String(ctx.query.chainid || "").toLowerCase();
        if(chainName == this.environment.config.vechain.chainName && chainid.toLocaleString() == this.environment.config.vechain.chainId){
            await next();
        } else if(chainName == this.environment.config.ethereum.chainName && chainid.toLocaleString() == this.environment.config.ethereum.chainId){
            await next();
        } else{
            ConvertJSONResponeMiddleware.errorJSONResponce(ctx,ParamtsError.CHAININFOINVALID);
        }
    }

    public async addressValidation(ctx:Router.IRouterContext,next:()=>Promise<any>){
        let address = String(ctx.query.address || "").toLowerCase();
        if(address.length == 42 && /^(-0x|0x)?[0-9a-f]*$/i.test(address)){
            await next();
        } else {
            ConvertJSONResponeMiddleware.errorJSONResponce(ctx,ParamtsError.ADDRESSINVALID);
        }
    }

    public async tokenAddrValidation(ctx:Router.IRouterContext,next:()=>Promise<any>){
        let token = String(ctx.query.token || "").toLowerCase();
        if(token == ""){
            await next();
        }
        else if(token.length == 42 && /^(-0x|0x)?[0-9a-f]*$/i.test(token)){
            await next();
        } else {
            ConvertJSONResponeMiddleware.errorJSONResponce(ctx,ParamtsError.ADDRESSINVALID);
        }
    }
}

export class ParamtsError{
    public static CHAININFOINVALID = new Error('ChainInfo Invalid');
    public static ADDRESSINVALID = new Error('Address Invalid');
    public static MERKLEROOTINVALID = new Error('Merkleroot Invalid');
}