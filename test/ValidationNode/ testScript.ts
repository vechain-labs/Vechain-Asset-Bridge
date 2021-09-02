import { SimpleWallet } from "@vechain/connex-driver";
import { keccak256 } from "thor-devkit";
import BridgeStorage from "../../src/ValidationNode/server/bridgeStorage";
import { BridgeSnapshoot, ZeroRoot } from "../../src/ValidationNode/utils/types/bridgeSnapshoot";
import { tokenid, TokenInfo } from "../../src/ValidationNode/utils/types/tokenInfo";

let root = ZeroRoot();
root = "0x80e35de0e437ba03f342ff74280ea19cebc5e2388e59cbf9063373017cbce4e0";
const privatekey = "0x2dd2c5b5d65913214783a6bd5679d8c6ef29ca9f2e2eae98b4add061d0b85ea0";
const signEncodePacked = function(opertion:string,hash:string){
    let hashBuffer = hash != ZeroRoot() ? Buffer.from(hash.substr(2),'hex') : Buffer.alloc(32);
    let encode = Buffer.concat([
        Buffer.from(opertion),
        hashBuffer
    ]);
    return keccak256(encode);
}

let wallet = new SimpleWallet();
wallet.import(privatekey);

wallet.list[0].sign(signEncodePacked("lockBridge",root)).then(value =>{
    // console.log('0x' + value.toString('hex'))
    // 0x47c5c3d3d30922b7ed43176afad8566655282dd3276ae57bc293ed857d2f1cb760c634d7db4ba0f2f4ac5d0d0b130a6df21a229956c8d96a75a6db1a8dbb174101
})

let tokens:Array<TokenInfo> = new Array();

const initTokens = function() {
    tokens = [
        {
            tokenid:"",
            chainName:"vechain",
            chainId:"0xf6",
            tokenAddr:"0x1ffe6f8e48f66163899c116ac15238d6bd4ba4e6",
            tokeType:"1",
            targetToken:""
        },
        {
            tokenid:"",
            chainName:"vechain",
            chainId:"0xf6",
            tokenAddr:"0xb832c81f29ba1c011b5109cf3aa38f8b2d64cfba",
            tokeType:"2",
            targetToken:""
        },
        {
            tokenid:"",
            chainName:"ethereum",
            chainId:"1337",
            tokenAddr:"0x5F2D03eBf427284bcf50C75818ee84a57bD295cD",
            tokeType:"1",
            targetToken:""
        },
        {
            tokenid:"",
            chainName:"ethereum",
            chainId:"1337",
            tokenAddr:"0xf94Ef3458890757aA5686B95eabe577b3608F030",
            tokeType:"2",
            targetToken:""
        },
    ]

    for(let token of tokens){
        token.tokenid = tokenid(token.chainName,token.chainId,token.tokenAddr);
    }
    tokens[0].targetToken = tokens[2].tokenid;
    tokens[2].targetToken = tokens[0].tokenid;
    tokens[1].targetToken = tokens[3].tokenid;
    tokens[3].targetToken = tokens[1].tokenid;
}

initTokens();

const genesisSN = {
    parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
    merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
    chains:[
        {
            chainName:"vechain",
            chainId:"0xf6",
            beginBlockNum:406355,
            lockedBlockNum:406355,
            endBlockNum:406355},
        {
            chainName:"ethereum",
            chainId:"1337",
            beginBlockNum:138257,
            lockedBlockNum:138257,
            endBlockNum:138257}
    ]
}

const parentSN = {
    parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
    merkleRoot:"0x80e35de0e437ba03f342ff74280ea19cebc5e2388e59cbf9063373017cbce4e0",
    chains:[
        {
            chainName:"vechain",
            chainId:"0xf6",
            lockedBlockNum:415748,
            beginBlockNum:414970,
            endBlockNum:415765},
        {
            chainName:"ethereum",
            chainId:"1337",
            lockedBlockNum:141338,
            beginBlockNum:141052,
            endBlockNum:141342
        }
    ]
}

const sn:BridgeSnapshoot = {
    parentMerkleRoot:"0x80e35de0e437ba03f342ff74280ea19cebc5e2388e59cbf9063373017cbce4e0",
    merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
    chains:[
        {
            chainName:"vechain",
            chainId:"0xf6",
            lockedBlockNum:415881,
            beginBlockNum:415765,
            endBlockNum:415765},
        {
            chainName:"ethereum",
            chainId:"1337",
            lockedBlockNum:141387,
            beginBlockNum:141342,
            endBlockNum:141342
        }
    ]
}

let storage = new BridgeStorage(parentSN,tokens,[]);
storage.updateLedgers([]);
storage.buildTree(sn.chains,sn.parentMerkleRoot);
const newRoot = storage.getMerkleRoot();

console.log(newRoot);

wallet.list[0].sign(signEncodePacked("updateBridgeMerkleRoot",newRoot)).then(value =>{
    console.log('0x' + value.toString('hex'))
})


//0xee2dbd3d2693e373ad2e0adbc6b6f834e714c762c1b7f28fe91c5c65be99a11a
//364349