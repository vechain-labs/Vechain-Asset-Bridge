import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("verifier")
export class VerifierEntity{
    @PrimaryColumn({name:"verifier"})
    public verifier!:string;

    @Column({name:"status"})
    public status!:boolean;

    @Column({name:"update"})
    public update!:number;

    @Column({name:"updateBlock"})
    public updateBlock!:string;

    @Column({name:"valid"})
    public valid!:boolean;
}