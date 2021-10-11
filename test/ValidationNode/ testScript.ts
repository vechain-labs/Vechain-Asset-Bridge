    import { Driver, SimpleNet, SimpleWallet } from "@vechain/connex-driver";
    import { Framework } from "@vechain/connex-framework";
    import path from "path";
    import { keccak256 } from "thor-devkit";
    import BridgeStorage from "../../src/common/bridgeStorage";
    import { BridgeSnapshoot, ZeroRoot } from "../../src/common/utils/types/bridgeSnapshoot";
    import { SwapTx } from "../../src/common/utils/types/swapTx";
    import { tokenid, TokenInfo } from "../../src/common/utils/types/tokenInfo";

    let root = ZeroRoot();
    root = "0xd220cc9e849e82258f80d28175091db722a4cb2d3d200b24618f9879c1195311";
    const privatekey = "0x2dd2c5b5d65913214783a6bd5679d8c6ef29ca9f2e2eae98b4add061d0b85ea0";
    const signEncodePacked = function(opertion:string,hash:string){
        let hashBuffer = hash != ZeroRoot() ? Buffer.from(hash.substring(2),'hex') : Buffer.alloc(32);
        let encode = Buffer.concat([
            Buffer.from(opertion),
            hashBuffer
        ]);
        return keccak256(encode);
    }

    let wallet = new SimpleWallet();
    wallet.import(privatekey);

    const config = require("./test.config.json");

    wallet.list[0].sign(signEncodePacked("updateBridgeMerkleRoot",root)).then(value =>{
        console.info('0x' + value.toString('hex'))
        // lock     0x47c5c3d3d30922b7ed43176afad8566655282dd3276ae57bc293ed857d2f1cb760c634d7db4ba0f2f4ac5d0d0b130a6df21a229956c8d96a75a6db1a8dbb174101
        // unlock   0x2cb11a676bb23b196f3c53b07daf5cfb43b65b1d4ad16755659883bed38d1a082feec399edd09239eb33bac6ab4ad90d8f781c3598529dd72f41c180b10112bf00
    })

let tokenInfo:Array<TokenInfo> = new Array();

const initTokens = function() {
    tokenInfo = [
        {
            tokenid:"",
            chainName:"vechain",
            chainId:"0xf6",
            name:"VVET",
            symbol:"VVET",
            decimals:18,
            address:config.vechain.contracts.vVet,
            nativeCoin:false,
            tokenType:"1",
            targetTokenId:""
        },
        {
            tokenid:"",
            chainName:"vechain",
            chainId:"0xf6",
            name:"VETH",
            symbol:"VETH",
            decimals:18,
            address:config.vechain.contracts.vEth,
            nativeCoin:false,
            tokenType:"2",
            targetTokenId:""
        },
        {
            tokenid:"",
            chainName:"ethereum",
            chainId:"1337",
            name:"WVET",
            symbol:"WVET",
            decimals:18,
            address:config.ethereum.contracts.wVet,
            nativeCoin:false,
            tokenType:"2",
            targetTokenId:""
        },
        {
            tokenid:"",
            chainName:"ethereum",
            chainId:"1337",
            name:"WETH",
            symbol:"WETH",
            decimals:18,
            address:config.ethereum.contracts.wEth,
            nativeCoin:false,
            tokenType:"1",
            targetTokenId:""
        }
    ]

    for(let token of tokenInfo){
        token.tokenid = tokenid(token.chainName,token.chainId,token.address);
    }
    tokenInfo[0].targetTokenId = tokenInfo[2].tokenid;
    tokenInfo[2].targetTokenId = tokenInfo[0].tokenid;
    tokenInfo[1].targetTokenId = tokenInfo[3].tokenid;
    tokenInfo[3].targetTokenId = tokenInfo[1].tokenid;
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
    parentMerkleRoot:"0xa20fa93c20ca1f796eacc29d43a16e553e90c16d372f7f8ffede55439d0376c5",
    merkleRoot:"0x6956f1e4b4036e2589b10871daf80818d6a384fac67f360b93b3c71d2e42a85d",
    chains:[
        {
            chainName:"vechain",
            chainId:"0xf6",
            lockedBlockNum:560787,
            beginBlockNum:560763,
            endBlockNum:560814},
        {
            chainName:"ethereum",
            chainId:"1337",
            lockedBlockNum:28221,
            beginBlockNum:28213,
            endBlockNum:28229
        }
    ]
}

const sn:BridgeSnapshoot = {
    parentMerkleRoot:"0x6956f1e4b4036e2589b10871daf80818d6a384fac67f360b93b3c71d2e42a85d",
    merkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
    chains:[
        {
            chainName:"vechain",
            chainId:"0xf6",
            lockedBlockNum:561347,
            beginBlockNum:560814,
            endBlockNum:561347},
        {
            chainName:"ethereum",
            chainId:"1337",
            lockedBlockNum:28405,
            beginBlockNum:28229,
            endBlockNum:28405
        }
    ]
}

const swapTxs:SwapTx[] = [
    {
        chainName:"vechain",
        chainId:"0xf6",
        blockNumber:561168,
        txid:"0x2ccd9bc1a3deb3e1973793477c90198314f2b3a385426b20c1361a0d379acecd",
        clauseIndex:0,
        index:0,
        account:"0x361277D1b27504F36a3b33d3a52d1f8270331b8C",
        token:"0x58f5152083df2227cfd16229d9aba4d0466564da",
        amount:BigInt("0x00000000000000000000000000000000000000000000003635c9adc5dea00000"),
        reward:BigInt(0),
        timestamp:1631862143,
        type:"swap"
    },
    {
        chainName:"vechain",
        chainId:"0xf6",
        blockNumber:561301,
        txid:"0xf20458256edc9df1c22f2c29845d206d5cb90f2aa28c1e0273ad9dbae58b664e",
        clauseIndex:0,
        index:0,
        account:"0x361277D1b27504F36a3b33d3a52d1f8270331b8C",
        token:"0x58f5152083df2227cfd16229d9aba4d0466564da",
        amount:BigInt("0x00000000000000000000000000000000000000000000006c6b935b8bbd400000"),
        reward:BigInt(0),
        timestamp:1631863441,
        type:"swap"
    }
]

let storage = new BridgeStorage(parentSN,tokenInfo,[]);
storage.updateLedgers(swapTxs);
storage.buildTree(sn.chains,sn.parentMerkleRoot);
const newRoot = storage.getMerkleRoot();

console.info(newRoot);

wallet.list[0].sign(signEncodePacked("updateBridgeMerkleRoot",newRoot)).then(value =>{
    console.info('0x' + value.toString('hex'))
})


// 0xee2dbd3d2693e373ad2e0adbc6b6f834e714c762c1b7f28fe91c5c65be99a11a
// 364349
