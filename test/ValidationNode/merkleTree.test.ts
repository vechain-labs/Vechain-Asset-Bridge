import assert from "assert";
import MerkleTree from "../../src/ValidationNode/utils/merkleTree";

describe('Merkle Tree',() =>{
    let data = [
        "0x7493ef57929803fccfc41b133eaef49ffdc442e3c4ebeefe710176f01d3f9db8",   //1
        "0xc4ca678742d07cab8c401d515ccf28ac93ae08a1ab81fe924d17779ef0688de1",   //2
        "0x10eef25adab228a7dd90c85a483f305a44614f0ef864cbbb00256b201dc8ce1b",   //3
        "0x093a8ac01011b68167755eedfa5ab8ea41fdd3f8a900fddf4991e41ffd6779ff",   //4
        "0x804a4c55c3bb28d793d044e234963a6c4928b813a260f4d8d28f675846b00045",   //5
        "0x465864194f78c66d6c33adf025b9d8d5cf5c6309b095216f328e0fe655afa327",   //6
        "0x810fa225f4b534ade9f2ab50868888c08fc29be378535944057ebc7485cec625",   //7
        "0x723f41906ecea9a3ab8e618f186508c88cbbf7bdf5943e65d9b11fa5d1d4b3db",   //8
        "0x7b5aba570d347d92b4576e23a8900732fa3461b86fe44134acaa656ac4a237f3",   //9
    ];

    let tree = MerkleTree.createNewTree();

    before("",() =>{
        data.forEach(data => {
            tree.addHash(data);
        });
        tree.buildTree();
    });

    it("get root hash",() => {
        let rootHash = tree.getRoot();
        assert.strictEqual(rootHash.toLowerCase(),"0x2d93e01ad863ade5ec32a36092b7b47ed94915363e1b97e36003a3a152f3746f");
    });

    it("get merkle proof",() =>{
        let merkleProof = tree.getMerkleProof("0x804a4c55c3bb28d793d044e234963a6c4928b813a260f4d8d28f675846b00045");
        assert.deepStrictEqual(merkleProof,
            ["0x465864194f78c66d6c33adf025b9d8d5cf5c6309b095216f328e0fe655afa327",
            "0x8dfc9651f0a4e23be483f1ec827b85f549cff9fa848b1a089c05dfc806ca02f8",
            "0xf92783e98bba49f07ab4d1ac519738d7af40c6c3d94557617bc10549a7b778b3",
            "0xf6ca9bd707ea3c1aad818124be3cad1e96e9bba39d2acbd4f04378de5db15c49"
        ]);
    });

    it("verification proof", () =>{
        let leaf = "0x804a4c55c3bb28d793d044e234963a6c4928b813a260f4d8d28f675846b00045";
        let root = "0x2d93e01ad863ade5ec32a36092b7b47ed94915363e1b97e36003a3a152f3746f";
        let proof =  ["0x465864194f78c66d6c33adf025b9d8d5cf5c6309b095216f328e0fe655afa327",
            "0x8dfc9651f0a4e23be483f1ec827b85f549cff9fa848b1a089c05dfc806ca02f8",
            "0xf92783e98bba49f07ab4d1ac519738d7af40c6c3d94557617bc10549a7b778b3",
            "0xf6ca9bd707ea3c1aad818124be3cad1e96e9bba39d2acbd4f04378de5db15c49"
        ];
        assert.strictEqual(MerkleTree.verificationMerkleProof(leaf,root,proof),true);
    });
});
