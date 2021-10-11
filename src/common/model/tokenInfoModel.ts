import { getRepository } from "typeorm";
import { ActionData } from "../utils/components/actionResult";
import { TokenInfo } from "../utils/types/tokenInfo";
import { TokenEntity } from "./entities/tokenInfo.entity";


export default class TokenInfoModel {

    public async getTokenInfo():Promise<ActionData<TokenInfo[]>>{
        let result = new ActionData<TokenInfo[]>();
        result.data = new Array<TokenInfo>();

        try {
            let data = await getRepository(TokenEntity)
                .find();
            
            // data.forEach(entity =>{
            //     let token:TokenInfo = {
            //         tokenid:entity.tokenid,
            //         chainName:entity.chainName,
            //         chainId:entity.chainId,
            //         symbol:entity.tokenSymbol,
            //         address:entity.tokenAddr,
            //         tokenType:entity.tokenType,
            //         targetToken:entity.targetToken
            //     };
            //     result.data!.push(token);
            // });
        } catch (error) {
            result.error = new Error(`getCalculateTreeConfig faild: ${JSON.stringify(error)}`);
        }
        
        return result;
    }
}