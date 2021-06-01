pragma solidity >=0.5.16 <0.6.0;

interface IERC20 {
    function name() public view returns(string);
    function symbol() public view returns(string);
    function decimals() public view returns(uint8);
    function totalSupply() public view returns(uint256);
    function balanceOf(address _owner) public view returns(uint256);
    function transfer(address _to, uint256 _amount) public returns(bool);
    function transferFrom(address _from, address _to, uint256 _amount) public returns(bool);
    function approve(address _spender, uint256 _amount) public returns(bool);
    function allowance(address _owner, address _spender) public view returns(uint256);
}