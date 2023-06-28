import { BaseRouter } from "../../utils/baseRouter";
import FaucetController from "./controller";

export default class FaucetRouter extends BaseRouter {
    constructor(env:any){
        super(env);
        const controller = new FaucetController(env);

        this.post("/faucet",
            (ctx,next) => controller.faucet(ctx,next),
        );
    }
}