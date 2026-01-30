// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GZeroToken.sol";
import "../src/GigZeroProtocol.sol";

contract GigZeroTest is Test {
    GZeroToken public token;
    GigZeroProtocol public protocol;
    
    address public deployer = address(1);
    address public poster = address(2);
    address public worker = address(3);
    
    uint256 constant LISTENER_FEE = 10 ether;    // 10 GZERO per day
    uint256 constant DEFAULT_APP_FEE = 1 ether;  // 1 GZERO
    uint256 constant PROTOCOL_FEE_BPS = 250;     // 2.5%
    
    function setUp() public {
        vm.startPrank(deployer);
        
        token = new GZeroToken();
        protocol = new GigZeroProtocol(
            address(token),
            LISTENER_FEE,
            DEFAULT_APP_FEE,
            PROTOCOL_FEE_BPS
        );
        
        // Distribute tokens
        token.transfer(poster, 10_000 ether);
        token.transfer(worker, 1_000 ether);
        
        vm.stopPrank();
    }
    
    function testTokenDeployment() public view {
        assertEq(token.name(), "GigZero");
        assertEq(token.symbol(), "GZERO");
        assertEq(token.totalSupply(), 1_000_000_000 ether);
    }
    
    function testProtocolDeployment() public view {
        assertEq(address(protocol.gzeroToken()), address(token));
        assertEq(protocol.listenerFee(), LISTENER_FEE);
        assertEq(protocol.protocolFeeBps(), PROTOCOL_FEE_BPS);
    }
    
    function testRegisterAgent() public {
        vm.prank(poster);
        protocol.registerAgent();
        
        assertTrue(protocol.registeredAgents(poster));
        
        GigZeroProtocol.AgentProfile memory profile = protocol.getAgentProfile(poster);
        assertEq(profile.wallet, poster);
        assertEq(profile.jobsCompleted, 0);
        assertEq(profile.reputationScore, 0);
    }
    
    function testSubscribeToJobs() public {
        vm.startPrank(worker);
        protocol.registerAgent();
        
        token.approve(address(protocol), 100 ether);
        protocol.subscribeToJobs(7); // 7 days
        
        assertTrue(protocol.isSubscribed(worker));
        assertEq(protocol.listenerExpiry(worker), block.timestamp + 7 days);
        vm.stopPrank();
    }
    
    function testPostJob() public {
        vm.startPrank(poster);
        protocol.registerAgent();
        
        token.approve(address(protocol), 100 ether);
        
        string[] memory skills = new string[](1);
        skills[0] = "social";
        
        uint256 jobId = protocol.postJob(
            "Like the launch tweet",
            "Go to twitter.com/gigzero and like our pinned tweet",
            "Screenshot showing the like",
            100 ether,
            1 ether,
            block.timestamp + 1 days,
            skills
        );
        
        assertEq(jobId, 1);
        
        GigZeroProtocol.Job memory job = protocol.getJob(jobId);
        assertEq(job.poster, poster);
        assertEq(job.reward, 100 ether);
        assertEq(uint256(job.status), uint256(GigZeroProtocol.JobStatus.Open));
        
        vm.stopPrank();
    }
    
    function testFullJobFlow() public {
        // Setup poster
        vm.startPrank(poster);
        protocol.registerAgent();
        token.approve(address(protocol), 1000 ether);
        
        string[] memory skills = new string[](1);
        skills[0] = "social";
        
        uint256 jobId = protocol.postJob(
            "Like the launch tweet",
            "Like our tweet",
            "Screenshot showing like",
            100 ether,
            1 ether,
            0, // no deadline
            skills
        );
        vm.stopPrank();
        
        // Setup worker
        vm.startPrank(worker);
        protocol.registerAgent();
        token.approve(address(protocol), 100 ether);
        protocol.subscribeToJobs(1);
        
        // Apply
        protocol.applyToJob(jobId, "I can do this! I have Twitter access.");
        vm.stopPrank();
        
        // Accept applicant
        vm.prank(poster);
        protocol.acceptApplicant(jobId, worker);
        
        GigZeroProtocol.Job memory job = protocol.getJob(jobId);
        assertEq(uint256(job.status), uint256(GigZeroProtocol.JobStatus.Assigned));
        assertEq(job.assignedWorker, worker);
        
        // Submit work
        vm.prank(worker);
        protocol.submitWork(jobId, "ipfs://QmXyz123", "Liked the tweet!");
        
        job = protocol.getJob(jobId);
        assertEq(uint256(job.status), uint256(GigZeroProtocol.JobStatus.Submitted));
        
        // Approve work
        uint256 workerBalanceBefore = token.balanceOf(worker);
        
        vm.prank(poster);
        protocol.approveWork(jobId, 5); // 5-star rating
        
        job = protocol.getJob(jobId);
        assertEq(uint256(job.status), uint256(GigZeroProtocol.JobStatus.Completed));
        
        // Check payout (100 - 2.5% = 97.5)
        uint256 expectedPayout = 100 ether - (100 ether * 250 / 10000);
        assertEq(token.balanceOf(worker) - workerBalanceBefore, expectedPayout);
        
        // Check worker profile
        GigZeroProtocol.AgentProfile memory workerProfile = protocol.getAgentProfile(worker);
        assertEq(workerProfile.jobsCompleted, 1);
        assertEq(workerProfile.reputationScore, 5);
    }
    
    function testCancelJob() public {
        vm.startPrank(poster);
        protocol.registerAgent();
        token.approve(address(protocol), 100 ether);
        
        string[] memory skills = new string[](0);
        uint256 jobId = protocol.postJob("Test", "Test job", "Test", 100 ether, 0, 0, skills);
        
        uint256 balanceBefore = token.balanceOf(poster);
        protocol.cancelJob(jobId);
        
        GigZeroProtocol.Job memory job = protocol.getJob(jobId);
        assertEq(uint256(job.status), uint256(GigZeroProtocol.JobStatus.Cancelled));
        assertEq(token.balanceOf(poster), balanceBefore + 100 ether);
        
        vm.stopPrank();
    }
    
    function testRejectWork() public {
        // Setup
        vm.startPrank(poster);
        protocol.registerAgent();
        token.approve(address(protocol), 1000 ether);
        string[] memory skills = new string[](0);
        uint256 jobId = protocol.postJob("Test", "Test", "Test", 100 ether, 0, 0, skills);
        vm.stopPrank();
        
        vm.startPrank(worker);
        protocol.registerAgent();
        token.approve(address(protocol), 100 ether);
        protocol.subscribeToJobs(1);
        protocol.applyToJob(jobId, "I can do it");
        vm.stopPrank();
        
        vm.prank(poster);
        protocol.acceptApplicant(jobId, worker);
        
        vm.prank(worker);
        protocol.submitWork(jobId, "ipfs://bad", "Here it is");
        
        // Reject
        vm.prank(poster);
        protocol.rejectWork(jobId, "Not acceptable");
        
        GigZeroProtocol.Job memory job = protocol.getJob(jobId);
        assertEq(uint256(job.status), uint256(GigZeroProtocol.JobStatus.Assigned));
        
        // Worker reputation decreased
        GigZeroProtocol.AgentProfile memory workerProfile = protocol.getAgentProfile(worker);
        assertEq(workerProfile.reputationScore, -1);
    }
    
    function testGetOpenJobs() public {
        vm.startPrank(poster);
        protocol.registerAgent();
        token.approve(address(protocol), 1000 ether);
        
        string[] memory skills = new string[](0);
        protocol.postJob("Job 1", "Desc", "Criteria", 10 ether, 0, 0, skills);
        protocol.postJob("Job 2", "Desc", "Criteria", 20 ether, 0, 0, skills);
        protocol.postJob("Job 3", "Desc", "Criteria", 30 ether, 0, 0, skills);
        
        vm.stopPrank();
        
        GigZeroProtocol.Job[] memory openJobs = protocol.getOpenJobs(0, 10);
        assertEq(openJobs.length, 3);
        assertEq(openJobs[0].title, "Job 1");
        assertEq(openJobs[2].title, "Job 3");
    }
    
    function testCannotApplyWithoutSubscription() public {
        // Poster creates job
        vm.startPrank(poster);
        protocol.registerAgent();
        token.approve(address(protocol), 100 ether);
        string[] memory skills = new string[](0);
        uint256 jobId = protocol.postJob("Test", "Test", "Test", 100 ether, 0, 0, skills);
        vm.stopPrank();
        
        // Worker tries to apply without subscription
        vm.startPrank(worker);
        protocol.registerAgent();
        
        vm.expectRevert("Subscription expired");
        protocol.applyToJob(jobId, "My proposal");
        vm.stopPrank();
    }
}
