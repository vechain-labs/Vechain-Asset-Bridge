import Router from "koa-router";
export abstract class BaseRouter extends Router {
    constructor(environment:any){
        super();
        this.environment = environment;
        (this.environment.routerArray as Array<BaseRouter>).push(this);
    }

    public addRootRouter:boolean = true;
    protected environment:any;
}