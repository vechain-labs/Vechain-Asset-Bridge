export abstract class BaseMiddleware {
    constructor(env:any){
        this.environment = env;
    }
    protected environment:any;
}