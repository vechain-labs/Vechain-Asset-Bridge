pragma solidity >=0.5.16 <0.6.0;

library ArrayLib {

    function addressExist(address[] memory array,address target) internal pure returns(bool) {
        for(uint8 i = 0; i < array.length; i++){
            if(array[i] == target){
                return true;
            }
        }
        return false;
    }

    function bytes32Exists(bytes32[] memory array,bytes32 target) internal pure returns(bool) {
        for(uint8 i = 0; i < array.length; i++){
            if(array[i] == target){
                return true;
            }
        }
        return false;
    }

    function bytesExists(bytes[] memory array,bytes memory target) internal pure returns(bool) {
        for(uint8 i = 0; i < array.length; i++){
            if(keccak256(array[i]) == keccak256(target)){
                return true;
            }
        }
        return false;
    }
}