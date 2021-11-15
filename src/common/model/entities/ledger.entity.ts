import { Entity, PrimaryColumn, Column, Index } from "typeorm";

@Entity("ledger")
export class LedgerEntity{

    @PrimaryColumn({name:"snapshootid"})
    public snapshootid!:string;

    @Index()
    @Column({name:"ledgerid",length:66})
    public ledgerid!:string;

    @Index()
    @Column({name:"merkleroot",length:66})
    public merkleRoot!:string;

    @Column({name:"chainname"})
    public chainName!:string;

    @Column({name:"chainid"})
    public chainId!:string;

    @Column({name:"account"})
    public account!:string;

    @Column({name:"token"})
    public token!:string;

    @Column({name:"balance"})
    public balance!:string;

    @Column({name:"valid"})
    public valid!:boolean;
}