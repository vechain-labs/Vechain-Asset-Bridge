export type SwapBatchInfo = {
    lastMerkleRoot:string;
    chains:Array<ChainInfo>
}

export type ChainInfo = {
    chainName:string;
    chainId:string;
    fromBlockNum:number;
    endBlockNum:number;
} 