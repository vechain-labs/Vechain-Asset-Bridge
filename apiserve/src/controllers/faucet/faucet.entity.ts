import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

@Entity("blockindex")
@Index(["chainName","chainId"])
export class FaucetEntity {
    @PrimaryGeneratedColumn({name:`indexid`})
    public indexid!: string;

    @Column({name:`chainname`})
    public chainName!:string;

    @Column({name:`chainid`})
    public chainId!:string;

    @Column({name:"tokenaddr"})
    public tokenAddr!:string;

    @Column({name:"receiver"})
    public receiver!:string;

    @Column({name:'amount'})
    public amount!:string;

    @Column({name:`timestamp`,unsigned: true})
    public timestamp!:number;
}
