export type BridgeSnapshoot = {
    parentMerkleRoot:string;
    merkleRoot:string;
    chains:Array<ChainInfo>
}

export type ChainInfo = {
    chainName:string;
    chainId:string;
    fromBlockNum:number;
    endBlockNum:number;
} 