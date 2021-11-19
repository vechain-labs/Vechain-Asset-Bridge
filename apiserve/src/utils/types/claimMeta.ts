import { keccak256 } from "thor-devkit";
import { BridgeTx } from "../../common/utils/types/bridgeTx";
import { TokenInfo } from "../../common/utils/types/tokenInfo";

export type ClaimMeta = {
    claimId:string,
    account:string,
    merkleRoot:string,
    from:TokenInfo,
    to:TokenInfo,
    sendingTxs:Array<BridgeTx>,
    receivingTx?:BridgeTx,
    totalAmount:bigint,
    status:0|1|2,    //0:InProcess 1:Watting for Claim 2: Claimed
    extension?:any
}

export function claimID(merkleroot:string,meta:ClaimMeta):string {
    let encode = Buffer.concat([
        Buffer.from(meta.to.chainName),
        Buffer.from(meta.to.chainId),
        Buffer.from(meta.account.substring(2),'hex'),
        Buffer.from(meta.to.address.substring(2),'hex'),
        Buffer.from(merkleroot.substring(2),'hex')
    ]);
    return '0x' + keccak256(encode).toString('hex');
}