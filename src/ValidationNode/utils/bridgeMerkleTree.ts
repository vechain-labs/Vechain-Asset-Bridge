import { abi, keccak256 } from "thor-devkit";
import MerkleTree, { TreeNode } from "./merkleTree";
import { SwapTx } from "./types/swapTx";
const sortArray = require('sort-array');

export default class BridgeMerkleTree {
    private stxList = new Array<SwapTx>();
    private tree = new MerkleTree();

    public constructor() {
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
}

export class BridegTreeNode extends TreeNode {
    public stx:SwapTx|undefined;
}

