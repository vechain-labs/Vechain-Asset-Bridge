// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

interface IToken {
    function name() external view returns(string memory);
    function symbol() external view returns(string memory);
    function decimals() external view returns(uint8);
    function totalSupply() external view returns(uint256);
    function balanceOf(address _owner) external view returns(uint256);
    function transfer(address _to, uint256 _amount) external returns(bool);
    function transferFrom(address _from, address _to, uint256 _amount) external returns(bool);
    function approve(address _spender, uint256 _amount) external returns(bool);
    function allowance(address _owner, address _spender) external view returns(uint256);

    event Approval(address indexed _from, address indexed _to, uint256 _amount);
    event Transfer(address indexed _from, address indexed _to, uint256 _amount);
}

contract FungibleToken is IToken{
    string public override name = "";
    string public override symbol = "";
    uint8 public override decimals = 0;
    uint256 public override totalSupply = 0;

    mapping (address => uint)                       public override balanceOf;
    mapping (address => mapping (address => uint))  public override allowance;

    constructor(string memory _name,string memory _symbol,uint8 _decimals,uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        balanceOf[msg.sender] = _totalSupply;
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
            allowance[_from][msg.sender] = allowance[_from][msg.sender] - _amount;
        }

        balanceOf[_from] = balanceOf[_from] - _amount;
        balanceOf[_to] = balanceOf[_to] + _amount;

        emit Transfer(_from, _to, _amount);
        return true;
    }

    function approve(address _spender, uint256 _amount) external override returns(bool){
        allowance[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }
}