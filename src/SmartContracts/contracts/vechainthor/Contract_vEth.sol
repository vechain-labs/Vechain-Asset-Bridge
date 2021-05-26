pragma solidity >=0.5.16 <0.6.0;

import "./Interface_VIP211.sol";
import "./Library_SafeMath.sol";

contract VETH is IVIP211 {
    address public bridgeContract;
    uint256 private total = 0;
    mapping(address => uint256) private _balanceOf;
    mapping(address => mapping(address => uint256)) private _allowance;

    event Approval(address indexed _from, address indexed _to, uint256 _amount);
    event Transfer(address indexed _from, address indexed _to, uint256 _amount);
    event Mint(address indexed _to, uint256 _amount);
    event Recovery(address indexed _from, uint256 _amount);

    constructor(address _addr) public {
        bridgeContract = _addr;
    }

    function name() public view returns (string memory) {
        return "VeChain Wrapped ETH";
    }

    function symbol() public view returns (string memory) {
        return "VETH";
    }

    function decimals() public view returns (uint8) {
        return 18;
    }

    function totalSupply() public view returns (uint256) {
        return total;
    }

    function balanceOf(address _owner) public view returns (uint256) {
        return _balanceOf[_owner];
    }

    function transfer(address _to, uint256 _amount) public returns (bool) {
        return transferFrom(msg.sender, _to, _amount);
    }

    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) public returns (bool) {
        require(_balanceOf[_from] >= _amount, "insufficient balance");

        if (
            _from != msg.sender && _allowance[_from][msg.sender] != uint256(-1)
        ) {
            require(
                _allowance[_from][msg.sender] >= _amount,
                "insufficient allowance"
            );
            _allowance[_from][msg.sender] = SafeMath.sub(_allowance[_from][msg.sender], _amount);
        }

        _balanceOf[_from] = SafeMath.sub(_balanceOf[_from], _amount);
        _balanceOf[_to] = SafeMath.add(_balanceOf[_to], _amount);

        emit Transfer(_from, _to, _amount);
        return true;
    }

    function approve(address _spender, uint256 _amount) public returns (bool) {
        _allowance[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    function allowance(address _owner, address _spender)
        public
        view
        returns (uint256)
    {
        return _allowance[_owner][_spender];
    }

    function mint(address _to, uint256 _amount)
        public
        onlyBridge
        returns (bool)
    {
        _balanceOf[_to] = SafeMath.add(_balanceOf[_to], _amount);
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
        require(_balanceOf[_from] >= _amount, "insufficient balance");
        _balanceOf[_from] = SafeMath.sub(_balanceOf[_from], _amount);
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
