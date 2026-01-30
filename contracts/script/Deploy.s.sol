// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GZeroToken.sol";
import "../src/GigZeroProtocol.sol";

contract DeployScript is Script {
    // Protocol parameters
    uint256 constant LISTENER_FEE = 10 ether;    // 10 GZERO per day
    uint256 constant DEFAULT_APP_FEE = 1 ether;  // 1 GZERO
    uint256 constant PROTOCOL_FEE_BPS = 250;     // 2.5%

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy token
        GZeroToken token = new GZeroToken();
        console.log("GZeroToken deployed at:", address(token));
        
        // Deploy protocol
        GigZeroProtocol protocol = new GigZeroProtocol(
            address(token),
            LISTENER_FEE,
            DEFAULT_APP_FEE,
            PROTOCOL_FEE_BPS
        );
        console.log("GigZeroProtocol deployed at:", address(protocol));
        
        vm.stopBroadcast();
        
        // Log deployment info
        console.log("\n=== Deployment Summary ===");
        console.log("Network: Base Sepolia");
        console.log("Token: %s", address(token));
        console.log("Protocol: %s", address(protocol));
        console.log("Listener Fee: %s GZERO/day", LISTENER_FEE / 1 ether);
        console.log("Protocol Fee: %s bps", PROTOCOL_FEE_BPS);
    }
}
