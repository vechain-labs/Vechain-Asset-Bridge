import { ActionData } from "../../utils/components/actionResult";
import { IBridgeHead } from "../../utils/iBridgeHead";
import { BridgeSnapshoot } from "../../utils/types/bridgeSnapshoot";
import { SwapTx } from "../../utils/types/swapTx";

export class EthereumBridgeHead implements IBridgeHead{

    constructor(env:any){
        this.env = env;
        this.config = env.config;
    }

    getLashSnapshootOnChain(): Promise<ActionData<BridgeSnapshoot>> {
        throw new Error("Method not implemented.");
    }
    getLockedStatus(): Promise<ActionData<boolean>> {
        throw new Error("Method not implemented.");
    }
    getMerkleRoot(): Promise<ActionData<string>> {
        throw new Error("Method not implemented.");
    }
    scanTxs(from: number, end: number): Promise<ActionData<SwapTx[]>> {
        throw new Error("Method not implemented.");
    }

    private env:any;
    private config:any;
}