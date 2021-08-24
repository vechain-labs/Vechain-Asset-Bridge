// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "../common/Library_ECVerify.sol";
import "../common/Library_Array.sol";

interface IV2EBridgeHead {
    function updateMerkleRoot(bytes32 _lastRoot, bytes32 _root) external;
    function lock(bytes32 _lastRoot) external;
    function unlock(bytes32 _lastRoot) external;
    function locked() external returns (bool);
}

contract BridgeVerifierControl {
    address public governance;
    address public bridge;
    mapping(address => bool) public verifiers;
    uint8 public verifierCount;

    event VerifierChanged(address indexed _verifier, bool indexed _status);
    event GovernanceUpdate(address indexed _addr);
    event BridgeUpdate(address indexed _addr);

    function setGovernance(address _addr) external onlyGovernance {
        governance = _addr;
        emit GovernanceUpdate(_addr);
    }

    function setBridge(address _addr) external onlyGovernance {
        bridge = _addr;
        emit BridgeUpdate(_addr);
    }

    function addVerifier(address _verifier) external onlyGovernance {
        if(!verifiers[_verifier]){
            verifiers[_verifier] = true;
            verifierCount++;
        }
        emit VerifierChanged(_verifier,true);
    }

    function removeVerifier(address _verifier) external onlyGovernance {
        require(verifiers[_verifier] == true, "verifier not in map");
        verifiers[_verifier] = false;
        verifierCount--;
        emit VerifierChanged(_verifier, false);
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "permission denied");
        _;
    }
}

contract V2EBridgeVerifier is BridgeVerifierControl {
    struct Proposal {
        uint8 quorum;
        bool executed;
        bytes32 value;
        bytes[] signatures;
    }

    mapping(bytes32 => Proposal) public merkleRootProposals;
    mapping(bytes32 => Proposal) public lockBridgeProposals;
    mapping(bytes32 => Proposal) public unlockBridgeProposals;

    event SubmitUpdateRoot(
        bytes32 indexed _value,
        address indexed _verifier,
        bytes _sig
    );
    event SubmitLockBridge(
        bytes32 indexed _value,
        address indexed _verifier,
        bytes _sig
    );
    event SubmitUnLockBridge(
        bytes32 indexed _value,
        address indexed _verifier,
        bytes _sig
    );
    event ExecOpertion(bytes32 indexed _hash, bytes[] _sig);

    constructor() {
        governance = msg.sender;
    }

    function updateBridgeMerkleRoot(
        bytes32 _lastRoot,
        bytes32 _root,
        bytes calldata _sig
    ) external returns(bool){
        require(
            merkleRootProposals[_root].executed == false,
            "the opertion had executed"
        );
        bytes32 msgHash = keccak256(abi.encodePacked("updateBridgeMerkleRoot",_root));
        address signer = ECVerify.ecrecovery(msgHash, _sig);
        require(verifiers[signer], "signer isn't a verifier");

        IV2EBridgeHead bri = IV2EBridgeHead(bridge);
        require(bri.locked() == true, "the bridge hadn't locked");

        if (merkleRootProposals[_root].signatures.length == 0) {
            Proposal memory _new = Proposal({
                quorum: quorum(verifierCount),
                executed: false,
                value: msgHash,
                signatures: new bytes[](0)
            });
            merkleRootProposals[_root] = _new;
        }
        Proposal storage prop = merkleRootProposals[_root];

        require(
            ArrayLib.bytesExists(prop.signatures, _sig) == false,
            "signer already submitted"
        );
        prop.signatures.push(_sig);

        emit SubmitUpdateRoot(_root, signer, _sig);

        if (merkleRootProposals[_root].signatures.length >= prop.quorum) {
            bri.updateMerkleRoot(_lastRoot, _root);
            prop.executed = true;
            emit ExecOpertion(_root, prop.signatures);
        }
        return true;
    }

    function lockBridge(bytes32 _lastRoot, bytes calldata _sig) external returns(bool) {
        require(
            lockBridgeProposals[_lastRoot].executed == false,
            "the opertion had executed"
        );
        bytes32 msgHash = keccak256(abi.encodePacked("lockBridge",_lastRoot));
        address signer = ECVerify.ecrecovery(msgHash, _sig);
        require(verifiers[signer], "signer isn't a verifier");

        IV2EBridgeHead bri = IV2EBridgeHead(bridge);
        require(bri.locked() == false, "the bridge had locked");

        if (lockBridgeProposals[_lastRoot].signatures.length == 0) {
            Proposal memory _new = Proposal({
                quorum: quorum(verifierCount),
                executed: false,
                value: msgHash,
                signatures: new bytes[](0)
            });
            lockBridgeProposals[_lastRoot] = _new;
        }

        Proposal storage prop = lockBridgeProposals[_lastRoot];
        require(
            ArrayLib.bytesExists(prop.signatures, _sig) == false,
            "signer already submitted"
        );
        prop.signatures.push(_sig);

        emit SubmitLockBridge(_lastRoot, signer, _sig);

        if (prop.signatures.length >= prop.quorum) {
            bri.lock(_lastRoot);
            prop.executed = true;
            emit ExecOpertion(_lastRoot, prop.signatures);
        }
        return true;
    }

    function unlockBridge(bytes32 _lastRoot, bytes calldata _sig) external returns(bool){
        require(
            unlockBridgeProposals[_lastRoot].executed == false,
            "the opertion had executed"
        );
        bytes32 msgHash = keccak256(abi.encodePacked("unlockBridge",_lastRoot));
        address signer = ECVerify.ecrecovery(msgHash, _sig);
        require(verifiers[signer], "signer isn't a verifier");

        IV2EBridgeHead bri = IV2EBridgeHead(bridge);
        require(bri.locked() == true, "the bridge no lock");

        if (unlockBridgeProposals[_lastRoot].signatures.length == 0) {
            Proposal memory _new = Proposal({
                quorum: quorum(verifierCount),
                executed: false,
                value: msgHash,
                signatures: new bytes[](0)
            });
            unlockBridgeProposals[_lastRoot] = _new;
        }

        Proposal storage prop = unlockBridgeProposals[_lastRoot];
        require(
            ArrayLib.bytesExists(prop.signatures, _sig) == false,
            "signer already submitted"
        );
        prop.signatures.push(_sig);

        emit SubmitUnLockBridge(_lastRoot, signer, _sig);

        if (prop.signatures.length >= prop.quorum) {
            bri.unlock(_lastRoot);
            prop.executed = true;
            emit ExecOpertion(_lastRoot, prop.signatures);
        }
        return true;
    }

    function getMerkleRootProposal(bytes32 _hash)
        external
        view
        returns (Proposal memory)
    {
        return merkleRootProposals[_hash];
    }

    function getLockBridgeProposals(bytes32 _hash)
        external
        view
        returns (Proposal memory)
    {
        return lockBridgeProposals[_hash];
    }

    function getUnLockBridgeProposals(bytes32 _hash) external view returns(Proposal memory) {
        return unlockBridgeProposals[_hash];
    }

    function quorum(uint8 total) internal pure returns (uint8) {
        return uint8(((uint256(total) + 1) * 2) / 3);
    }
}
