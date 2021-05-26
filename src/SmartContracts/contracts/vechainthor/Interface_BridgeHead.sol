pragma solidity >=0.5.16 <0.6.0;

interface IBridgeHead {
    function name() external view returns(string memory);
    function swap(address _token,uint256 _amount,address _to) external returns(bool);
    function claim(address _token,address _to,uint256 _balance,bytes32[] calldata _merkleProof) external returns(bool);
}