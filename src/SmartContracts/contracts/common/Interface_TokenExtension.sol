// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "./Interface_Token.sol";

interface ITokenExtension is IToken{
    function mint(uint256 _amount) external returns(bool);
    function burn(uint256 _amount) external returns(bool);

    event Mint(uint256 _amount);
    event Burn(uint256 _amount);
}