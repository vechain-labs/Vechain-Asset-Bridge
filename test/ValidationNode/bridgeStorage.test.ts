import assert from "assert";
import BridgeStorage from "../../src/ValidationNode/server/bridgeStorage";
import { BridgeLedger, BridgeLedgerHelper } from "../../src/ValidationNode/utils/types/bridgeLedger";
import { BridgeSnapshoot } from "../../src/ValidationNode/utils/types/bridgeSnapshoot";

describe("Bridge Storage Test",() =>{
     let ledgers:Array<BridgeLedger> = [
         {ledgerid:"",chainName:"ethereum",chainId:"3",account:"0x3afb3AD080C4156ac8EE118ff20098A8e61036AD",token:"0xb077b468D2884d05ea36F5dB25bdf79BEad8D1fF",balance:BigInt(100)},
         {ledgerid:"",chainName:"ethereum",chainId:"3",account:"0xc84C3F64F7EEfaFB62Dc53F829219B7393464C45",token:"0xb077b468D2884d05ea36F5dB25bdf79BEad8D1fF",balance:BigInt(500)},
         {ledgerid:"",chainName:"ethereum",chainId:"3",account:"0xcBc6F8F1a6907841666Fd4D5491194144AC75231",token:"0xb077b468D2884d05ea36F5dB25bdf79BEad8D1fF",balance:BigInt(1000)},
         {ledgerid:"",chainName:"ethereum",chainId:"3",account:"0xbbE7392dD9C11866Fd0E82060614650B79a3D44d",token:"0x291464cD0b79E3032A7c375bC7Ab085206Cc1e2f",balance:BigInt(1000)},
         {ledgerid:"",chainName:"vechain",chainId:"0xf6",account:"0x473B001DC2bc56ecA9020453b4365fa6389CF625",token:"0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377",balance:BigInt(200)},
         {ledgerid:"",chainName:"vechain",chainId:"0xf6",account:"0xc8Be0902a99f4aCF0FCfa2E2462eB3C6774725d6",token:"0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377",balance:BigInt(500)},
         {ledgerid:"",chainName:"vechain",chainId:"0xf6",account:"0x87BAD4523cb107F323fDa001aAebfe30409bF777",token:"0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377",balance:BigInt(2000)},
     ];

     ledgers.forEach(ledger =>{
        ledger.ledgerid = BridgeLedgerHelper.ledgerID(ledger.chainName,ledger.chainId,ledger.account,ledger.token);
     });


     let genesisSnapshoot:BridgeSnapshoot = {
         parentMerkleRoot:"0x0000000000000000000000000000000000000000000000000000000000000000",
         merkleRoot:"",
         chains:[
             {chainName:"ethereum",chainId:"3",fromBlockNum:100,endBlockNum:150},
             {chainName:"vechain",chainId:"0xf6",fromBlockNum:1000,endBlockNum:3000}
         ]
     }

     let storage:BridgeStorage;

     it("Storage init", () =>{
         storage = new BridgeStorage(genesisSnapshoot,ledgers);
         storage.buildTree(genesisSnapshoot.chains);
     });

     it("Merkle proof",() =>{
         let root = storage.getMerkleRoot();
         let merkleProof = storage.getMerkleProof(ledgers[0]);
         let verify = BridgeStorage.verificationMerkleProof(ledgers[0],root,merkleProof);
         assert.strictEqual(verify,true);
     });

     it("update ledger",()=>{
         let updateLedgers = [
            {ledgerid:"",chainName:"vechain",chainId:"0xf6",account:"0x473B001DC2bc56ecA9020453b4365fa6389CF625",token:"0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377",balance:BigInt(0)},
            {ledgerid:"",chainName:"vechain",chainId:"0xf6",account:"0x95ABbad5ddeA8F40dE15e04473C719f45c24D953",token:"0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377",balance:BigInt(500)},
            {ledgerid:"",chainName:"vechain",chainId:"0xf6",account:"0x87BAD4523cb107F323fDa001aAebfe30409bF777",token:"0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377",balance:BigInt(1000)},
         ];

         updateLedgers.forEach(ledger =>{
            ledger.ledgerid = BridgeLedgerHelper.ledgerID(ledger.chainName,ledger.chainId,ledger.account,ledger.token);
         });

         storage.updateLedgers(updateLedgers);
         storage.buildTree(genesisSnapshoot.chains);
         
         let newLedgers = storage.getLedgers();
         
         let index1 = newLedgers.findIndex(ledger =>{return ledger.account == "0x473B001DC2bc56ecA9020453b4365fa6389CF625" && ledger.token == "0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377"});
         assert.strictEqual(index1,-1);

         let ledger2 = newLedgers.find(ledger => {return ledger.account == "0x95ABbad5ddeA8F40dE15e04473C719f45c24D953" && ledger.token == "0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377"});
         if(ledger2 == undefined){
             assert.fail("can't found the ledger");
         }

         if(ledger2.balance != BigInt(500)){
            assert.fail("ledger2 balance check faild");
         }

         let ledger3 = newLedgers.find(ledger => {return ledger.account == "0x87BAD4523cb107F323fDa001aAebfe30409bF777" && ledger.token == "0x0aCc7bfC8f7d904FE4A35f32f529217C7CA75377"});
         if(ledger3 == undefined){
            assert.fail("can't found the ledger");
        }

        if(ledger3.balance != BigInt(1000)){
           assert.fail("ledger2 balance check faild");
        }

        let root = storage.getMerkleRoot();
        let merkleProof = storage.getMerkleProof(updateLedgers[2]);
        let verify = BridgeStorage.verificationMerkleProof(updateLedgers[2],root,merkleProof);
        assert.strictEqual(verify,true);
     });
});