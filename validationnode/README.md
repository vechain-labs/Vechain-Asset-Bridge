VeChain Asset Bridge Validator Node
==============

### Getting the source

- Clone the repo

``` shell
    git clone https://github.com/mongelly/Vechain-Asset-Bridge.git
    cd Vechain-Asset-Bridge/validationnode
```


### Building

- Building Docker

``` shell
    docker build ./ -t vechain/asset-bridge-validatornode:latest
```

### Docker

``` sh
    docker run -d\
    -v {path-to-data-directory}:/data\
    -v {path-to-config-directory}:/config\
    vechain/asset-bridge-validatornode:latest
```

- `path-to-data-directory` directory for data.
- `path-to-config-directory` directory for config, the `config.json` in the directory. The `node master key` save in `config/.config/node.key`.


### ValidtorNode Config Example

``` Json
{
    "appid":"0x33cf902a9699da29f36cc8fc6284b34871f20ad5383804bfbdc7a8032265cb38",
    "packstep":200,
    "vechain": {
      "nodeHost": "http://47.57.94.244:8680",
        "chainName": "vechain",
        "chainId": "0xf6",
        "startBlockNum": 10201,
        "confirmHeight": 12,
        "expiration": 180,
        "contracts": {
            "bridgeCore": "0xceb97b5843c81cb9ea4088488dd81bc1a18c739f",
            "bridgeValidator": "0x1e6ad0211d968e9bd96eac5b9b0acb0de4457ff8",
            "ftBridge": "0x10849efb7bb74d5276abec08e33af0f6086dac44"
        }
    },
    "ethereum": {
      "nodeHost": "http://47.57.94.244:28545",
        "chainName": "ethereum",
        "chainId": "1337",
        "startBlockNum": 3433,
        "confirmHeight": 3,
        "expiration": 24,
        "contracts": {
            "bridgeCore": "0xe1115c43990061d59c80DDeAb83a276005BC23ec",
            "bridgeValidator": "0x3735E8Ab0618212BbDaB6Dc18263edF654cD320F",
            "ftBridge": "0x852F8620Bc97937327FC152F343ABE77a1361ad2"
        }
    }
}
```
