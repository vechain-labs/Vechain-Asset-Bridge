import { keccak256 } from "thor-devkit";

export type TokenInfo = {
    tokenid:string;
    chainName:string;
    chainId:string;
    tokenAddr:string;
    tokeType:string;
    targetToken:string;
}

export function tokenid(chainName:string,chainId:string,token:string):string{
    let encode = Buffer.concat([
        Buffer.from(chainName),
        Buffer.from(chainId),
        Buffer.from(token)
    ]); 
    return '0x' + keccak256(encode).toString('hex');
}

export function findTargetToken(tokens:TokenInfo[],chainName:string,chainId:string,token:string):TokenInfo | undefined{
    const filters = tokens.filter( t =>{ return t.chainName == chainName && t.chainId == chainId && t.tokenAddr == token; });
    if(filters.length == 0){
        return undefined;
    }
    const targetTokenId = filters[0].targetToken;
    return tokens.filter( t => {return t.tokenid == targetTokenId})[0];
}