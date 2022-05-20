export type HistoryMeta = {
    bridgeTxId:string,
    merkleRoot:string,
    from:TokenMeta,
    to:TokenMeta,
    sender:string,
    swapTx:string,
    receiver:string,
    claimTx:string,
    swapAmount:bigint,
    reward:bigint,
    rewardFee:bigint,
    claimAmount:bigint,
    swapCount:bigint
    status:number,
}

export type TokenMeta = {
    chainName:string,
    chainId:string,
    name:string,
    symbol:string,
    decimals:number,
    contract:string,
    nativeCoin:boolean,
    tokenType:number
}