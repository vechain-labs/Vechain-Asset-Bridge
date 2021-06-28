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
    type:"swap"|"claim"
}