import { keccak256 } from "thor-devkit";
import { Entity, PrimaryColumn, Column, Index } from "typeorm";

@Entity("bridgeTx")
export class BridgeTxEntity{

    @PrimaryColumn({name:"swapid"})
    public swapid!:string;

    @Index()
    @Column({name:"chainname"})
    public chainName!:string;

    @Index()
    @Column({name:"chainid"})
    public chainId!:string;

    @Index()
    @Column({name:"blocknumber"})
    public blockNumber!:number;

    @Index()
    @Column({name:"blockid"})
    public blockId!:string;

    @Column({name:"txid"})
    public txid!:string;

    @Column({name:"clauseindex"})
    public clauseIndex!:number;

    @Column({name:"index"})
    public index!:number;

    @Index()
    @Column({name:"account"})
    public account!:string;

    @Index()
    @Column({name:"token"})
    public token!:string;

    @Column({name:"amount"})
    public amount!:string;

    @Column({name:"reward"})
    public reward!:string;

    @Column({name:"timestamp"})
    public timestamp!:number;

    @Column({name:"type"})
    @Index()
    public type!:number;

    @Column({name:"invalid"})
    @Index()
    public invalid!:boolean;
}

export function swapID(chainName:string,chainId:string,blocknum:number,txid:string,clauseIndex:number,index:number,account:string,token:string):string {
    let encode = Buffer.concat([
        Buffer.from(chainName),
        Buffer.from(chainId),
        Buffer.from(blocknum.toString()),
        Buffer.from(txid),
        Buffer.from(clauseIndex.toString()),
        Buffer.from(index.toString()),
        Buffer.from(account.substring(2),'hex'),
        Buffer.from(token.substring(2),'hex'),
    ]);
    return '0x' + keccak256(encode).toString('hex');
}