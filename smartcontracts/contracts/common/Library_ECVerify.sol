// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

library ECVerify {
    function ecrecovery(bytes32 hash, bytes memory sig) internal pure returns (address) {
    bytes32 r;
    bytes32 s;
    uint8 v;

    if (sig.length != 65) {
      return address(0);
    }

    assembly {
      r := mload(add(sig, 32))
      s := mload(add(sig, 64))
      v := and(mload(add(sig, 65)), 255)
    }

    if (v < 27) {
      v += 27;
    }

    if (v != 27 && v != 28) {
      return address(0);
    }

    return ecrecover(hash, v, r, s);
  }
}