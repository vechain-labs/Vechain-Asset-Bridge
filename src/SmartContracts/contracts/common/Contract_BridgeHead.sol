// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "./Library_SafeMath.sol";
import "./Library_Merkle.sol";
import "./Interface_Token.sol";
import "./Interface_TokenExtension.sol";

interface INativeCoin is IToken {
    function deposit() external payable;

    function withdraw(uint256 _amount) external;
}

contract BridgeHeadControl {
    address public verifier;
    address public governance;
    uint8 public reward = 0; //Range 0-1000 (0‰ - 100‰)

    mapping(address => uint8) public tokens;
    address public wrappedNativeCoin;
    bool public govLocked = false;

    uint8 public constant FREEZE = 0;
    uint8 public constant ORIGINTOKEN = 1;
    uint8 public constant WRAPPEDTOKEN = 2;

    event VerifierUpdated(address indexed _addr);
    event GovernanceUpdated(address indexed _addr);
    event TokenUpdated(address indexed _token, uint8 indexed _type);
    event GovLockChanged(bool indexed _status);
    event RewardChanged(uint256 indexed _reward);

    receive() external payable {}

    fallback() external payable {}

    function setVerifier(address _addr) external onlyGovernance {
        verifier = _addr;
        emit VerifierUpdated(_addr);
    }

    function setGovernance(address _addr) external onlyGovernance {
        governance = _addr;
        emit GovernanceUpdated(_addr);
    }

    function setToken(address _token, uint8 _type) external onlyGovernance {
        tokens[_token] = _type;
        emit TokenUpdated(_token, _type);
    }

    function setReward(uint8 _reward) external onlyGovernance {
        require(reward >= 0 && reward < 1000, "reward range is 0 to 1000");
        reward = _reward;
        emit RewardChanged(_reward);
    }

    function setWrappedNativeCoin(address _native) external onlyGovernance {
        tokens[wrappedNativeCoin] = FREEZE;
        wrappedNativeCoin = _native;
        tokens[_native] = ORIGINTOKEN;
        emit TokenUpdated(_native, ORIGINTOKEN);
    }

    function lockByGov() external onlyGovernance {
        govLocked = true;
        emit GovLockChanged(govLocked);
    }

    function unlockByGov() external onlyGovernance {
        govLocked = false;
        emit GovLockChanged(govLocked);
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "permission denied");
        _;
    }

    modifier govUnlock() {
        require(govLocked == false, "the bridge locked by governance");
        _;
    }
}

contract BridgeHead is BridgeHeadControl {
    uint256 private blockNumCache = 0;

    string public chainname;
    string public chainid;

    mapping(bytes32 => mapping(bytes32 => bool)) public claimed;
    bytes32 public merkleRoot;
    bool public locked = false;

    event Swap(
        address indexed _token,
        address indexed _from,
        address indexed _recipient,
        uint256 _amountOut,
        uint256 _reward
    );
    event Claim(
        address indexed _token,
        address indexed _recipient,
        uint256 _amount
    );
    event UpdateMerkleRoot(
        bytes32 indexed _root,
        uint256 indexed _from,
        bytes32 indexed _parentRoot
    );
    event BridgeLockChange(bytes32 indexed _root, bool indexed _status);

    constructor(string memory _chainname, string memory _chainid) {
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
        require(locked == true, "the bridge isn't lock");
        merkleRoot = _root;
        locked = false;
        emit UpdateMerkleRoot(merkleRoot, blockNumCache, _parentRoot);
        emit BridgeLockChange(_root, false);
        blockNumCache = block.number;
    }

    function lock(bytes32 _root) external onlyVerifier govUnlock {
        require(_root == merkleRoot, "merkle root invalid");
        locked = true;
        emit BridgeLockChange(_root, true);
    }

    function unlock(bytes32 _root) external onlyVerifier govUnlock {
        require(_root == merkleRoot, "last merkle root invalid");
        locked = false;
        emit BridgeLockChange(_root, false);
    }

    function swap(
        address _token,
        uint256 _amount,
        address _recipient
    ) public unLock govUnlock returns (bool) {
        require(
            tokens[_token] == ORIGINTOKEN || tokens[_token] == WRAPPEDTOKEN,
            "token not register or freeze"
        );

        if (tokens[_token] == ORIGINTOKEN) {
            swapOriginToken(_token, _amount);
        }

        if (tokens[_token] == WRAPPEDTOKEN) {
            swapWrappedToken(_token, _amount);
        }

        (uint256 amountOut, uint256 reward) = amountReward(_amount);
        emit Swap(_token, msg.sender, _recipient, amountOut, reward);
        return true;
    }

    function swapNativeCoin(address _recipient)
        external
        payable
        unLock
        govUnlock
        returns (bool)
    {
        require(
            tokens[wrappedNativeCoin] == ORIGINTOKEN,
            "token not register or freeze"
        );
        IToken token = IToken(wrappedNativeCoin);

        uint256 beforeBlance = token.balanceOf(address(this));
        INativeCoin(wrappedNativeCoin).deposit{value: msg.value}();
        uint256 afterBalance = token.balanceOf(address(this));

        require(
            SafeMath.sub(afterBalance, beforeBlance) == msg.value,
            "transfer balance check faild"
        );

        (uint256 amountOut, uint256 reward) = amountReward(msg.value);
        emit Swap(wrappedNativeCoin, msg.sender, _recipient, amountOut, reward);
        return true;
    }

    function claim(
        address _token,
        address _recipient,
        uint256 _balance,
        bytes32[] calldata _merkleProof
    ) public unLock govUnlock returns (bool) {
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

    function claimNativeCoin(
        address payable _recipient,
        uint256 _balance,
        bytes32[] calldata _merkleProof
    ) external unLock govUnlock returns (bool) {
        require(
            tokens[wrappedNativeCoin] == ORIGINTOKEN ||
                tokens[wrappedNativeCoin] == WRAPPEDTOKEN,
            "native coin not register or freeze"
        );

        bytes32 nodehash = keccak256(
            abi.encodePacked(
                chainname,
                chainid,
                _recipient,
                wrappedNativeCoin,
                _balance
            )
        );
        require(
            MerkleProof.verify(_merkleProof, merkleRoot, nodehash),
            "invalid proof"
        );

        require(!isClaim(merkleRoot, nodehash), "the swap has been claimed");

        claimNativeCoin(_recipient, _balance);

        setClaim(merkleRoot, nodehash);

        emit Claim(wrappedNativeCoin, _recipient, _balance);

        return true;
    }

    function isClaim(bytes32 _merkleroot, bytes32 nodehash)
        public
        view
        returns (bool)
    {
        return claimed[_merkleroot][nodehash];
    }

    function amountReward(uint256 _amountIn)
        public
        view
        returns (uint256, uint256)
    {
        require(_amountIn >= 1000 || reward == 0, "The amount is too little");
        uint256 amoutIn = SafeMath.mul(_amountIn, 1000);

        uint256 _amountOut = SafeMath.sub(
            amoutIn,
            SafeMath.mul(_amountIn, reward)
        );

        _amountOut = SafeMath.div(_amountOut, 1000);
        uint256 _reward = SafeMath.sub(_amountIn, _amountOut);
        return (_amountOut, _reward);
    }

    function setClaim(bytes32 _merkleroot, bytes32 nodehash) private {
        claimed[_merkleroot][nodehash] = true;
    }

    function swapOriginToken(address _token, uint256 _amount) private {
        IToken token = IToken(_token);
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
        ITokenExtension token = ITokenExtension(_token);
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

        uint256 beforeBurn = token.balanceOf(address(this));
        token.burn(_amount);
        (address(this), _amount);
        uint256 afterBurn = token.balanceOf(address(this));

        require(
            SafeMath.sub(beforeBurn, afterBurn) == _amount,
            "recovery balance check faild"
        );
    }

    function claimOrginToken(
        address _token,
        address _recipient,
        uint256 _balance
    ) private {
        IToken token = IToken(_token);

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
        ITokenExtension token = ITokenExtension(_token);

        uint256 beforemint = token.balanceOf(address(this));
        token.mint(_balance);
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

    function claimNativeCoin(address payable _recipient, uint256 _balance)
        private
    {
        INativeCoin(wrappedNativeCoin).withdraw(_balance);
        _recipient.transfer(_balance);
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier, "permission denied");
        _;
    }

    modifier unLock() {
        require(locked == false, "the bridge locked");
        _;
    }
}
