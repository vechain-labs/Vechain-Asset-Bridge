import { getManager, getRepository } from "typeorm";
import { ActionData, ActionResult } from "../utils/components/actionResult";
import { TokenInfo } from "../utils/types/tokenInfo";
import { TokenEntity } from "./entities/tokenInfo.entity";


export default class TokenInfoModel {

    public async getTokenInfos():Promise<ActionData<TokenInfo[]>>{
        let result = new ActionData<TokenInfo[]>();
        result.data = new Array<TokenInfo>();

        try {
            let data = await getRepository(TokenEntity)
                .createQueryBuilder()
                .where("valid = true")
                .getMany();
            for(const entity of data){
                let _new:TokenInfo = {
                    tokenid:entity.tokenid,
                    chainName:entity.chainName,
                    chainId:entity.chainId,
                    name:entity.name,
                    symbol:entity.symbol,
                    decimals:entity.decimals,
                    address:entity.tokenAddr,
                    nativeCoin:false,
                    tokenType:entity.tokenType,
                    targetTokenId:entity.targetToken,
                    begin:entity.begin,
                    end:entity.end,
                    update:entity.update,
                    updateBlock:entity.updateBlock
                }
                result.data.push(_new);
            }

        } catch (error) {
            result.error = new Error(`getTokenInfos faild: ${JSON.stringify(error)}`);
        }
        
        return result;
    }

    public async save(tokens:TokenInfo[]):Promise<ActionResult>{
        let result = new ActionResult();
        try {
            await getManager().transaction(async transactionalEntityManager => {
                for(const token of tokens){
                    let entity = new TokenEntity();
                    entity.tokenid = token.tokenid;
                    entity.chainName = token.chainName;
                    entity.chainId = token.chainId;
                    entity.name = token.name;
                    entity.symbol = token.symbol;
                    entity.decimals = token.decimals;
                    entity.tokenAddr = token.address;
                    entity.tokenType = token.tokenType;
                    entity.targetToken = token.targetTokenId;
                    entity.begin = token.begin;
                    entity.end = token.end;
                    entity.update = token.update;
                    entity.updateBlock = token.updateBlock;
                    entity.valid = true;
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
                        TokenEntity,
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