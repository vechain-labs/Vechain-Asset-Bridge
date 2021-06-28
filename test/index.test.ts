import { Trie } from "merkle-patricia-tree/dist/baseTrie";

describe('Bridge MPT',() =>{

    it("",async() =>{
        let trie = new Trie();

        let root = trie.root;
        console.log(root.toString('hex'));

        let key = "0x0625E7b8a7c2E696Cb31fD130162189314520171";
        let value1 = "0x70145abe26223e6c3c61861f9712b51ebf0920b40760fd26e3583a77893c6a20";

        await trie.put(Buffer.from(key.substr(2),"hex"),Buffer.from(value1.substr(2),"hex"));
        root = trie.root;
        console.log(root.toString('hex'));

        let value2 = "0xa3a599280629d8e40a3fab4436ddac2cc47499bb0a9120ecaeb3c1e0d36233c5";
        await trie.put(Buffer.from(key.substr(2),"hex"),Buffer.from(value2.substr(2),"hex"));
        root = trie.root;
        console.log(root.toString('hex'));
    });
});