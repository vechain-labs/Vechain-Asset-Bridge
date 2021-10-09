import { ActionData } from "./components/actionResult";
import { BridgeSnapshoot } from "./types/bridgeSnapshoot";
import { SwapTx } from "./types/swapTx";

export interface IBridgeHead {
    getLastSnapshoot():Promise<ActionData<{sn:BridgeSnapshoot,txid:string,blocknum:number}>>;
    getSnapshoot(begin:number,end:number):Promise<ActionData<BridgeSnapshoot[]>>;
    getLockedStatus():Promise<ActionData<boolean>>;
    getMerkleRoot():Promise<ActionData<string>>;
    scanTxs(begin:number,end:number):Promise<ActionData<SwapTx[]>>;
}