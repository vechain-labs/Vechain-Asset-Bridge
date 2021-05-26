export type SwapTx = {
    chainName:string;
    chainId:string;
    blockNumber:number;
    clauseIndex:number;
    index:number;
    to:string;
    token:string;
    balance:BigInt;
}