import { keccak256 } from "thor-devkit";

export type TokenInfo = {
    tokenid:string;
    chainName:string;
    chainId:string;
    name:string;
    symbol:string;
    decimals:number,
    address:string;
    nativeCoin:boolean,
    tokeType:string;
    targetTokenId:string;
}

export function tokenid(chainName:string,chainId:string,token:string):string{
    let encode = Buffer.concat([
        Buffer.from(chainName),
        Buffer.from(chainId),
        Buffer.from(token)
    ]); 
    return '0x' + keccak256(encode).toString('hex');
}

export function findTargetToken(tokenInfo:TokenInfo[],chainName:string,chainId:string,token:string):TokenInfo | undefined{
    const filters = tokenInfo.filter( t =>{ return t.chainName == chainName && t.chainId == chainId && t.address.toLowerCase() == token.toLowerCase(); });
    if(filters.length == 0){
        return undefined;
    }
    const targetTokenId = filters[0].targetTokenId;
    return tokenInfo.filter( t => {return t.tokenid == targetTokenId})[0];
}