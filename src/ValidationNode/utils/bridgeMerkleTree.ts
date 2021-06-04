import { keccak256 } from "thor-devkit";
import MerkleTree, { TreeNode } from "./merkleTree";
import { ChainInfo, SwapBatchInfo } from "./types/swapBatchInfo";
import { SwapTx } from "./types/swapTx";
const sortArray = require('sort-array');

export default class BridgeMerkleTree {
    private stxList = new Array<SwapTx>();
    private tree = new MerkleTree();
    private batchInfo!:SwapBatchInfo;

    public constructor(info:SwapBatchInfo) {
        this.batchInfo = info;
        this.tree = new MerkleTree();
    }

    public addSwapTx(stx:SwapTx){
        this.stxList.push(stx);
    }

    public buildTree():TreeNode{
        this.tree = new MerkleTree();
        let sorted:Array<SwapTx> = sortArray(this.stxList,{
            by:['chainName','chainId','blockNumber','clauseIndex','index'],
            order:'asc'
        });

        sorted.forEach(stx => {
            let newNode = new BridegTreeNode();
            newNode.stx = stx;
            newNode.nodeHash = '0x' + keccak256(BridgeMerkleTree.stxEncodePacked(stx.to,stx.token,stx.balance)).toString('hex');
            this.tree.addNode(newNode);
        });
        let infoNode = new TreeNode();
        infoNode.nodeHash = '0x' + keccak256(BridgeMerkleTree.batchEncodePacked(this.batchInfo)).toString('hex');
        this.tree.addNode(infoNode);
        return this.tree.buildTree();
    }

    public getMerkleProof(leaf:string):Array<string>{
        this.buildTree();
        return this.tree.getMerkleProof(leaf);
    }

    public getRoot():string {
        this.buildTree();
        return this.tree.getRoot();
    }

    public static verificationMerkleProof(leaf:string,root:string,proof:Array<string>):boolean{
        return MerkleTree.verificationMerkleProof(leaf,root,proof);
    }

    public static stxEncodePacked(to:string,token:string,balance:BigInt):Buffer {
        let encode =  Buffer.concat([
            Buffer.from(to.substr(2),'hex'),
            Buffer.from(token.substr(2),'hex'), 
            Buffer.from(balance.toString(16).padStart(64,'0'),'hex')
        ]);
        return encode;
    }

    public static batchEncodePacked(info:SwapBatchInfo):Buffer {
        let sorted:Array<ChainInfo> = sortArray(info.chains,{
            by:['chainName','chainId'],
            order:'asc'
        });

        let encode =  Buffer.from(info.lastMerkleRoot.substr(2),'hex');
        sorted.forEach(chain => {
            let chainBuff = Buffer.concat([
                Buffer.from(chain.chainName,'hex'),
                Buffer.from(chain.chainId,'hex'),
                Buffer.from(BigInt(chain.fromBlockNum).toString(16),'hex'),
                Buffer.from(BigInt(chain.endBlockNum).toString(16),'hex'),
            ]);
            encode = Buffer.concat([encode,chainBuff]);
        });

        return encode;
    }
}

export class BridegTreeNode extends TreeNode {
    public stx:SwapTx|undefined;
}

