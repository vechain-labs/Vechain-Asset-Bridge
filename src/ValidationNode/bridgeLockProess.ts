import { Framework } from "@vechain/connex-framework";
import { ActionResult } from "../common/utils/components/actionResult";
import { TokenInfo } from "../common/utils/types/tokenInfo";
import { EthereumBridgeHead } from "./server/ethereumBridgeHead";
import { EthereumBridgeVerifier } from "./server/ethereumBridgeVerifier";
import LedgerModel from "./server/model/ledgerModel";
import { SnapshootModel } from "./server/model/snapshootModel";
import { VeChainBridgeHead } from "./server/vechainBridgeHead";
import { VeChainBridgeVerifiter } from "./server/vechainBridgeVerifier";

export class BridgeLockProcess{
    constructor(env:any){
        this.env = env;
        this.config = env.config;
        this.connex = this.env.connex;
        this.tokenInfo = this.env.tokenInfo;
        this.vechainBridge = new VeChainBridgeHead(this.env);
        this.ethereumBridge = new EthereumBridgeHead(this.env);
        this.snapshootModel = new SnapshootModel(this.env);
        this.ledgerModel = new LedgerModel(this.env);
        this.vechainVerifier = new VeChainBridgeVerifiter(this.env);
        this.ethereumVerifier = new EthereumBridgeVerifier(this.env);
    }

    public async run(root:string):Promise<ActionResult>{
        let result = new ActionResult();
        let status = this.Status.None;

        while(true){

        }

        return result;
    }

    private env:any;
    private config:any;
    private vechainBridge:VeChainBridgeHead;
    private vechainVerifier:VeChainBridgeVerifiter;
    private ethereumBridge:EthereumBridgeHead;
    private ethereumVerifier:EthereumBridgeVerifier;
    private connex!:Framework;
    private tokenInfo!:Array<TokenInfo>;
    private snapshootModel!:SnapshootModel;
    private ledgerModel!:LedgerModel;
    private readonly tryLimit = 6 * 5;

    private Status = {
        None:"None",
        VeChainNoLocked:"VeChaiVeChainNoLocked",
        VeChainLockedUnconfirmed:"VeChainLockedUnconfirmed",
        VeChainLockedConfirmed:"VeChainLockedConfirmed",
        EthereumLockedUnconfirmed:"EthereumLockedUnconfirmed",
        EthereumLockedConfirmed:"EthereumLockedConfirmed",
        MerklerootNomatch:"MerklerootNomatch"
    }
}