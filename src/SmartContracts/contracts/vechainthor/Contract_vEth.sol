pragma solidity >=0.5.16 <0.6.0;

import "./Interface_VIP211.sol";
import "./Library_SafeMath.sol";

contract VETH is IVIP211 {

    string public name = "VeChain Wrapped ETH";
    string public symbol = "VETH";
    uint8 public decimals = 18;

    address public bridgeContract;
    uint256 private total = 0;

    mapping (address => uint)                       public  balanceOf;
    mapping (address => mapping (address => uint))  public  allowance;

    event Approval(address indexed _from, address indexed _to, uint256 _amount);
    event Transfer(address indexed _from, address indexed _to, uint256 _amount);
    event Mint(address indexed _to, uint256 _amount);
    event Recovery(address indexed _from, uint256 _amount);

    constructor(address _addr) public {
        bridgeContract = _addr;
    }

    function totalSupply() public view returns (uint256) {
        return total;
    }

    function transfer(address _to, uint256 _amount) public returns (bool) {
        return transferFrom(msg.sender, _to, _amount);
    }

    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) public returns (bool) {
        require(balanceOf[_from] >= _amount, "insufficient balance");

        if (
            _from != msg.sender && allowance[_from][msg.sender] != uint256(-1)
        ) {
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

    function approve(address _spender, uint256 _amount) public returns (bool) {
        allowance[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    function mint(address _to, uint256 _amount)
        public
        onlyBridge
        returns (bool)
    {
        balanceOf[_to] = SafeMath.add(balanceOf[_to], _amount);
        total = SafeMath.add(total, _amount);

        emit Mint(_to, _amount);
        emit Transfer(address(this), _to, _amount);
        return true;
    }

    function recovery(address _from, uint256 _amount)
        public
        onlyBridge
        returns (bool)
    {
        require(balanceOf[_from] >= _amount, "insufficient balance");
        balanceOf[_from] = SafeMath.sub(balanceOf[_from], _amount);
        total = SafeMath.sub(total, _amount);

        emit Transfer(_from, address(this), _amount);
        emit Recovery(_from, _amount);
        return true;
    }

    modifier onlyBridge() {
        require(msg.sender == bridgeContract, "permission denied");
        _;
    }
}
