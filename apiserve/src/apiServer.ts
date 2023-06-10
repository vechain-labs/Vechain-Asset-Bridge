import Koa from 'koa';
import bodyParser from "koa-bodyparser"
import cors from 'koa2-cors';
import HttpLoggerMiddleware from './middleware/logMiddleware';
import { URLCodeMiddleware } from './middleware/uricodeMiddleware';
import RootRouter from './rootRouter';

export default class ApiServer extends Koa
{
    public constructor(env:any){
        super();
        let rootRouter = new RootRouter(env);
        this.use(cors({
            origin(ctx: Koa.Context) {
                ctx.set("Access-Control-Allow-Origin","*");
                return '*';
            },
            exposeHeaders: ['WWW-Authenticate', 'Server-Authorization'],
            maxAge: 5,
            credentials: true,
            allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
        }));
        this.use(URLCodeMiddleware.URLDecoder);
        this.use(bodyParser());
        this.use(HttpLoggerMiddleware.httpLogger);
        this.use(rootRouter.routes()).use(rootRouter.allowedMethods());
    }
}