import Router from 'koa-router'
import { koaSwagger } from 'koa2-swagger-ui';
import path from "path";
import yamljs from "yamljs";
import BridgeRouter from './controllers/bridge/router';
import FauectRouter from './controllers/fauect/router';

export default class RootRouter extends Router{
    constructor(env:any){
        super();
        new BridgeRouter(env);
        new FauectRouter(env);

        for(const router of env.routerArray){
            if(router.addRootRouter){
                this.use("",router.routes()).use(router.allowedMethods());
            }
        }

        if(env.config.swagger == true){
            const spec = yamljs.load(path.join(__dirname, "../../docs/swagger/swagger.yaml"));
            this.get('/docs/swagger', koaSwagger({ routePrefix: false, swaggerOptions: { spec } }));
        }
    }
}