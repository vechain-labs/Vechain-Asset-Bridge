import { Driver, SimpleNet, SimpleWallet, Wallet } from '@vechain/connex-driver';
import { Framework } from '@vechain/connex-framework';
import * as Devkit from 'thor-devkit';
import  assert  from 'assert';
import path from 'path';
import { compileContract } from 'myvetools/dist/utils';
import { Contract } from 'myvetools';
import { getReceipt } from 'myvetools/dist/connexUtils';
import fs from 'fs';

describe('V2E bridge test',() =>{
    let connex: Framework;
	let driver: Driver;
    let wallet = new SimpleWallet();
    let contract:Contract;

    let configPath = path.join(__dirname,'./test.config.json');
    let config:any = {};
    
    before( async () => {
        if(fs.existsSync(configPath)){
            config = require(configPath);
            let masterNode = Devkit.HDNode.fromMnemonic((config.mnemonic as string).split(' '));
            for(let index = 0; index < 10; index++){
                let account = masterNode.derive(index);
                wallet.import(account.privateKey!.toString('hex'));
            }

            try {
                driver = await Driver.connect(new SimpleNet(config.nodeHost as string),wallet);
                connex = new Framework(driver);

                const filePath = path.join(__dirname,"../../src/SmartContracts/contracts/vechainthor/Contract_V2EBridgeHead.sol");
                const abi = JSON.parse(compileContract(filePath, 'V2EBridgeHead', 'abi'));
                const bin = compileContract(filePath, 'V2EBridgeHead', 'bytecode');

                contract = new Contract({ abi: abi, connex: connex, bytecode: bin });
            } catch (error) {
                assert.fail('Failed to connect: ' + error);
            }
        } else {
            assert.fail(`can't load ${configPath}`);
        }
    });

    it("deploy bridge contract", async() =>{
        if(config.contracts.v2eBridgeAddr != undefined && config.contracts.v2eBridgeAddr.length == 42){
            contract.at(config.contracts.v2eBridgeAddr);
        } else {
            const clause1 = contract.deploy(0);

            const txRep: Connex.Vendor.TxResponse = await connex.vendor.sign('tx', [clause1])
            .signer(wallet.list[0].address)
            .request();

            const receipt = await getReceipt(connex, 5, txRep.txid);
            if (receipt != null && receipt.outputs[0].contractAddress !== null) {
                contract.at(receipt.outputs[0].contractAddress);
                config.contracts.v2eBridgeAddr = receipt.outputs[0].contractAddress;

                try {
                    fs.writeFileSync(configPath,JSON.stringify(config));
                    const clause2 = contract.send("setVerifier",0,wallet.list[0].address);
                    const txRep2: Connex.Vendor.TxResponse = await connex.vendor.sign('tx', [clause2])
                    .signer(wallet.list[0].address)
                    .request();

                    const receipt2 = await getReceipt(connex, 5, txRep2.txid);
                    if(receipt2 != null && receipt2.reverted == false){
                    } else {
                        assert.fail("setVerifier faild");
                    }


                } catch (error) {
                    assert.fail("save config faild");
                }
            } else {
                assert.fail("vVET deploy faild");
            }
        }

        let clauses = new Array<any>();
        if(config.contracts.vVetAddr.length == 42){
            clauses.push(contract.send("setToken",0,config.contracts.vVetAddr,1));
        }
        if(config.contracts.vEthAddr.length == 42){
            clauses.push(contract.send("setToken",0,config.contracts.vEthAddr,2));
        }

        if(clauses.length > 0){
            const txRep: Connex.Vendor.TxResponse = await connex.vendor.sign('tx', clauses)
                .signer(wallet.list[0].address)
                .request();
            
            const receipt = await getReceipt(connex, 5, txRep.txid);
            if (receipt != null && !receipt.reverted) {
            } else {
                assert.fail("setToken faild");
            }
        }
    });
})

