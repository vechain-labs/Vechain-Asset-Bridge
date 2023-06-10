import Router from "koa-router";
export abstract class BaseRouter extends Router {
    constructor(environment:any){
        super();
        this.environment = environment;
        if(this.environment.routerArray == undefined){
            this.environment.routerArray = new Array<BaseRouter>();
        }
        (this.environment.routerArray as Array<BaseRouter>).push(this);
    }

    public addRootRouter:boolean = true;
    protected environment:any;
}