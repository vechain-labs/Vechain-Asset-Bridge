import { keccak256 } from "thor-devkit";
import MerkleTree, { TreeNode } from "../utils/merkleTree";
import { BridgeLedger, BridgeLedgerHelper } from "../utils/types/bridgeLedger";
import { BridgeSnapshoot, ChainInfo } from "../utils/types/bridgeSnapshoot";
const sortArray = require('sort-array');

export default class BridgeStorage {

    private ledgerCache = new Array<BridgeLedger>();
    private tree = new MerkleTree();
    private snapshoot:BridgeSnapshoot;
    private merkleRootNode:TreeNode = new TreeNode();

    public constructor(snapshoot:BridgeSnapshoot,ledgers?:BridgeLedger[]) {
        this.snapshoot = snapshoot;
        this.tree = new MerkleTree();
        if(ledgers != undefined && ledgers.length > 0){
            this.ledgerCache = ledgers;
        }
    }

    public updateLedgers(ledgers:BridgeLedger[]){
        for(const ledger of ledgers){
            let targetIndex = this.ledgerCache.findIndex(item =>{return item.ledgerid == ledger.ledgerid});
            if( targetIndex != -1){
                if(ledger.balance == BigInt(0)){
                    this.ledgerCache.splice(targetIndex,1);
                } else {
                    this.ledgerCache[targetIndex] = ledger;
                }
            } else {
                this.ledgerCache.push(ledger);
            }
        }
    }

    public buildTree(newchains?:ChainInfo[],parentRoot?:string):TreeNode{
        this.tree = new MerkleTree();
        const sorted:Array<BridgeLedger> = sortArray(this.ledgerCache,{
            by:["ledgerid"],
            order:"asc"
        });

        sorted.forEach(ledger =>{
            let leaf = new BridgeStorageTreeNode();
            leaf.ledger = ledger;
            leaf.nodeHash = BridgeLedgerHelper.ledgerHash(leaf.ledger);
            this.tree.addNode(leaf);
        });

        let infoNode = new TreeNode();
        let pRoot = parentRoot ? parentRoot : this.snapshoot.merkleRoot;
        let chains = newchains ? newchains : this.snapshoot.chains;
        infoNode.nodeHash = BridgeStorage.snapshootHash(pRoot,chains);
        this.tree.addNode(infoNode);

        this.merkleRootNode = this.tree.buildTree();

        this.snapshoot.chains = chains;
        this.snapshoot.parentMerkleRoot = this.snapshoot.merkleRoot;
        this.snapshoot.merkleRoot = this.merkleRootNode.nodeHash;

        return this.merkleRootNode;
    }

    public getMerkleRoot():string{
        return this.merkleRootNode.nodeHash;
    }

    public getLedgers():BridgeLedger[]{
        let clone = new Array<BridgeLedger>();
        return Object.assign(clone,this.ledgerCache);
    }

    public getMerkleProof(ledger:BridgeLedger):Array<string> {
        let leafHash = BridgeLedgerHelper.ledgerHash(ledger);
        return this.tree.getMerkleProof(leafHash);
    }

    public static verificationMerkleProof(ledger:BridgeLedger,root:string,proof:Array<string>):boolean{
        let leafHash = BridgeLedgerHelper.ledgerHash(ledger);
        return MerkleTree.verificationMerkleProof(leafHash,root,proof);
    }

    public static snapshootEncodePacked(parentRoot:string,chains:ChainInfo[]):Buffer {
        let sorted:Array<ChainInfo> = sortArray(chains,{
            by:['chainName','chainId'],
            order:'asc'
        });

        let encode =  Buffer.from(parentRoot.substr(2),'hex');
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

    public static snapshootHash(parentRoot:string,chains:ChainInfo[]):string {
        return '0x' + keccak256(BridgeStorage.snapshootEncodePacked(parentRoot,chains)).toString('hex');
    }
}

export class BridgeStorageTreeNode extends TreeNode {
    public ledger!:BridgeLedger;
}