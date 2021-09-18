import * as Devkit from 'thor-devkit'
import { Transaction } from 'thor-devkit';
export module ThorDevKitEx{
    export function calculateIDWithUnsigned(txBody:Devkit.Transaction.Body,origin:string):string{
        let tx = new Transaction(txBody);
        let txid =  "0x" + tx.signingHash(origin).toString('hex');
        return txid;
    }

    export function decodeTxRaw(raw:string):Devkit.Transaction{
        let tx;
        if(raw.substr(0,2).toLocaleLowerCase() == "0x"){
            raw = raw.substr(2).toLocaleLowerCase();
        }

        try {
            tx = Devkit.Transaction.decode(Buffer.from(raw,"hex"));
        } catch (error) {
            try {
                tx = Devkit.Transaction.decode(Buffer.from(raw,"hex"),true);
            } catch (error) {
                throw error;
            }
        }
        return tx;
    }

    export function getBlockRef(blockid:string):string{
        blockid = blockid.toLowerCase();
        if(blockid.startsWith("0x") && blockid.length == 66){
            return blockid.substring(0,18);
        }
        return "";
    }

    export function getBlockNum(blockRef:string):number{
        blockRef = blockRef.toLocaleLowerCase();
        if(blockRef.startsWith("0x") && blockRef.length == 18){
            return parseInt(blockRef.substring(0,10),16); 
        }
        return 0;
    }

    export function Bytes32ToAddress(data:string):string{
        return '0x' + BigInt(data).toString(16).padStart(40,'0');
    }
}