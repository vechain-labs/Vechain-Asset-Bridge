import Router from "koa-router";
import { ActionResult } from "../common/utils/components/actionResult";
import { BaseMiddleware } from "../utils/baseMiddleware";
import { SystemDefaultError } from "../utils/error";

export var errorMap:Map<Error,{status:number,err:any}> = new Map<Error,{status:number,err:any}>();

export default class ConvertJSONResponeMiddleware extends BaseMiddleware{

    public static actionResultJSONResponse(ctx:Router.IRouterContext,action:ActionResult,resultData?:any){
        if(action.error){
            this.errorJSONResponce(ctx,action.error);
        } else {
            this.bodyToJSONResponce(ctx,resultData);
        }
    }

    public static errorJSONResponce(ctx:Router.IRouterContext,error:Error){
        let err = errorMap.get(error);
        if(err == undefined){
            err = errorMap.get(SystemDefaultError.INTERNALSERVERERROR);
        }
        ctx.state = err!.status;
        ctx.body = err!.err;
    }

    public static bodyToJSONResponce(ctx:Router.IRouterContext,body:any){
        ctx.status = 200;
        ctx.body = body;
    }
}