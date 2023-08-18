# Contract_BridgeCore.sol

[Contract_BridgeCore.sol](../../validationnode/src/common/contracts/common/Contract_BridgeCore.sol)

## Overview

BridgeCore is the core contract of the vechain bridge, which is used to manage the Hash submitted by the DApp in the cross-chain bridge to the cross-chain bridge. The MerkleRoot submitted by the verification node will also be submitted to this contract, and the MerkleProof verification method will be provided.

## Methods

- master

``` javascript
function master() public view returns(address)
```

The Owner of BridgeCore is used to manage the DApp registration information in the contract and can lock the contract.

- governance

``` javascript
function governance() public view returns(address)
```

The governance of BridgeCore is used to manage the DApp registration information in the contract, and can lock the contract, with the same authority as the master. Governance contracts can be bound to governance for daily management of Bridge.

- validator

``` javascript
function validator() public view returns(address)
```

BridgeCore's verification contract address, Merkleroot Hash can only be submitted through the verification contract. The validator contract of VeChain [Contract_VeChainBridgeValidator](./Contract_VeChainBridgeValidator.md). The validator contract of Ethereum[Contract_EthereumBridgeValidator](./Contract_EthereumBridgeValidator.md).

- rootList

``` javascript
function rootList(uint256 _index) public view returns(bytes32)
```

Merkleroot list, which stores the Merkleroot submitted by the verification contract.

- rootInfo

``` javascript

struct RootInfo {
    uint256 index;
    bytes args;
}

function rootInfo(bytes32 _root) public view returns(memory RootInfo)

```

Store the information of MerkleRoot, including index and additional parameter information of MerkleRoot submitted by DApp.

- addAppid

``` javascript
function addAppid(bytes32 _newid,address _admin)
```

Register Appid, only master or governance can register. You can add an administrator address for Appid when registering.

- updateAdmin

``` javascript
function updateAdmin(bytes32 _appid, address _admin)
```

Update the administrator address of Appid, only the master, governance or current administrator can call this method.

- addContract

``` javascript
function addContract(bytes32 _appid, address _addr) 
```
Add contract address for Appid, one Appid can add multiple contract addresses. Only registered contract address can call submitHash method. Appid administrators can add contract addresses.

- delContract

``` javascript
function delContract(bytes32 _appid, address _addr)
```

Delete the contract address for Appid, the Appid administrator can delete the contract address.

- submitHash

``` javascript
function submitHash(bytes32 _appid, bytes32 _hash)
```

To submit the hash, only the address that has registered Appid and the address has been registered in the contract can submit the hash. After submitHash is emit, the SubmitHash event will be generated. The verification nodes will collect these events for building MerkleTree.

- updateMerkleRoot

``` javascript
function updateMerkleRoot(bytes32 _root, bytes calldata _args)
```

Submit the MerkleRoot that has been voted by the verification contract. This method is only allowed to be called by the verification contract. Custom parameters can be added when submitting the MerkleRoot.