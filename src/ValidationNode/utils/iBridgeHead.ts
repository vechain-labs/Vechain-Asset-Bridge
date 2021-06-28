import { ActionData } from "./components/actionResult";
import { BridgeSnapshoot } from "./types/bridgeSnapshoot";
import { SwapTx } from "./types/swapTx";

export interface IBridgeHead {
    getLashSnapshootOnChain():Promise<ActionData<BridgeSnapshoot>>;
    getLockedStatus():Promise<ActionData<boolean>>;
    getMerkleRoot():Promise<ActionData<string>>;
    scanTxs(from:number,end:number):Promise<ActionData<SwapTx[]>>;
}