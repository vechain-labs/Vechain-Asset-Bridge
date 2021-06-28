import { getRepository } from "typeorm";
import { ActionData } from "../../utils/components/actionResult";
import { BridgeSnapshoot } from "../../utils/types/bridgeSnapshoot";
import { SnapshootEntity } from "./entities/snapshoot.entity";

export class SnapshootModel {
    public async getLastSnapshoot():Promise<ActionData<BridgeSnapshoot>>{
        let result = new ActionData<BridgeSnapshoot>();

        try {
            let data = await getRepository(SnapshootEntity)
                .createQueryBuilder("snapshoot")
                .where("snapshoot.invalid = :invalid",{invalid:true})
                .orderBy("snapshoot.index","DESC")
                .getOne();
            result.data = data;
        } catch (error) {
            result.error = error;
        }

        return result;
    }
}