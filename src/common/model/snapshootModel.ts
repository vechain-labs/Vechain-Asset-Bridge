import { getConnection, getManager, getRepository, SelectQueryBuilder } from "typeorm";
import { ActionData, ActionResult } from "../utils/components/actionResult";
import { BridgeSnapshoot, ZeroRoot } from "../utils/types/bridgeSnapshoot";
import { BridgeTx } from "../utils/types/bridgeTx";
import { SnapshootEntity } from "./entities/snapshoot.entity";

export class SnapshootModel {

    constructor(env:any){
        this.env = env;
        this.config = env.config;
    }

    public async getLastSnapshoot():Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        result.data = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {chainName:this.config.vechain.chainName,chainId:this.config.vechain.chainId,lockedBlockNum:this.config.vechain.startBlockNum,beginBlockNum:this.config.vechain.startBlockNum,endBlockNum:this.config.vechain.startBlockNum},
                {chainName:this.config.ethereum.chainName,chainId:this.config.ethereum.chainId,lockedBlockNum:this.config.ethereum.startBlockNum,beginBlockNum:this.config.ethereum.startBlockNum,endBlockNum:this.config.ethereum.startBlockNum},
            ]
        }

        try {
            let data = await getRepository(SnapshootEntity)
                .createQueryBuilder()
                .where("invalid = :invalid",{invalid:true})
                .orderBy("end_blocknum_0","DESC")
                .getOne();
            if(data != undefined){
                result.data = {
                    parentMerkleRoot:data.parentMerkleRoot,
                    merkleRoot:data.merkleRoot,
                    chains:[
                        {chainName:data.chainName_0 || "",chainId:data.chainId_0 || "",beginBlockNum:data.beginBlockNum_0 || 0,lockedBlockNum:data.lockedBlockNum_0 || 0,endBlockNum:data.endBlockNum_0 || 0},
                        {chainName:data.chainName_1 || "",chainId:data.chainId_1 || "",beginBlockNum:data.beginBlockNum_1 || 0,lockedBlockNum:data.lockedBlockNum_1 || 0,endBlockNum:data.endBlockNum_1 || 0}
                    ]
                }
            }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getSnapshootByRoot(root:string):Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        result.data = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    lockedBlockNum:this.config.vechain.startBlockNum,
                    beginBlockNum:this.config.vechain.startBlockNum,
                    endBlockNum:this.config.vechain.startBlockNum},
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    lockedBlockNum:this.config.ethereum.startBlockNum,
                    beginBlockNum:this.config.ethereum.startBlockNum,
                    endBlockNum:this.config.ethereum.startBlockNum},
            ]
        }

        try {
            let data = await getRepository(SnapshootEntity)
                .findOne({where:{merkleRoot:root}});
                if(data != undefined){
                    result.data = {
                        parentMerkleRoot:data.parentMerkleRoot,
                        merkleRoot:data.merkleRoot,
                        chains:[
                            {chainName:data.chainName_0 || "",chainId:data.chainId_0 || "",beginBlockNum:data.beginBlockNum_0 || 0,lockedBlockNum:data.lockedBlockNum_0 || 0,endBlockNum:data.endBlockNum_0 || 0},
                            {chainName:data.chainName_1 || "",chainId:data.chainId_1 || "",beginBlockNum:data.beginBlockNum_1 || 0,lockedBlockNum:data.lockedBlockNum_1 || 0,endBlockNum:data.endBlockNum_1 || 0}
                        ]
                    }
                }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getSnapshootByParentRoot(parentRoot:string):Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();
        result.data = {
            parentMerkleRoot:ZeroRoot(),
            merkleRoot:ZeroRoot(),
            chains:[
                {
                    chainName:this.config.vechain.chainName,
                    chainId:this.config.vechain.chainId,
                    lockedBlockNum:this.config.vechain.startBlockNum,
                    beginBlockNum:this.config.vechain.startBlockNum,
                    endBlockNum:this.config.vechain.startBlockNum},
                {
                    chainName:this.config.ethereum.chainName,
                    chainId:this.config.ethereum.chainId,
                    lockedBlockNum:this.config.ethereum.startBlockNum,
                    beginBlockNum:this.config.ethereum.startBlockNum,
                    endBlockNum:this.config.ethereum.startBlockNum},
            ]
        }

        try {
            let data = await getRepository(SnapshootEntity)
                .findOne({where:{parentMerkleRoot:parentRoot}});
                if(data != undefined){
                    result.data = {
                        parentMerkleRoot:data.parentMerkleRoot,
                        merkleRoot:data.merkleRoot,
                        chains:[
                            {chainName:data.chainName_0 || "",chainId:data.chainId_0 || "",beginBlockNum:data.beginBlockNum_0 || 0,lockedBlockNum:data.lockedBlockNum_0 || 0,endBlockNum:data.endBlockNum_0 || 0},
                            {chainName:data.chainName_1 || "",chainId:data.chainId_1 || "",beginBlockNum:data.beginBlockNum_1 || 0,lockedBlockNum:data.lockedBlockNum_1 || 0,endBlockNum:data.endBlockNum_1 || 0}
                        ]
                    }
                }
        } catch (error) {
            result.error = error;
        }

        return result;
    }

    public async getSnapshootByClaimTx(claimtx:BridgeTx,limit?:number,offset?:number):Promise<ActionData<BridgeSnapshoot[]>>{
        let result = new ActionData<BridgeSnapshoot[]>();
        result.data = new Array();

        try {
            let query!:SelectQueryBuilder<SnapshootEntity>;
            if(claimtx.chainName == this.config.vechain.chainName && claimtx.chainId == this.config.vechain.chainId){
                query = getRepository(SnapshootEntity)
                    .createQueryBuilder()
                    .where("chainname_0 = :chainname",{chainname:claimtx.chainName})
                    .andWhere("chainid_0 = :chainid", {chainid:claimtx.chainId})
                    .andWhere("end_blocknum_0 <= :blocknum", {blocknum:claimtx.blockNumber})
                    .andWhere("invalid = :invalid",{invalid:true})
                    .orderBy("end_blocknum_0","DESC")
                    .limit(limit)
                    .offset(offset)
            } else if(claimtx.chainName == this.config.ethereum.chainName && claimtx.chainId == this.config.ethereum.chainId){
                query = getRepository(SnapshootEntity)
                    .createQueryBuilder()
                    .where("chainname_1 = :chainname",{chainname:claimtx.chainName})
                    .andWhere("chainid_1 = :chainid", {chainid:claimtx.chainId})
                    .andWhere("end_blocknum_1 <= :blocknum", {blocknum:claimtx.blockNumber})
                    .andWhere("invalid = :invalid",{invalid:true})
                    .orderBy("end_blocknum_1","DESC")
                    .limit(limit)
                    .offset(offset)
            }
            let datas = await query.getMany();
            for(const data of datas){
                let sn:BridgeSnapshoot = {
                    parentMerkleRoot:data.parentMerkleRoot,
                    merkleRoot:data.merkleRoot,
                    chains:[
                        {chainName:data.chainName_0 || "",chainId:data.chainId_0 || "",beginBlockNum:data.beginBlockNum_0 || 0,lockedBlockNum:data.lockedBlockNum_0 || 0,endBlockNum:data.endBlockNum_0 || 0},
                        {chainName:data.chainName_1 || "",chainId:data.chainId_1 || "",beginBlockNum:data.beginBlockNum_1 || 0,lockedBlockNum:data.lockedBlockNum_1 || 0,endBlockNum:data.endBlockNum_1 || 0}
                    ]}
                result.data.push(sn);
            }
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async deleteSnapshoot(root:string):Promise<ActionResult>{
        let result = new ActionResult();

        try {
            await getConnection()
            .createQueryBuilder()
            .delete()
            .from(SnapshootEntity)
            .where("merkleRoot = :merkleRoot", { merkleRoot: root })
            .execute();
        } catch (error) {
            result.error = error;
        }

        return result;
    } 

    public async save(sns:BridgeSnapshoot[]):Promise<ActionResult>{
        let result = new ActionResult();

        try {
            await getManager().transaction(async transactionalEntityManager => {
                for(const sn of sns){
                    let entity = new SnapshootEntity();
                    
                    entity.merkleRoot = sn.merkleRoot;
                    entity.parentMerkleRoot = sn.parentMerkleRoot;
                    const vechainInfo = sn.chains.find(chain => {return chain.chainName == this.config.vechain.chainName && chain.chainId == this.config.vechain.chainId;});
                    const ethereumInfo = sn.chains.find(chain => {return chain.chainName == this.config.ethereum.chainName && chain.chainId == this.config.ethereum.chainId;});
                    if(vechainInfo != undefined){
                        entity.chainName_0 = vechainInfo.chainName as string;
                        entity.chainId_0 = vechainInfo.chainId as string;
                        entity.beginBlockNum_0 = vechainInfo.beginBlockNum;
                        entity.lockedBlockNum_0 = vechainInfo.lockedBlockNum;
                        entity.endBlockNum_0 = vechainInfo.endBlockNum;
                    }

                    if(ethereumInfo != undefined){
                        entity.chainName_1 = ethereumInfo.chainName as string;
                        entity.chainId_1 = ethereumInfo.chainId as string;
                        entity.beginBlockNum_1 = ethereumInfo.beginBlockNum;
                        entity.lockedBlockNum_1 = ethereumInfo.lockedBlockNum;
                        entity.endBlockNum_1 = ethereumInfo.endBlockNum;
                    }
                    entity.invalid = true;
                    await transactionalEntityManager.save(entity);
                }
            });
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    private env:any;
    private config:any;
}