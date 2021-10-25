export type BridgeTx = {
    chainName:string;
    chainId:string;
    blockNumber:number;
    blockId:string;
    txid:string;
    clauseIndex:number;
    index:number;
    account:string;
    token:string;
    amount:bigint;
    reward:bigint;
    timestamp:number;
    type:"swap"|"claim"
}