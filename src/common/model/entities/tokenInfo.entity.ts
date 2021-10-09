import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("tokeInfo")
export class TokenEntity{

    @PrimaryColumn({name:"tokenid",length:50})
    public tokenid!:string;

    @Column({name:"chainname"})
    public chainName!:string;

    @Column({name:"chainid"})
    public chainId!:string;

    @Column({name:"tokensymbol"})
    public tokenSymbol!:string;

    @Column({name:"tokenaddr"})
    public tokenAddr!:string;

    @Column({name:"tokentype"})
    public tokeType!:string;

    @Column({name:"targettoken"})
    public targetToken!:string;
}