pragma solidity >=0.5.16 <0.6.0;

import "./Interface_ERC20.sol";
import "./Interface_VIP211.sol";
import "./Library_SafeMath.sol";
import "./Library_Merkle.sol";

contract BridgeHeadControl {
    string public chainname;
    string public chainid;
    address public verifier;
    address public governance;
    mapping(address => uint8) public tokens;
    bool public govLock = false;

    event VerifierUpdate(address indexed _addr);
    event GovernanceUpdate(address indexed _addr);
    event TokenUpdate(address indexed _token, uint8 indexed _type);
    event GovLockChange(bool indexed _status);

    function setVerifier(address _addr) external onlyGovernance {
        verifier = _addr;
        emit VerifierUpdate(_addr);
    }

    function setGovernance(address _addr) external onlyGovernance {
        governance = _addr;
        emit GovernanceUpdate(_addr);
    }

    function setToken(address _token, uint8 _type) external onlyGovernance {
        tokens[_token] = _type;
        emit TokenUpdate(_token, _type);
    }

    function lockByGov() external onlyGovernance {
        govLock = true;
        emit GovLockChange(true);
    }

    function unlockByGov() external onlyGovernance {
        govLock = false;
        emit GovLockChange(false);
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "permission denied");
        _;
    }

    modifier govUnlock() {
        require(govLock == false, "the bridge locked by governance");
        _;
    }
}

contract E2VBridgeHead is BridgeHeadControl {
    string public constant name = "Ethereum To VeChainThor bridge head";
    uint256 private blockNumCache = 0;

    uint8 public constant FREEZE = 0;
    uint8 public constant ORIGINTOKEN = 1;
    uint8 public constant WRAPPEDTOKEN = 2;

    mapping(bytes32 => mapping(bytes32 => bool)) public claimed;
    bytes32 public merkleRoot;

    event Swap(
        address indexed _token,
        address indexed _from,
        address indexed _recipient,
        uint256 _amount
    );
    event Claim(
        address indexed _token,
        address indexed _recipient,
        uint256 _amount
    );
    event UpdateMerkleRoot(
        bytes32 indexed _root,
        uint256 indexed _from,
        bytes32 _parentRoot
    );
    event BridgeLockChange(bytes32 indexed _root, bool indexed _status);

    bool public locked = false;

    constructor(string memory _chainname, string memory _chainid)
        public
    {
        chainname = _chainname;
        chainid = _chainid;
        governance = msg.sender;
        blockNumCache = block.number;
    }

    function updateMerkleRoot(bytes32 _parentRoot, bytes32 _root)
        external
        onlyVerifier
        govUnlock
    {
        require(_parentRoot == merkleRoot, "parent merkle root invalid");
        require(locked != false, "the bridge isn't lock");
        merkleRoot = _root;
        locked = false;
        emit UpdateMerkleRoot(merkleRoot, blockNumCache, _parentRoot);
        emit BridgeLockChange(_parentRoot, false);
        blockNumCache = block.number;
    }

    function lock(bytes32 _root) external onlyVerifier govUnlock {
        require(_root == merkleRoot, " merkle root invalid");
        locked = true;
        emit BridgeLockChange(_root, true);
    }

    function unlock(bytes32 _root) external onlyVerifier govUnlock {
        require(_root == merkleRoot, "merkle root invalid");
        locked = false;
        emit BridgeLockChange(_root, false);
    }

    function swap(
        address _token,
        uint256 _amount,
        address _recipient
    ) external unLock govUnlock returns (bool) {
        require(
            tokens[_token] == ORIGINTOKEN || tokens[_token] == WRAPPEDTOKEN,
            "token not register or freeze"
        );

        if(tokens[_token] == ORIGINTOKEN){
            swapOriginToken(_token,_amount);
        }

        if(tokens[_token] == WRAPPEDTOKEN){
            swapWrappedToken(_token, _amount);
        }

        emit Swap(_token, msg.sender, _recipient, _amount);
        return true;
    }

    function claim(
        address _token,
        address _recipient,
        uint256 _balance,
        bytes32[] calldata _merkleProof
    ) external unLock govUnlock returns (bool) {
        require(
            tokens[_token] == ORIGINTOKEN || tokens[_token] == WRAPPEDTOKEN,
            "token not register or freeze"
        );

        bytes32 nodehash = keccak256(
            abi.encodePacked(chainname, chainid, _recipient, _token, _balance)
        );
        require(
            MerkleProof.verify(_merkleProof, merkleRoot, nodehash),
            "invalid proof"
        );

        require(!isClaim(merkleRoot, nodehash), "the swap has been claimed");

        if (tokens[_token] == ORIGINTOKEN) {
            claimOrginToken(_token, _recipient, _balance);
        }

        if (tokens[_token] == WRAPPEDTOKEN) {
            claimWrappedToken(_token, _recipient, _balance);
        }

        setClaim(merkleRoot, nodehash);
        emit Claim(_token, _recipient, _balance);

        return true;
    }

    function isClaim(bytes32 _merkleroot, bytes32 nodehash)
        public
        view
        returns (bool)
    {
        return claimed[_merkleroot][nodehash];
    }

    function setClaim(bytes32 _merkleroot, bytes32 nodehash) private {
        claimed[_merkleroot][nodehash] = true;
    }

    function swapOriginToken(address _token, uint256 _amount) private {
        IERC20 token = IERC20(_token);
        require(token.balanceOf(msg.sender) >= _amount, "insufficient balance");

        require(
            token.allowance(msg.sender, address(this)) >= _amount,
            "insufficient allowance"
        );

        uint256 beforeBlance = token.balanceOf(address(this));
        token.transferFrom(msg.sender, address(this), _amount);
        uint256 afterBalance = token.balanceOf(address(this));
        require(
            SafeMath.sub(afterBalance, beforeBlance) == _amount,
            "transfer balance check faild"
        );
    }

    function swapWrappedToken(address _token, uint256 _amount) private {
        IVIP211 token = IVIP211(_token);
        require(token.balanceOf(msg.sender) >= _amount, "insufficient balance");

        require(
            token.allowance(msg.sender, address(this)) >= _amount,
            "insufficient allowance"
        );

        uint256 beforeBalance = token.balanceOf(address(this));
        token.transferFrom(msg.sender, address(this), _amount);
        uint256 afterBalance = token.balanceOf(address(this));
        require(
            SafeMath.sub(afterBalance, beforeBalance) == _amount,
            "transferFrom balance check faild"
        );

        uint256 beforeRecovery = token.balanceOf(address(this));
        token.recovery(address(this), _amount);
        uint256 afterRecovery = token.balanceOf(address(this));

        require(
            SafeMath.sub(beforeRecovery, afterRecovery) == _amount,
            "recovery balance check faild"
        );
    }

    function claimOrginToken(
        address _token,
        address _recipient,
        uint256 _balance
    ) private {
        IERC20 token = IERC20(_token);

        uint256 beforeBalance = token.balanceOf(address(this));
        token.transfer(_recipient, _balance);
        uint256 afterBalance = token.balanceOf(address(this));

        require(
            SafeMath.sub(beforeBalance, afterBalance) == _balance,
            "transfer balance check faild"
        );
    }

    function claimWrappedToken(
        address _token,
        address _recipient,
        uint256 _balance
    ) private {
        IVIP211 token = IVIP211(_token);

        uint256 beforemint = token.balanceOf(address(this));
        token.mint(address(this), _balance);
        uint256 aftermint = token.balanceOf(address(this));
        require(
            SafeMath.sub(aftermint, beforemint) == _balance,
            "mint balance check faild"
        );

        uint256 beforeBalance = token.balanceOf(address(this));
        token.transfer(_recipient, _balance);
        uint256 afterBalance = token.balanceOf(address(this));
        require(
            SafeMath.sub(beforeBalance, afterBalance) == _balance,
            "transfer balance check faild"
        );
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier, "permission denied");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "permission denied");
        _;
    }

    modifier unLock() {
        require(locked == false, "the bridge locked");
        _;
    }
}
