export type SwapTx = {
    chainName:string;
    chainId:string;
    blockNumber:number;
    txid:string;
    clauseIndex:number;
    index:number;
    account:string;
    token:string;
    amount:bigint;
    timestamp:number;
    type:"swap"|"claim"
}