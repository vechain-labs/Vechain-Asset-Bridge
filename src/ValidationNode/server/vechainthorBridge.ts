import { Framework } from "@vechain/connex-framework";

export default class VeChainBridge {
    constructor(connex:Framework,config:any){
        this._connex = connex;
    }

    public async txStatus(txid:string):Promise<"pending"|"reverted"|"confirmed">{
        return "reverted";
    }

    public async bestBlock():Promise<number>{
        return 0;
    }

    public async bridgeLockStatus(blockid:string = "best"):Promise<boolean>{
        return false;
    }

    public async lockBridge():Promise<string>{
        return "";
    }

    public async updateMerkleRoot(root:string):Promise<string>{
        return "";
    }
    
    


    private _connex:Framework;
}