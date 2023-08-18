# Vechain-Asset-Bridge

[![](https://badgen.net/badge/status/Alpha/red)]()

> : The version only use on `test environment`. `Don't deploy or use` this on any production environment or any blockchain main network!

## 1. Overview

VeChain Asset Bridge is an asset cross-chain bridge built on VeChain, and an asset cross-chain bridge that can transfer fungible tokens between blockchains that support EVM. Since different blockchains cannot directly conduct cross-chain transactions and information exchange, the cross-chain bridge introduces verification nodes under the chain to collect and exchange information on cross-chain transactions of assets through verification nodes. At the same time, in order to solve the security problem during cross-chain information exchange, the cross-chain bridge adopts a decentralized method, and multiple verification nodes can be added to the cross-chain bridge. Each verification node verifies the cross-chain transaction data and submits it to the smart contract. Only when the transaction is verified by 2/3 of the verification nodes, the transaction is recognized and executed by the cross-chain bridge.

## 2. Technology

### 2.1 Structure

- Validator Node

Validation nodes connect the two blockchains. The cross-chain bridge can be composed of multiple verification nodes, and each verification node needs to register its own address in the smart contract of the cross-chain bridge before participating in the verification of the cross-chain bridge. Every once in a while, the verification node will collect cross-chain transactions on the two chains during the period, and construct the transaction into a MerkleTree according to certain rules, and submit the Merkleroot signature to the smart contract of the cross-chain bridge. Each verification node will independently calculate and submit the Merkleroot. When more than 2/3 of the verification nodes have signed and submitted the Merkleroot, the Merkleroot will be considered valid and will be synchronized to another blockchain by the verification node .

- API Service

The API service is composed of the API service and the background service. The API service is used to provide an interface for the application, and the background service is used to regularly collect information about cross-chain transactions from the two blockchains. Since the data is all obtained from the blockchain, the API service can be deployed in a distributed manner.

- Front

The front-end page of the cross-chain bridge provides users with a friendly page for operating the cross-chain bridge, supporting [Vechain Sync](https://sync.vecha.in/) wallet and [MetaMask](https://metamask.io /) The wallet operates directly. The front-end page will obtain the required data from the API and the blockchain and provide it to the user. When users need to conduct cross-chain transactions, users can send or receive tokens through the wallet.

### 2.2 Smart contracts

![Contracts](https://www.plantuml.com/plantuml/png/SoWkIImgoStCIybDBE3ILd0BSIhAJ4bFvTBMLe2mdFEBW3mWDopLEICnCmyg79QOavcIM99V19PpBSb8BKejpSMGrDM56ncIdvsQLmmK0GgLvgLd9kL0X1GqmZm332qCz5s3d8qCDC4A_19BCijIqPM5kOReXxk6U83LGAqABqeiA4XDmMgIGsfU2jHh0000)

- [BridgeCore.sol](/validationnode/src/common/contracts/common/Contract_BridgeCore.sol)
- [VeChainBridgeValidator.sol](/validationnode/src/common/contracts/vechain/Contract_VeChainBridgeValidator.sol)
- [EthereumBridgeValidator.sol](/validationnode/src/common/contracts/ethereum/Contract_EthereumBridgeValidator.sol)
- [FTBridge.sol](/validationnode/src/common/contracts/common/Contract_FTBridge.sol)
- [FTBRidgeTokens.sol](/validationnode/src/common/contracts/common/Contract_FTBridgeTokens.sol)
- [FTBridgeControl.sol](/validationnode/src/common/contracts/common/Contract_FTBridgeControl.sol)
- [FungibleToken.sol](/validationnode/src/common/contracts/common/Contract_FungibleToken.sol)
- [NativeFungibleToken.sol](/validationnode/src/common/contracts/common/Contract_NativeFungibleToken.sol)
- [BridgeWrappedToken.sol](/validationnode/src/common/contracts/common/Contract_BridgeWrappedToken.sol)

### 2.3 Validator Node

The cross-chain bridge provides cross-chain verification services by multiple verification nodes, and each verification node needs to submit its own address to the `verification contract` on the two chains. Each verification node collects and generates cross-chain transaction information snapshots on the two blockchains according to the rules, generates the corresponding `Merkletree`, and signs the `Merkleroot` and sends it to VeChain’s verification contract `VeChainBridgeValidator` through the transaction. After more than 2/3 of the verification nodes submit the same `Merkleroot`, the `Merkleroot` will be submitted to the `BridgeCore` contract as verified data, and will be synchronized to the Ethereum verification contract `EthereumBridgeValidator`, Complete the data synchronization of cross-chain transactions on the two chains. Subsequent cross-chain assets can be withdrawn by submitting `Merkleproof` information corresponding to cross-chain transactions on different chains.

### 2.3.1 Verification process

- Register as a validator

1. The verification node program is located in the `validationnode` directory under the root directory of the project. Please refer to [README.md](./validationnode/README.md) to configure and run the verification node.
2. After the verification node is deployed, the `governance` of the verification contract needs to register the address corresponding to the node's private key to the verification contract on the two chains.

- Synchronize blockchains

1. Synchronize the block of VeChain.
2. Synchronize the block of Ethereum.
3. Synchronize the registration of the verification nodes.
4. Synchronize the snapshot information of cross-chain transactions. The snapshot information includes `ChainName`, `ChainId` of the two chains, the block height range included in the snapshot, and the `Submithash` event generated by the `BridgeCore` contract included in the height range. information, and the `Merkleroot` generated from the snapshot. During synchronization, the verification node will calculate the `Merkleroot` corresponding to the snapshot locally based on the information, and check whether the local and on-chain `Merkleroot` are consistent.

- Collect cross-chain transactions to generate Merkletree

At intervals of a certain block height (the current default is 200 VeChain blocks), the verification node will collect cross-chain transaction information within the interval and generate Merkleroot according to the rules.

1. Obtain the information of the last snapshot in the contract, and determine the snapshot block range of the two blockchains.
2. Get information about the `Submithash` event within the block scope.
3. Generate `Merkletree` according to the following rules

    -  Generate `snapshootHash` of snapshot basic information based on snapshot range.

    ``` javascript
   let chains = [
            {
                chainName:this.config.vechain.chainName,
                chainId:this.config.vechain.chainId,
                beginBlockNum:range.vechain.beginBlockNum,
                endBlockNum:range.vechain.endBlockNum
            },
            {
                chainName:this.config.ethereum.chainName,
                chainId:this.config.ethereum.chainId,
                beginBlockNum:range.ethereum.beginBlockNum,
                endBlockNum:range.ethereum.endBlockNum
            }
        ]

    public static snapshootEncodePacked(chains:ChainInfo[]):Buffer {
        let sorted = chains.sort((l,r) => {
            if(l.chainName.toLocaleLowerCase() != r.chainName.toLocaleLowerCase()){
                return l.chainName > r.chainName ? 1 : -1 ;
            } else {
                return l.chainId >= r.chainId ? 1 : -1 ;
            }
        });

        let encode:Buffer = Buffer.alloc(0);
        sorted.forEach(chain => {
            let chainBuff = Buffer.concat([
                Buffer.from(chain.chainName),
                Buffer.from(chain.chainId),
                Buffer.from(BigInt(chain.beginBlockNum).toString(16),'hex'),
                Buffer.from(BigInt(chain.endBlockNum).toString(16),'hex'),
            ]);
            encode = Buffer.concat([chainBuff]);
        });

        return encode;
    }

    public static snapshootHash(chains:ChainInfo[]):string {
        return '0x' + keccak256(BridgeStorage.snapshootEncodePacked(chains)).toString('hex');
    }

    ```

   - According to `chainName`, `chainId`, `appid`, `hash` in `Submithash`, use keccak256 to generate `HashEventID`

    ``` javascript
    export function hashEventId(ev:HashEvent):string {
        let encode = Buffer.concat([
            Buffer.from(ev.chainName.toLowerCase()),
            Buffer.from(ev.chainId.toLowerCase()),
            Buffer.from(ev.appid.toLowerCase()),
            Buffer.from(ev.hash.toLowerCase())
        ]); 
        return '0x' + keccak256(encode).toString('hex');
    }
    ```

   - Generate an array of `HashEventID` included in the snapshot range in ascending order

    ``` javascript
    const sorted:Array<HashEvent> = events.sort((l,r) => {
                return BigInt(l.hash) > BigInt(r.hash) ? 1 : -1;
            });
    ```

    - Add `snapshootHash` and `HashEventID` arrays to merkletree to generate `Merkletree` and `Merkleroot`

    ``` javascript
    public buildTree(appid:string,newSnapshoot:BridgeSnapshoot,events:HashEvent[]):TreeNode {
        this.tree = MerkleTree.createNewTree();
        const sorted:Array<HashEvent> = events.sort((l,r) => {
            return BigInt(l.hash) > BigInt(r.hash) ? 1 : -1;
        });
        
        let infoHash = BridgeStorage.snapshootHash(newSnapshoot.chains);
        this.tree.addHash(infoHash);

        sorted.forEach(event => {
            this.tree.addHash(BridgeStorage.leaf(appid,event.hash));
        });

        this.merkleRootNode = this.tree.buildTree();
        return this.merkleRootNode;
    }
    
    this.merkleRootNode = this.tree.buildTree();
    const merkleroot = merkleRootNode.getMerkleRoot();
    ```

- Submit Merkleroot to VeChain's verification contract

1. The verification node will first check whether the verification contract `VeChainBridgeValidator` already contains the `Merkleroot` submitted by the node. If the node has already submitted it, the node will wait for other nodes to complete the verification. If the node has not submitted, the node will use the private key to sign `Merkleroot` and submit the complete signature to `VeChainBridgeValidator`.
2. The `VeChainBridgeValidator` contract contains the addresses of all registered verification nodes. When a verification node submits `Merkleroot`, the contract will use the `ecrecovery` method to obtain the address of the signer to ensure that the submitted `Merkleroot` is registered Verified node signed and submitted.
3. When the `Merkleroot` is voted by 2/3 of the checked nodes, the `VeChainBridgeValidator` contract submits the `Merkleroot` to the `BridgeCore` contract. Nodes will wait for a certain block height to ensure that the voting operation will not be rolled back due to block forks.

- Synchronize Merkleroot to Ethereum's verification contract

1. When the `Merkleroot` in the `BridgeCore` contract is confirmed by the block and ensures that the operation will not be rolled back, the verification node will randomly select one of the nodes according to the rules, and the node needs to synchronize the `Merkleroot` to the ` in the EthereumBridgeValidator` contract.
2. The selected node obtains the voted `Merkleroot` from the `VeChainBridgeValidator` contract, and at the same time obtains the signature information of each verification node.
3. The node initiates an Ethereum transaction, and sends the `Merkleroot` and signature list to the `EthereumBridgeValidator` contract of Ethereum.
4. The `EthereumBridgeValidator` contract contains the addresses of all registered verification nodes. After the node submits the information, the contract will use the `ecrecovery` method to obtain the address of the signer for each signature information, ensuring that all the signature information submitted is valid.
5. When all the signature information is verified and has exceeded 2/3 of the total number of verification nodes, the `Merkleroot` is confirmed to be valid and submitted to the `BridgeCore` contract of Ethereum.
6. The node will wait for a certain block height to ensure that the voting operation will not be rolled back due to the block fork, and the cross-chain operation is completed.
### 2.4 Asset cross-chain transaction

### 2.4.1 Register cross-chain assets

Before conducting cross-chain transactions of non-fungible tokens, the issuer or applicant needs to meet the following conditions.

1. Cross-chain assets need to comply with the VIP180/ERC20.
2. Tokens are stable and do not reduce the amount of assets held by holders over time.
3. The issuer or submitter needs to complete the contract development and testing work of another chain and complete the deployment.
4. The contract on the other chain needs to conform to the [Interface_TokenExtension.sol](./validationnode/src/common/contracts/common/Interface_TokenExtension.sol) standard, and authorize the `FTBridge` contract to perform `Mint` and `Burn` operations.
5. After completing the above work, you need to submit the application and related contract information to `governance` of the cross-chain bridge, and `governance` is responsible for registering the relevant information into the contract.

Each Token needs to be registered in the `FTBridge` contract of the two chains, and the following information is included in the registration.

- tokenType

The token types are `ORIGINTOKEN` and `WRAPPEDTOKEN` respectively. `ORIGINTOKEN` tokenizes specific native assets such as VET on VeChain and ETH on Ethereum. When registering native assets, a corresponding contract needs to be developed on the native chain, and the native assets should be packaged as assets that comply with VIP180 or ERC20, such as VVET or WETH. And call the `setWrappedNativeCoin` method in the `FTBRidgeTokens` contract to register. Other VIP180 or ERC20 belong to `WRAPPEDTOKEN`.

- tToken

The target contract address after cross-chain, such as the contract address of WVET corresponding to VET on Ethereum, or the contract address of VETH corresponding to ETH on VeChain.

- tChainname 和 tChainId

The name and ID of the corresponding target blockchain after cross-chain to prevent cross-chain attacks.

- begin

The starting block height of the cross-chain transaction, before the height is reached, the cross-chain contract will actively reject the cross-chain transaction for this asset.

- end

The termination block height of the cross-chain transaction. After the height is reached, the cross-chain contract will actively reject the cross-chain transaction for this asset. The default value is 0, i.e. no end block height is set.

- reward

The cross-chain transaction fee is determined by `governance` after negotiation with the asset issuer, and the default is 0 handling fee. If a handling fee ratio is set, when a cross-chain transaction is initiated, the contract will deduct the set handling fee from the amount of cross-chain assets submitted by the initiator, and the deducted amount is the amount of assets that the receiver can receive. The deducted assets will be held by the [FTBridge.sol](./docs/contracts/Contract_BridgeCore.md) contract.

### 2.4.2 Cross-chain transaction process

![Sender_Process](https://www.plantuml.com/plantuml/png/XP0n2iCm34Ltdy8Nw0Kwb910wDIbsOlYg8b9B1bPJgzVauwjwIJulFyGlqaAeZbiveuqeTZJnNPCAk3qqMUQ_RZXm2kIFLk8KNZ7d-ZGYfzcB5HwGRGinxs1-XqxzcGgrega19IUABrmCDz0fUKMT6iB6v33FwrFrB4SB-SnUBr2Mao3D9KvtW00)

1. If the initiator initiates a cross-chain transaction of `ORIGINTOKEN` type assets, it can call the `swapNativeCoin` method in the `FTBridge` contract, input the address of the recipient of the asset on another chain, and set the cross-chain transaction in the `value` of the transaction. The number of tokens for chain transactions.

2. If the initiator initiates a cross-chain transaction of `WRAPPEDTOKEN` type assets, it needs to call the `approve` method of the corresponding token first to authorize the `FTBridge` contract to operate on the token. Then call the `swap` method in the `FTBridge` contract, enter the contract address corresponding to the token, the number of tokens that need to be cross-chained, and the address of the asset recipient on another chain.

3. The `FTBridge` contract calls the `transferFrom` method of the token contract to transfer tokens to `FTBridge` and check the balance.

4. After confirming that the balance is correct, the `FTBridge` contract generates the corresponding Hash and then calls the `BridgeCore` method to submit.

5. After the cross-chain transaction is sent, wait for the verification node to generate a snapshot and synchronize.

![Receiver_Process](https://www.plantuml.com/plantuml/png/SoWkIImgAStDuNBEISpC3QdmByfCpynJqBLJS0pmZ7TFBV5DBShEIIqeoizFKx1II2hAJ4bF3QdmJE72b0VfGZ46g24N8HsVcPUMZscFMuWJs52WucIGd49-4OJXbrYIMPRgd9-PnmLJ0r8Vb9gS2XGl0geFJirB2SddSW1IG2y00000)

6. After the verification node is synchronized, the receiver first calculates BridgeTxId based on the transaction information of the initiator. Then call `/merkleproof` in the Bridge API service to get the information needed to receive assets.

``` javascript
export function bridgeTxId(tx:BaseBridgeTx):string {
    let buff = Buffer.concat([
        Buffer.from(tx.chainName),
        Buffer.from(tx.chainId),
        Buffer.from(tx.blockId.substring(2),'hex'),
        Buffer.from(tx.txid.substring(2),'hex'),
        Buffer.from(BigInt(tx.index).toString(16),'hex'),
    ]);
    return '0x' + keccak256(buff).toString('hex');
}
```

7. Call the `FTBridge` contract on the blockchain that receives the asset. If the asset of type `ORIGINTOKEN` is received, call `claimNativeCoin` method, pass in the parameter information obtained from the API, and receive the corresponding asset after sending the transaction. If the asset of type `WRAPPEDTOKEN` is received, call the `claim` method, pass in the parameter information obtained from the API, and receive the corresponding asset after sending the transaction. The `_recipient` parameter in the method needs to be consistent with the address of the recipient passed in by the transaction initiator, and has nothing to do with the address of the initiator receiving the asset transaction.

## Disclaimer

Redistributions of source code must retain this list of conditions and the following disclaimer.

Neither the name of VeChain (VeChain Foundation) nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.