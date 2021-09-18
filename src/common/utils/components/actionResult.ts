export class ActionResult {
    public error: any|Error;
    public detail:any

    public copyBase(source: ActionResult) {
        this.error = source.error;
        this.detail = source.detail;
    }

    public constructor(error:any|Error = undefined,detail:any = undefined) {
        this.error = error;
        this.detail = detail;
    }
}

export class ActionData<T> extends ActionResult {
    public data: T | undefined;

    public constructor(data?: T) {
        super();
        this.data = data;
    }

    public static all(actions: Array<ActionResult>): ActionData<{ succeed: Array<ActionResult>, failed: Array<ActionResult> }> {
        let result = new ActionData<{ succeed: Array<ActionResult>, failed: Array<ActionResult> }>();
        result.data = {
            succeed: new Array<ActionResult>(),
            failed: new Array<ActionResult>()
        };
        for (const sub of actions) {
            if (sub.error == undefined) {
                result.data.succeed.push(sub);
            } else {
                result.data.failed.push(sub);
                result.error = new Error("has error action");
            }
        }
        return result;
    }
}

export class PromiseActionResult {
    public static async PromiseActionResult(promise: Promise<any>): Promise<ActionData<{ succeed: Array<ActionResult>, failed: Array<ActionResult> }>> {
        let result = new ActionData<{ succeed: Array<ActionResult>, failed: Array<ActionResult> }>();
        result.data = {
            succeed: new Array<ActionResult>(),
            failed: new Array<ActionResult>()
        };
        let promiseAllResult = await promise;
        if (promiseAllResult.constructor.name == "Array") {
            for (let subResult of (promiseAllResult as Array<ActionResult>)) {
                if (subResult.error == undefined) {
                    result.data.succeed.push(subResult);
                } else {
                    result.data.failed.push(subResult);
                }
            }
            if(result.data.failed.length > 0){
                result.copyBase(result.data.failed[0]);
            }
        } else if (typeof (promiseAllResult) == typeof (ActionResult)) {
            promiseAllResult = promiseAllResult as ActionResult;
            if (promiseAllResult.Result) {
                result.data.succeed.push(promiseAllResult);
            } else {
                result.data.failed.push(promiseAllResult);
                result.copyBase(promiseAllResult);
            }
        }
        return result;
    }
}