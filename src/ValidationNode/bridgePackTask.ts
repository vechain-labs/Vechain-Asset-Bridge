import { ActionResult } from "../common/utils/components/actionResult";

export class BridgePackTask{

    constructor(env:any){
        this.env = env;
    }

    public async taskJob():Promise<ActionResult>{
        let result = new ActionResult();

        return result;
    }


    private env:any;
    private config:any;
    // private vechainBridge:VeChainBridgeHead;
    // private vechainVerifier:VeChainBridgeVerifiter;
    // private ethereumBridge:EthereumBridgeHead;
    // private ethereumVerifier:EthereumBridgeVerifier;
    // private connex!:Framework;
    // private tokenInfo!:Array<TokenInfo>;
    // private snapshootModel!:SnapshootModel;
    // private ledgerModel!:LedgerModel;
    private readonly tryLimit = 6 * 5;
}