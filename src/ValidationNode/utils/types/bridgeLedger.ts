import { keccak256 } from "thor-devkit";

export type BridgeLedger = {
    root:string;
    ledgerid:string;
    chainName:string;
    chainId:string;
    account:string;
    token:string;
    balance:bigint;
}

export function ledgerEncodePacked(ledger:BridgeLedger):Buffer{
    let encode = Buffer.concat([
        Buffer.from(ledger.chainName),
        Buffer.from(ledger.chainId),
        Buffer.from(ledger.account.substr(2),'hex'),
        Buffer.from(ledger.token.substr(2),'hex'),
        Buffer.from(ledger.balance.toString(16).padStart(64,'0'),'hex')
    ]);
    return encode;
}

export function ledgerHash(ledger:BridgeLedger):string{
    return '0x' + keccak256(ledgerEncodePacked(ledger)).toString('hex');
}

export function ledgerID(chainName:string,chainId:string,token:string,account:string,):string{
    let encode = Buffer.concat([
        Buffer.from(chainName),
        Buffer.from(chainId),
        Buffer.from(account.substr(2),'hex'),
        Buffer.from(token.substr(2),'hex'),
    ]);
    return '0x' + keccak256(encode).toString('hex');
}