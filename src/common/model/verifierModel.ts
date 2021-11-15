import { getManager, getRepository } from "typeorm";
import { ActionData, ActionResult } from "../utils/components/actionResult";
import { Verifier } from "../utils/types/verifier";
import { VerifierEntity } from "./entities/verifier.entity";

export default class VerifierModel {

    public async getVerifiers():Promise<ActionData<Verifier[]>>{
        let result = new ActionData<Verifier[]>();
        result.data = new Array<Verifier>();

        try {
            let data = await getRepository(VerifierEntity)
                .find();
            for(const entity of data){
                let _new:Verifier = {
                    verifier:entity.verifier,
                    status:entity.status,
                    update:entity.update
                }
                result.data.push(_new);
            }

        } catch (error) {
            result.error = new Error(`getVerifiers faild: ${JSON.stringify(error)}`);
        }
        
        return result;
    }

    public async save(verifiers:Verifier[]):Promise<ActionResult>{
        let result = new ActionResult();
        try {
            await getManager().transaction(async transactionalEntityManager => {
                for(const verifier of verifiers){
                    let entity = new VerifierEntity();
                    entity.verifier = verifier.verifier;
                    entity.status = verifier.status;
                    entity.update = verifier.update;
                    await transactionalEntityManager.save(entity);
                }
            });
        } catch (error) {
            result.error = error;
        }
        return result;
    }

    public async removeByBlockIds(chainName:string,chainId:string,blockIds:string[]):Promise<ActionResult>{
        let result = new ActionResult();
        try {
            await getManager().transaction(async transactionalEntityManager => {
                for(const blockId of blockIds){
                    await transactionalEntityManager.update(
                        VerifierEntity,
                        {updateBlock:blockId},
                        {valid:false})
                }
            });
        } catch (error) {
            result.error = error;
        }

        return result;
    }
}