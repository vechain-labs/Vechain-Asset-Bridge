
import { QueryParamtsMiddleware } from "../../middleware/queryParamtsMiddleware";
import { BaseRouter } from "../../utils/baseRouter";
import BridgeController from "./controller";

export default class BridgeRouter extends BaseRouter{
    constructor(env:any){
        super(env);
        const paramtsMiddleware = new QueryParamtsMiddleware(env);
        const controller = new BridgeController(env);

        this.get("/history",
            (ctx,next) => paramtsMiddleware.chainInfoVerification(ctx,next),
            (ctx,next) => paramtsMiddleware.addressValidation(ctx,next),
            (ctx,next) => controller.history(ctx,next)
        );

        this.get("/merkleproof",
            (ctx,next) => controller.merkleproof(ctx,next)
        );

        this.get("/pack/step",
            (ctx,next) => controller.packstep(ctx,next)
        );
    }
}