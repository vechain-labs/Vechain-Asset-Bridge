import { keccak256 } from "thor-devkit";
import { ActionResult } from "./utils/components/actionResult";
import MerkleTree, { TreeNode } from "./utils/merkleTree";
import { BridgeLedger, ledgerHash, ledgerID } from "./utils/types/bridgeLedger";
import { BridgeSnapshoot, ChainInfo } from "./utils/types/bridgeSnapshoot";
import { SwapTx } from "./utils/types/swapTx";
import { findTargetToken, TokenInfo } from "./utils/types/tokenInfo";
const sortArray = require('sort-array');
const Copy = require('object-copy');

export default class BridgeStorage {

    public readonly ledgerCache = new Array<BridgeLedger>();
    private tree = MerkleTree.createNewTree();
    private snapshoot:BridgeSnapshoot;
    private merkleRootNode:TreeNode = new TreeNode();
    private tokenInfo = new Array<TokenInfo>();

    public constructor(snapshoot:BridgeSnapshoot,tokenInfo:TokenInfo[],ledgers?:BridgeLedger[]) {
        this.snapshoot = {parentMerkleRoot:"",merkleRoot:"",chains:[]};
        Copy(this.snapshoot,snapshoot);
        this.tokenInfo = tokenInfo;
        this.tree = MerkleTree.createNewTree();
        if(ledgers != undefined && ledgers.length > 0){
            this.ledgerCache = this.ledgerCache.concat(ledgers);
        }
    }

    public updateLedgers(txs:SwapTx[]):ActionResult{
        let result = new ActionResult();
        const sorted:Array<SwapTx> = sortArray(txs,{
            by:["timestamp"],
            order:"asc"
        });

        for(const tx of sorted){
            if(tx.type == "swap"){
                const targetToken = findTargetToken(this.tokenInfo,tx.chainName,tx.chainId,tx.token);
                if(targetToken == undefined){
                    result.error = `not found target token, sourcetoken: chainName:${tx.chainName} chainId:${tx.chainId} token:${tx.token}`;
                    return result;
                }
                const ledgerid = ledgerID(targetToken.chainName,targetToken.chainId,targetToken.address,tx.account);
                const targetIndex = this.ledgerCache.findIndex(item =>{return item.ledgerid == ledgerid});
                if(targetIndex != -1){
                    let ledger = this.ledgerCache[targetIndex];
                    ledger.balance = ledger.balance + tx.amount;
                } else {
                    let newLedger:BridgeLedger = {
                        root:"",
                        ledgerid:ledgerid,
                        chainName:targetToken.chainName,
                        chainId:targetToken.chainId,
                        account:tx.account,
                        token:targetToken.address,
                        balance:tx.amount
                    }
                    this.ledgerCache.push(newLedger);
                }
            } else if(tx.type == "claim"){
                const originToken = this.tokenInfo.find(token => {return token.chainName == tx.chainName && token.chainId == tx.chainId && token.address.toLowerCase() == tx.token.toLowerCase()});
                if(originToken == undefined){
                    result.error = `not found target token, sourcetoken: chainName:${tx.chainName} chainId:${tx.chainId} token:${tx.token}`;
                    return result;
                }
                const ledgerid = ledgerID(originToken.chainName,originToken.chainId,originToken.address,tx.account);
                const targetIndex = this.ledgerCache.findIndex(item =>{return item.ledgerid == ledgerid});
                if(targetIndex != -1){
                    let ledger = this.ledgerCache[targetIndex];
                    ledger.balance = ledger.balance - tx.amount;
                    if(ledger.balance == BigInt(0)){
                        this.ledgerCache.splice(targetIndex,1);
                    }
                } else {
                    result.error = `update ledger error: empty ledger can't to claim,chainName:${originToken.chainName} chainId:${originToken.chainId} account:${tx.account} token:${originToken.address}`;
                    return result;
                }
            }
            // const targetToken = findTargetToken(this.tokenInfo,tx.chainName,tx.chainId,tx.token);
            // if(targetToken == undefined){
            //     result.error = `not found target token, sourcetoken: chainName:${tx.chainName} chainId:${tx.chainId} token:${tx.token}`;
            //     return result;
            // }

            // const ledgerid = ledgerID(targetToken.chainName,targetToken.chainId,targetToken.address,tx.account);
            // const targetIndex = this.ledgerCache.findIndex(item =>{return item.ledgerid == ledgerid});
            // if(targetIndex != -1){
            //     let ledger = this.ledgerCache[targetIndex];
            //     if(tx.type == "swap"){
            //         ledger.balance = ledger.balance + tx.amount;
            //     } else {
            //         ledger.balance = ledger.balance - tx.amount;
            //     }
            //     if(ledger.balance == BigInt(0)){
            //         this.ledgerCache.splice(targetIndex,1);
            //     }
            // } else if(tx.type == "swap"){
            //     let newLedger:BridgeLedger = {
            //         root:"",
            //         ledgerid:ledgerid,
            //         chainName:targetToken.chainName,
            //         chainId:targetToken.chainId,
            //         account:tx.account,
            //         token:targetToken.address,
            //         balance:tx.amount
            //     }
            //     this.ledgerCache.push(newLedger);
            // } else {
            //     result.error = `update ledger error: empty ledger can't to claim,chainName:${targetToken.chainName} chainId:${targetToken.chainId} account:${tx.account} token:${targetToken.address}`;
            //     return result;
            // }
        }
        return result;
    }

    public mergeLedgers(ledgers:BridgeLedger[]){
        for(const ledger of ledgers){
            let targetIndex = this.ledgerCache.findIndex(item =>{return item.ledgerid == ledger.ledgerid});
            if( targetIndex != -1){
                if(ledger.balance == BigInt(0)){
                    this.ledgerCache.splice(targetIndex,1);
                } else {
                    Copy(this.ledgerCache[targetIndex],ledger);
                }
            } else {
                this.ledgerCache.push(Object.assign(ledger));
            }
        }
    }

    public buildTree(newchains?:ChainInfo[],parentRoot?:string):TreeNode{
        this.tree = MerkleTree.createNewTree();
        const sorted:Array<BridgeLedger> = sortArray(this.ledgerCache,{
            by:["ledgerid"],
            order:"asc"
        });

        sorted.forEach(ledger =>{
            let leaf = new BridgeStorageTreeNode();
            leaf.ledger = ledger;
            leaf.nodeHash = ledgerHash(leaf.ledger);
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
        clone = clone.concat(this.ledgerCache);
        return clone;
    }

    public getMerkleProof(ledger:BridgeLedger):Array<string> {
        let leafHash = ledgerHash(ledger);
        return this.tree.getMerkleProof(leafHash);
    }

    public static verificationMerkleProof(ledger:BridgeLedger,root:string,proof:Array<string>):boolean{
        let leafHash = ledgerHash(ledger);
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
                Buffer.from(chain.chainName),
                Buffer.from(chain.chainId),
                Buffer.from(BigInt(chain.beginBlockNum).toString(16),'hex'),
                Buffer.from(BigInt(chain.lockedBlockNum).toString(16),'hex'),
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