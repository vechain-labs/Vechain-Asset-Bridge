import { keccak256 } from "thor-devkit";

export default class MerkleTree {

    private dataNodes = new Array<TreeNode>();

    public addHash(hash:string){
        let newNode = new TreeNode();
        newNode.nodeHash = hash;
        this.dataNodes.push(newNode);
    }

    public addNode(node:TreeNode){
        this.dataNodes.push(node);
    }

    public buildTree():TreeNode {
        let tree:TreeNode = TreeNode.EmptyTreeNode();
        let nodes = this.dataNodes;

        while(true){
            nodes = this.buildTreeNodes(nodes);
            if(nodes.length == 1){
                tree = nodes[0];
                break;
            }
        }
        return tree;
    }

    public getMerkleProof(leaf:string):Array<string>{
        let result = new Array();
        this.buildTree();
        let targetNode = this.dataNodes.find(node => {return node.nodeHash.toLowerCase() == leaf.toLowerCase();});
        if(targetNode != undefined){
            while(targetNode.parentNode != undefined){
                let parentNode:TreeNode = targetNode!.parentNode!;
                let cnode = parentNode!.childNodes!.find(node => {return node.nodeHash.toLowerCase() != targetNode!.nodeHash.toLowerCase()})!;
                result.push(cnode.nodeHash);
                targetNode = parentNode;
            }
        }

        return result;
    }

    public getRoot():string{
        let tree = this.buildTree();
        return tree.nodeHash;
    }

    public static verificationMerkleProof(leaf:string,root:string,proof:Array<string>):boolean{
        let computedHash = leaf.toLowerCase();
        
        for(let index = 0; index < proof.length; index++){
            let proofElement = proof[index].toLowerCase();
            let values = computedHash <= proofElement ? [computedHash,proofElement] : [proofElement,computedHash];
            computedHash = "0x" + keccak256(MerkleTree.hashEncodePacked(values)).toString('hex');
        }

        return computedHash.toLowerCase() == root.toLowerCase();
    }

    private buildTreeNodes(nodes:Array<TreeNode>):Array<TreeNode> {
        let treeNodes = new Array<TreeNode>();
        if(nodes.length % 2 == 1){
            nodes.push(TreeNode.EmptyTreeNode());
        }

        for(let index = 0; index < nodes.length; index = index + 2){
            let parentNode = this.buildTreeNode(nodes[index],nodes[index+1]);
            treeNodes.push(parentNode);
        }

        return treeNodes;
    }

    private buildTreeNode(l:TreeNode,r:TreeNode):TreeNode{
        let tree:TreeNode = new TreeNode();
        let values = l.nodeHash <= r.nodeHash ? [l.nodeHash,r.nodeHash] : [r.nodeHash,l.nodeHash];
        tree.nodeHash = "0x" + keccak256(MerkleTree.hashEncodePacked(values)).toString('hex');

        l.parentNode = tree;
        r.parentNode = tree;
        tree.childNodes = [l,r];

        return tree;
    }

    public static hashEncodePacked(hashs:string[]):Buffer{
        let encode = Buffer.from('');
        hashs.forEach(hash =>{
            hash = hash.toLowerCase();
            if(hash.toLowerCase().substr(0,2) === "0x"){
                hash = hash.substr(2);
            }
            encode = Buffer.concat([encode,Buffer.from(hash,'hex')]);
        });
        
        return encode;
    }
}

export class TreeNode{
    public nodeHash:string = "";
    public parentNode:TreeNode|undefined;
    public childNodes?:TreeNode[]|undefined;

    public static EmptyTreeNode():TreeNode{
        let empty = new TreeNode();
        empty.nodeHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
        return empty;
    }
}
