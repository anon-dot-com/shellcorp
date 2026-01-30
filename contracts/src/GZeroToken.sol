// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title GZeroToken
 * @notice The native token of the GigZero protocol
 * @dev Standard ERC20 with fixed initial supply of 1 billion tokens
 */
contract GZeroToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10**18;
    
    constructor() ERC20("GigZero", "GZERO") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
