import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { simpleJSON } from "../../../utils/extensions/transformers";
import { ChainInfo } from "../../../utils/types/bridgeSnapshoot";

@Entity("snapshoot")
export class SnapshootEntity{

    @PrimaryGeneratedColumn({name:"index"})
    public id!:number;

    @Column({name:"merkleroot",length:66})
    public merkleRoot!:string;

    @Column({name:"parent_merkleroot",length:66})
    public parentMerkleRoot!:string;

    //@Column({name:"config",type: 'text',transformer:simpleJSON<TreeConfig>("calculate_tree_config.config")})
    @Column({name:"chains",type:"text",transformer:simpleJSON<Array<ChainInfo>>("snapshoot.chains")})
    public chains!:Array<ChainInfo>

    @Column({name:"invalid"})
    public invalid!:boolean;
}