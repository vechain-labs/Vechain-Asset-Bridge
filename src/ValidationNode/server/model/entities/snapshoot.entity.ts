import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { simpleJSON } from "../../../utils/extensions/transformers";
import { ChainInfo } from "../../../utils/types/bridgeSnapshoot";

@Entity("snapshoot")
export class SnapshootEntity{

    @PrimaryColumn({name:"merkleroot",length:66})
    public merkleRoot!:string;

    @Column({name:"blocknum"})
    public blocknum!:number;

    @Column({name:"parent_merkleroot",length:66})
    public parentMerkleRoot!:string;

    @Column({name:"chains",type:"text",transformer:simpleJSON<Array<ChainInfo>>("snapshoot.chains")})
    public chains!:Array<ChainInfo>

    @Column({name:"invalid"})
    public invalid!:boolean;
}