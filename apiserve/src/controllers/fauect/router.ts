import { BaseRouter } from "../../utils/baseRouter";
import FauectController from "./controller";

export default class FauectRouter extends BaseRouter {
    constructor(env:any){
        super(env);
        const controller = new FauectController(env);

        this.post("/fauect",
            (ctx,next) => controller.fauect(ctx,next),
        );
    }
}