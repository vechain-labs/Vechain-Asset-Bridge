# Asset Bridge Dapp

## Contract

### VET

- balance

``` javascript
// Connex
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
const balance = (await (this.connex.thor.account(`${address}`).get())).balance;
```

### ETH

- balance

``` javascript
// Web3js
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
const balance = await this.web3.eth.getBalance(`${address}`);
```

### VIP180 Token

- balanceOf

``` javascript
// Connex
const balanceOfABI = {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
const vip180Token = this.connex.thor.account(`${tokenAddr}`);

const balanceOfMed = vip180Token.method(balanceOfABI);
const balanceOf = BigInt((await balanceOfMed.call(address)).decoded[0]);
```

- allowance

``` javascript
// Connex
const allowanceABI = {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const vip180Token = this.connex.thor.account(`${tokenAddr}`);

const allowanceMed = vip180Token.method(allowanceABI);
const allowance = BigInt((await allowanceMed.call(address,bridgeAddr)).decoded[0]);
```

- approve

``` javascript
// Connex
const approveABI = {
    "inputs": [
      {
        "internalType": "address",
        "name": "guy",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const vip180Token = this.connex.thor.account(`${tokenAddr}`);

const approveMed = vip180Token.method(approveABI);
const clause = approveMed.asClause(bridgeAddr,1000000000);

this.connex.vendor.sign("tx",[clause])
    .signer(address)
    .request();
```

### ERC20 Token

- balanceOf

``` javascript
// Web3js
const balanceOfABI = {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }

const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";

const ERC20Token = new this.web3.eth.Contract(balanceOfABI);
const balanceOf = BigInt(await ERC20Token.methods.balanceOf(address).call());

```

- allowance

``` javascript
// Web3js
const allowanceABI = {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }

const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";

const ERC20Token = new this.web3.eth.Contract(allowanceABI);
const balanceOf = BigInt(await ERC20Token.methods.allowance(address,bridgeAddr).call());

```

- approve

``` javascript
// Web3js
const approveABI = {
    "inputs": [
      {
        "internalType": "address",
        "name": "guy",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const address = "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const ERC20Token = new this.web3.eth.Contract(approveABI);

const receipt = await ERC20Token.methods.approve(bridgeAddr,10000000).send({
  from:address
});

```

### BridgeHead (VeChain)

- govLocked

``` javascript
// Connex
const govLockedABI = {
      "inputs": [],
      "name": "govLocked",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const bridgeHead = this.connex.thor.account(`${bridgeAddr}`);

const lockedMed = bridgeHead.method(govLockedABI);
const govLocked = Boolean((await lockedMed.call()).decoded[0]);
```


- locked

``` javascript
// Connex
const lockedABI = {
      "inputs": [],
      "name": "locked",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const bridgeHead = this.connex.thor.account(`${bridgeAddr}`);

const lockedMed = bridgeHead.method(lockedABI);
const locked = Boolean((await lockedMed.call()).decoded[0]);
```

- swap

``` javascript
// Connex
const swapABI = {
      "inputs": [
        {
          "internalType": "address",
          "name": "_token",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_amount",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "_recipient",
          "type": "address"
        }
      ],
      "name": "swap",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    }
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const receiptAddr = "0x0F872421Dc479F3c11eDd89512731814D0598dB5";

const bridgeHead = this.connex.thor.account(`${bridgeAddr}`);
const swapMed = bridgeHead.method(swapABI);
const clause = swapMed.asClause(tokenAddr,100000,receiptAddr);

this.connex.vendor.sign("tx",[clause])
    .signer(address)
    .request();
```

- swapNativeCoin

``` javascript
// Connex
const swapNativeCoinABI = {
      "inputs": [
        {
          "internalType": "address",
          "name": "_recipient",
          "type": "address"
        }
      ],
      "name": "swapNativeCoin",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "payable",
      "type": "function"
    }
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const receiptAddr = "0x0F872421Dc479F3c11eDd89512731814D0598dB5";

const bridgeHead = this.connex.thor.account(`${bridgeAddr}`);
const swapNativeCoinMed = bridgeHead.method(swapNativeCoinABI);
const clause = swapNativeCoinMed.asClause(receiptAddr);
clause.value = 100000;

this.connex.vendor.sign("tx",[clause])
    .signer(address)
    .request();
```

- claim

``` javascript
// Connex
const claimABI = {
      "inputs": [
        {
          "internalType": "address",
          "name": "_token",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_recipient",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_balance",
          "type": "uint256"
        },
        {
          "internalType": "bytes32[]",
          "name": "_merkleProof",
          "type": "bytes32[]"
        }
      ],
      "name": "claim",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    }
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const tokenAddr = "0xec6e34afbb2ce1f6d815975dae4bbf0664a2fe86";
const receiptAddr = "0x0F872421Dc479F3c11eDd89512731814D0598dB5";
const merkleproof = [
  "0xc19b68889888fb3d9cede800f5f50a69dc64071620902f4338c9e50d2c1c8bc1"
  "0x1053d436a4e95d5fed121c670cfaf57ce63bd0e9c5eea1eec1c5f5dba3a5fc76"]

const bridgeHead = this.connex.thor.account(`${bridgeAddr}`);
const swapMed = bridgeHead.method(claimABI);
const clause = swapMed.asClause(tokenAddr,receiptAddr,1000000,merkleproof);

this.connex.vendor.sign("tx",[clause])
    .signer(receiptAddr)
    .request();
```

- claimNativeCoin

``` javascript
// Connex
const claimNativeCoinABI = {
      "inputs": [
        {
          "internalType": "address payable",
          "name": "_recipient",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "_balance",
          "type": "uint256"
        },
        {
          "internalType": "bytes32[]",
          "name": "_merkleProof",
          "type": "bytes32[]"
        }
      ],
      "name": "claimNativeCoin",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    }
const bridgeAddr = "0x6a3644435cd49900216ed654099e12b5f6009ed8";
const receiptAddr = "0x0F872421Dc479F3c11eDd89512731814D0598dB5";
const merkleproof = [
  "0xc19b68889888fb3d9cede800f5f50a69dc64071620902f4338c9e50d2c1c8bc1"
  "0x1053d436a4e95d5fed121c670cfaf57ce63bd0e9c5eea1eec1c5f5dba3a5fc76"]

const bridgeHead = this.connex.thor.account(`${bridgeAddr}`);
const swapMed = bridgeHead.method(claimNativeCoinABI);
const clause = swapMed.asClause(receiptAddr,1000000,merkleproof);

this.connex.vendor.sign("tx",[clause])
    .signer(receiptAddr)
    .request();
```

## dApp

### Swap(VIP180/ERC20)

  1. 检查vechain和ethereum上的bridge合约的状态
     - 检查bridge合约govLocked状态，govLocked为false才能进行操作,为true时提示用户合约正在维护。
     - 检查bridge合约locked状态，locked为false才能进行操作,为true时提示用户合约正在进行快照。

  2. 用户选择并登录的钱包，Sync2或MetaMask。
  3. 用户选择对应需要跨链的交易对，如 VVET -> WVET。
  4. 用户输入需要跨链转移的金额，调用token合约的balanceOf检查余额是否足够。
  5. 用户输入或从钱包进行验证得到跨链后另一条链上接收token的钱包地址。
  6. 用户点击swap，调用token合约allowance,参数为用户钱包地址和bridge合约地址。
      - 如返回的allowance金额小于用户输入的金额，则需要用户进行approve操作，approve的金额 = 用户输入的金额 - allowance金额。构造approve交易调用钱包签名后发送。交易发送成功后重新检查allowance金额。
      - 如返回的allowance金额大于等于用户输入的金额，则跳过approve操作。

  7. 检查allowance,allowance金额大于等于用户输入的金额后，允许用户进行swap操作。
  8. 用户点击swap，构造swap交易，参数为用户选择的token地址，需要跨链的金额，另一条链上的接收地址。

### Swap(VET/ETH)

  1. 检查vechain和ethereum上的bridge合约的状态
     - 检查bridge合约govLocked状态，govLocked为false才能进行操作,为true时提示用户合约正在维护。
     - 检查bridge合约locked状态，locked为false才能进行操作,为true时提示用户合约正在进行快照。

  2. 用户选择并登录的钱包，Sync2或MetaMask。
  3. 用户选择对应需要跨链的交易对，如 VET -> wVET
  4. 用户输入需要跨链转移的金额，检查用户的钱包余额
  5. 用户输入或从钱包进行验证得到跨链后另一条链上接收token的钱包地址。
  6. 用户点击swap，调用bridge合约的swapNativeCoin方法，构造swapNativeCoin交易，参数为需要接收的合约地址，并在交易中加入用户需要跨链对应的数额（VET或ETH）。

### Claim(VIP180/ERC20)

  1. 检查vechain和ethereum上的bridge合约的状态
     - 检查bridge合约govLocked状态，govLocked为false才能进行操作,为true时提示用户合约正在维护。
     - 检查bridge合约locked状态，locked为false才能进行操作,为true时提示用户合约正在进行快照。

  2. 用户选择并登录的钱包，Sync2或MetaMask。
  3. 从API服务中获取Claim列表。
  4. 选择需要Claim的token,从API中获取对应的merkleproof。
  5. 构造Claim交易,参数为选择的接收的token合约的地址,接收地址，金额，merkleproof。

### claimNativeCoin(VET/ETH)

  1. 检查vechain和ethereum上的bridge合约的状态
     - 检查bridge合约govLocked状态，govLocked为false才能进行操作,为true时提示用户合约正在维护。
     - 检查bridge合约locked状态，locked为false才能进行操作,为true时提示用户合约正在进行快照。

  2. 用户选择并登录的钱包，Sync2或MetaMask。
  3. 从API服务中获取Claim列表。
  4. 选择VET或ETH,从API中获取对应的merkleproof。
  5. 构造Claim交易,参数为接收地址，金额，merkleproof。