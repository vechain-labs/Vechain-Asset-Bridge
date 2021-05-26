import assert from "assert";
import { abi, keccak256 } from "thor-devkit";
import BridgeMerkleTree from "../../src/ValidationNode/utils/bridgeMerkleTree";
import { SwapTx } from "../../src/ValidationNode/utils/types/swapTx";

describe('Bridge Merkle Tree',() => {
    let stxList:Array<SwapTx> = [
        {chainName:"ethereum",chainId:"0",blockNumber:10000,clauseIndex:0,index:0,
        to:"0x73f78bcda1f83c391F75cfe9d53548C3D0539E57",token:"0x59741509E614ABbE3af30862dF442e2196c563c9",balance:BigInt(500)},
        {chainName:"vechain",chainId:"27",blockNumber:1003,clauseIndex:2,index:9,
        to:"0x933f322f1d85D57C7cA90466e2d6B045CbD52Cba",token:"0x8B0cB6d1aa425fe3Ff57d0d796C9cfA4d384024f",balance:BigInt(1)},
        {chainName:"ethereum",chainId:"0",blockNumber:10003,clauseIndex:0,index:9,
        to:"0x120EAE1A408183afCac4cbe5579d88535bdfBb4D",token:"0x7DB64d97c157E863A49004E582FA66d0d6129cA5",balance:BigInt(400)},
        {chainName:"ethereum",chainId:"0",blockNumber:10000,clauseIndex:0,index:50,
        to:"0x120EAE1A408183afCac4cbe5579d88535bdfBb4D",token:"0x7DB64d97c157E863A49004E582FA66d0d6129cA5",balance:BigInt(1000)},
        {chainName:"vechain",chainId:"27",blockNumber:998,clauseIndex:0,index:0,
        to:"0x120EAE1A408183afCac4cbe5579d88535bdfBb4D",token:"0x7DB64d97c157E863A49004E582FA66d0d6129cA5",balance:BigInt(300)},
    ];

    let tree = new BridgeMerkleTree();

    before("",() =>{
        stxList.forEach(stx =>{
            tree.addSwapTx(stx);
        });
    });

    it("get root hash",() =>{
        let rootHash = tree.getRoot();
        assert.strictEqual(rootHash.toLowerCase(),"0x12486641484c3e0e2b28d5b669c698370cc332a68f790a37455e756b3001dff1");
    });

    it("get merkle proof",() =>{
        let stx = stxList[0];
        let leaf = "0x" + keccak256(BridgeMerkleTree.stxEncodePacked(stx.to,stx.token,stx.balance)).toString('hex');
        let proof = tree.getMerkleProof(leaf);
        assert.deepStrictEqual(proof,
            ["0x95e424dd468105203657ef9316a038a4b6ab01262078ec582ac62316b0eccf30",
            "0x655ad8527a952400618bc419849d7e7b3771854054f18cf483d5b63a1d68ffb1",
            "0xd5f1f5aa650796648096fc3616bc7b99acd66c1bc677d87d29573fbb7e3ebbc0"]);
    });

    it("verification proof",()=>{
        let stx = stxList[0];
        let leaf = "0x" + keccak256(BridgeMerkleTree.stxEncodePacked(stx.to,stx.token,stx.balance)).toString('hex');
        let root = "0x12486641484c3e0e2b28d5b669c698370cc332a68f790a37455e756b3001dff1";
        let proof = ["0x95e424dd468105203657ef9316a038a4b6ab01262078ec582ac62316b0eccf30",
        "0x655ad8527a952400618bc419849d7e7b3771854054f18cf483d5b63a1d68ffb1",
        "0xd5f1f5aa650796648096fc3616bc7b99acd66c1bc677d87d29573fbb7e3ebbc0"];

        assert.strictEqual(BridgeMerkleTree.verificationMerkleProof(leaf,root,proof),true);
    });
});