pragma solidity >=0.5.16 <0.6.0;

interface IVIP180 {
    function name() external view returns(string memory);
    function symbol() external view returns(string memory);
    function decimals() external view returns(uint8);
    function totalSupply() external view returns(uint256);
    function balanceOf(address _owner) external view returns(uint256);
    function transfer(address _to, uint256 _amount) external returns(bool);
    function transferFrom(address _from, address _to, uint256 _amount) external returns(bool);
    function approve(address _spender, uint256 _amount) external returns(bool);
    function allowance(address _owner, address _spender) external view returns(uint256);
}