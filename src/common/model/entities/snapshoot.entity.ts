import { Column, Entity, Index, IsNull, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { simpleJSON } from "../../utils/extensions/transformers";
import { ChainInfo } from "../../utils/types/bridgeSnapshoot";

@Entity("snapshoot")
export class SnapshootEntity{

    @PrimaryColumn({name:"merkleroot",length:66})
    @Index()
    public merkleRoot!:string;

    @Column({name:"parent_merkleroot",length:66})
    public parentMerkleRoot!:string;

    @Column({name:"chainname_0"})
    public chainName_0!:string;

    @Column({name:"chainid_0"})
    public chainId_0!:string;

    @Column({name:"begin_blocknum_0"})
    public beginBlockNum_0!:number;

    @Column({name:"locked_blocknum_0"})
    public lockedBlockNum_0!:number;

    @Column({name:"end_blocknum_0"})
    public endBlockNum_0!:number;

    @Column({name:"chainname_1"})
    public chainName_1!:string;

    @Column({name:"chainid_1"})
    public chainId_1!:string;

    @Column({name:"begin_blocknum_1"})
    public beginBlockNum_1!:number;

    @Column({name:"locked_blocknum_1"})
    public lockedBlockNum_1!:number;

    @Column({name:"end_blocknum_1"})
    public endBlockNum_1!:number;

    @Column({name:"invalid"})
    public invalid!:boolean;
}