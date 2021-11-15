import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("tokeInfo")
export class TokenEntity{

    @PrimaryColumn({name:"tokenid",length:50})
    public tokenid!:string;

    @Column({name:"chainname"})
    public chainName!:string;

    @Column({name:"chainid"})
    public chainId!:string;

    @Column({name:"name"})
    public name!:string;

    @Column({name:"symbol"})
    public symbol!:string;

    @Column({name:"decimals"})
    public decimals!:number;

    @Column({name:"tokenaddr"})
    public tokenAddr!:string;

    @Column({name:"tokentype"})
    public tokenType!:string;

    @Column({name:"targettoken"})
    public targetToken!:string;

    @Column({name:"begin"})
    public begin!:number;

    @Column({name:"end"})
    public end!:number;

    @Column({name:"update"})
    public update!:number;

    @Column({name:"updateBlock"})
    public updateBlock!:string;

    @Column({name:"valid"})
    public valid!:boolean;
}