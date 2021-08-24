// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "./Interface_TokenExtension.sol";
import "./Library_SafeMath.sol";

contract BridgeWrappedToken is ITokenExtension{

    string public override name = "";
    string public override symbol = "";
    uint8 public override decimals = 0;
    uint256 public override totalSupply = 0;

    mapping (address => uint)                       public override balanceOf;
    mapping (address => mapping (address => uint))  public override allowance;

    address public bridge;

    constructor(string memory _name,string memory _symbol,uint8 _decimals,address _bridge) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        bridge = _bridge;
    }

    function transfer(address _to, uint256 _amount) external override returns(bool){
        return transferFrom(msg.sender,_to,_amount);
    }

    function transferFrom(address _from, address _to, uint256 _amount) public override returns(bool){
        require(balanceOf[_from] >= _amount, "insufficient balance");

        if(_from != msg.sender && allowance[_from][msg.sender] != uint256(0)){
            require(
                allowance[_from][msg.sender] >= _amount,
                "insufficient allowance"
            );
            allowance[_from][msg.sender] = SafeMath.sub(allowance[_from][msg.sender], _amount);
        }

        balanceOf[_from] = SafeMath.sub(balanceOf[_from], _amount);
        balanceOf[_to] = SafeMath.add(balanceOf[_to], _amount);

        emit Transfer(_from, _to, _amount);
        return true;
    }

    function approve(address _spender, uint256 _amount) external override returns(bool){
        allowance[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    function mint(uint256 _amount) external override onlyBridge returns(bool){
        balanceOf[msg.sender] = SafeMath.add(balanceOf[msg.sender], _amount);
        totalSupply = SafeMath.add(totalSupply, _amount);
        emit Mint(_amount);
        emit Transfer(address(this),msg.sender,_amount);
        return true;
    }

    function burn(uint256 _amount) external override onlyBridge returns(bool){
        require(balanceOf[msg.sender] >= _amount, "insufficient balance");
        require(totalSupply >= _amount, "insufficient total balance");
        balanceOf[msg.sender] = SafeMath.sub(balanceOf[msg.sender], _amount);
        totalSupply = SafeMath.sub(totalSupply, _amount);
        emit Transfer(msg.sender,address(this),_amount);
        emit Burn(_amount);
        return true;
    }

    modifier onlyBridge() {
        require(msg.sender == bridge, "permission denied");
        _;
    }
}