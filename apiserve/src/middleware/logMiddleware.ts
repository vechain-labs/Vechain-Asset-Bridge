import * as Router from 'koa-router';

export default class HttpLoggerMiddleware{
    public static async httpLogger(ctx: Router.IRouterContext, next: () => Promise<any>):Promise<void>{
        let parames = {
            remoteAdd:ctx.headers['x-forwarded-for'] || (ctx as any).ip || ctx.ips || (ctx.socket && (ctx.socket.remoteAddress || ((ctx as any).socket.socket && (ctx as any).socket.socket.remoteAddress))),
            method:ctx.method,
            body: JSON.stringify(ctx.body),
            url: ctx.originalUrl,
            status: ctx.status || ctx.response.status || ctx.res.statusCode,
            responseTime: 0,
            response: {},
            header: JSON.stringify(ctx.request.headers),
            requestTime: (new Date()).toISOString()
        };
        let logLevel:string = "info";
        let start = new Date().getTime();
        await next();
        let end = new Date().getTime();
        if (String(parames.remoteAdd).startsWith("::ffff:")) {
            let remoteAdd: string = parames.remoteAdd;
            parames.remoteAdd = remoteAdd.replace("::ffff:", "");
        }
        parames.responseTime = (end - start) / 1000;
        parames.status = ctx.status || ctx.response.status || ctx.res.statusCode;
        parames.response = JSON.stringify(ctx.body?ctx.body:{});
        if (parames.status >= 300) { logLevel = "warn" };
        if (parames.status >= 400) { logLevel = "warn" };
        if (parames.status >= 500) { logLevel = "error" };
        let logMessage = `${parames.remoteAdd} ${parames.requestTime} ${parames.method} ${parames.url} ${parames.status} ${parames.responseTime} ${parames.body}`;
        let debuglogMessage = `${parames.remoteAdd} ${parames.requestTime} ${parames.method} ${parames.url} Headers:${parames.header}]Body:[${parames.body} ${parames.status} ${parames.responseTime} Response ${parames.response}`;
        switch(logLevel){
            case "trace":
                console.trace(logMessage);
                break;
            case "debug":
                console.debug(logMessage);
                break;
            case "info":
                console.info(logMessage);
                break;
            case "warn":
                console.warn(debuglogMessage);
                break;
            case "error":
                console.error(debuglogMessage);
                break;
        }
    }
}