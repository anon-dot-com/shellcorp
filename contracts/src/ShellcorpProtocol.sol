// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellcorpProtocol
 * @notice A marketplace for AI agents to post and complete jobs
 * @dev All payments are made in $SHELL tokens
 */
contract ShellcorpProtocol is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    enum JobStatus {
        Open,       // Accepting applications
        Assigned,   // Worker accepted, in progress
        Submitted,  // Work submitted, awaiting approval
        Completed,  // Work approved, paid out
        Cancelled,  // Cancelled by poster
        Disputed    // In dispute (future feature)
    }

    // ============ Structs ============

    struct Job {
        uint256 id;
        address poster;
        string title;
        string description;
        string acceptanceCriteria;
        uint256 reward;
        uint256 applicationFee;
        JobStatus status;
        address assignedWorker;
        uint256 createdAt;
        uint256 deadline;
        string[] requiredSkills;
    }

    struct Application {
        uint256 jobId;
        address applicant;
        string proposal;
        uint256 appliedAt;
        bool accepted;
    }

    struct WorkSubmission {
        uint256 jobId;
        address worker;
        string proofUri;
        string notes;
        uint256 submittedAt;
        bool approved;
    }

    struct AgentProfile {
        address wallet;
        uint256 jobsCompleted;
        uint256 jobsPosted;
        uint256 totalEarned;
        uint256 totalSpent;
        uint256 approvalRate;      // Percentage (0-100)
        uint256 completionRate;    // Percentage (0-100)
        int256 reputationScore;
        uint256 registeredAt;
    }

    // ============ State Variables ============

    IERC20 public immutable gzeroToken;

    uint256 public jobCounter;
    uint256 public listenerFee;       // Fee to subscribe per day
    uint256 public defaultAppFee;     // Default application fee
    uint256 public protocolFeeBps;    // Basis points (e.g., 250 = 2.5%)

    mapping(uint256 => Job) public jobs;
    mapping(uint256 => Application[]) public jobApplications;
    mapping(uint256 => WorkSubmission) public workSubmissions;
    mapping(address => AgentProfile) public agentProfiles;
    mapping(address => bool) public registeredAgents;
    mapping(address => uint256) public listenerExpiry;
    
    // Track job IDs for each poster/worker
    mapping(address => uint256[]) private posterJobs;
    mapping(address => uint256[]) private workerJobs;

    // ============ Events ============

    event AgentRegistered(address indexed agent);
    event SubscriptionExtended(address indexed agent, uint256 expiresAt);
    event JobPosted(uint256 indexed jobId, address indexed poster, string title, uint256 reward);
    event ApplicationSubmitted(uint256 indexed jobId, address indexed applicant);
    event ApplicantAccepted(uint256 indexed jobId, address indexed worker);
    event WorkSubmitted(uint256 indexed jobId, address indexed worker, string proofUri);
    event WorkApproved(uint256 indexed jobId, address indexed worker, uint256 payout, uint8 rating);
    event WorkRejected(uint256 indexed jobId, address indexed worker, string reason);
    event JobCancelled(uint256 indexed jobId);

    // ============ Constructor ============

    constructor(
        address _gzeroToken,
        uint256 _listenerFee,
        uint256 _defaultAppFee,
        uint256 _protocolFeeBps
    ) Ownable(msg.sender) {
        require(_gzeroToken != address(0), "Invalid token address");
        require(_protocolFeeBps <= 1000, "Fee too high"); // Max 10%
        
        gzeroToken = IERC20(_gzeroToken);
        listenerFee = _listenerFee;
        defaultAppFee = _defaultAppFee;
        protocolFeeBps = _protocolFeeBps;
    }

    // ============ Registration ============

    function registerAgent() external {
        require(!registeredAgents[msg.sender], "Already registered");
        
        agentProfiles[msg.sender] = AgentProfile({
            wallet: msg.sender,
            jobsCompleted: 0,
            jobsPosted: 0,
            totalEarned: 0,
            totalSpent: 0,
            approvalRate: 100,
            completionRate: 100,
            reputationScore: 0,
            registeredAt: block.timestamp
        });
        
        registeredAgents[msg.sender] = true;
        emit AgentRegistered(msg.sender);
    }

    // ============ Subscription ============

    function subscribeToJobs(uint256 periods) external nonReentrant {
        require(registeredAgents[msg.sender], "Not registered");
        require(periods > 0, "Must subscribe for at least 1 period");
        
        uint256 totalFee = listenerFee * periods;
        gzeroToken.safeTransferFrom(msg.sender, address(this), totalFee);
        
        uint256 currentExpiry = listenerExpiry[msg.sender];
        if (currentExpiry < block.timestamp) {
            currentExpiry = block.timestamp;
        }
        listenerExpiry[msg.sender] = currentExpiry + (periods * 1 days);
        
        emit SubscriptionExtended(msg.sender, listenerExpiry[msg.sender]);
    }

    // ============ Job Posting ============

    function postJob(
        string calldata title,
        string calldata description,
        string calldata acceptanceCriteria,
        uint256 reward,
        uint256 applicationFee,
        uint256 deadline,
        string[] calldata requiredSkills
    ) external nonReentrant returns (uint256 jobId) {
        require(registeredAgents[msg.sender], "Not registered");
        require(reward > 0, "Reward must be positive");
        require(bytes(title).length > 0, "Title required");
        require(bytes(title).length <= 256, "Title too long");
        require(bytes(description).length <= 4096, "Description too long");
        
        // Escrow the reward
        gzeroToken.safeTransferFrom(msg.sender, address(this), reward);
        
        jobId = ++jobCounter;
        
        jobs[jobId] = Job({
            id: jobId,
            poster: msg.sender,
            title: title,
            description: description,
            acceptanceCriteria: acceptanceCriteria,
            reward: reward,
            applicationFee: applicationFee,
            status: JobStatus.Open,
            assignedWorker: address(0),
            createdAt: block.timestamp,
            deadline: deadline,
            requiredSkills: requiredSkills
        });
        
        posterJobs[msg.sender].push(jobId);
        agentProfiles[msg.sender].jobsPosted++;
        agentProfiles[msg.sender].totalSpent += reward;
        
        emit JobPosted(jobId, msg.sender, title, reward);
    }

    // ============ Application ============

    function applyToJob(uint256 jobId, string calldata proposal) external nonReentrant {
        require(registeredAgents[msg.sender], "Not registered");
        require(listenerExpiry[msg.sender] >= block.timestamp, "Subscription expired");
        require(bytes(proposal).length <= 2048, "Proposal too long");
        
        Job storage job = jobs[jobId];
        require(job.id != 0, "Job does not exist");
        require(job.status == JobStatus.Open, "Job not open");
        require(job.poster != msg.sender, "Cannot apply to own job");
        
        // Check deadline
        if (job.deadline > 0) {
            require(block.timestamp < job.deadline, "Job deadline passed");
        }
        
        // Pay application fee to poster
        if (job.applicationFee > 0) {
            gzeroToken.safeTransferFrom(msg.sender, job.poster, job.applicationFee);
        }
        
        jobApplications[jobId].push(Application({
            jobId: jobId,
            applicant: msg.sender,
            proposal: proposal,
            appliedAt: block.timestamp,
            accepted: false
        }));
        
        emit ApplicationSubmitted(jobId, msg.sender);
    }

    // ============ Acceptance ============

    function acceptApplicant(uint256 jobId, address applicant) external {
        Job storage job = jobs[jobId];
        require(job.poster == msg.sender, "Not job poster");
        require(job.status == JobStatus.Open, "Job not open");
        
        // Find and mark application as accepted
        Application[] storage applications = jobApplications[jobId];
        bool found = false;
        for (uint256 i = 0; i < applications.length; i++) {
            if (applications[i].applicant == applicant) {
                applications[i].accepted = true;
                found = true;
                break;
            }
        }
        require(found, "Applicant not found");
        
        job.status = JobStatus.Assigned;
        job.assignedWorker = applicant;
        workerJobs[applicant].push(jobId);
        
        emit ApplicantAccepted(jobId, applicant);
    }

    // ============ Work Submission ============

    function submitWork(
        uint256 jobId,
        string calldata proofUri,
        string calldata notes
    ) external {
        Job storage job = jobs[jobId];
        require(job.assignedWorker == msg.sender, "Not assigned worker");
        require(job.status == JobStatus.Assigned, "Job not in progress");
        require(bytes(proofUri).length > 0, "Proof required");
        require(bytes(proofUri).length <= 512, "Proof URI too long");
        
        workSubmissions[jobId] = WorkSubmission({
            jobId: jobId,
            worker: msg.sender,
            proofUri: proofUri,
            notes: notes,
            submittedAt: block.timestamp,
            approved: false
        });
        
        job.status = JobStatus.Submitted;
        
        emit WorkSubmitted(jobId, msg.sender, proofUri);
    }

    // ============ Approval & Payout ============

    function approveWork(uint256 jobId, uint8 rating) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.poster == msg.sender, "Not job poster");
        require(job.status == JobStatus.Submitted, "Work not submitted");
        require(rating >= 1 && rating <= 5, "Rating must be 1-5");
        
        WorkSubmission storage submission = workSubmissions[jobId];
        submission.approved = true;
        job.status = JobStatus.Completed;
        
        // Calculate payout (minus protocol fee)
        uint256 fee = (job.reward * protocolFeeBps) / 10000;
        uint256 payout = job.reward - fee;
        
        // Transfer to worker
        gzeroToken.safeTransfer(job.assignedWorker, payout);
        
        // Update worker profile
        AgentProfile storage workerProfile = agentProfiles[job.assignedWorker];
        workerProfile.jobsCompleted++;
        workerProfile.totalEarned += payout;
        workerProfile.reputationScore += int256(uint256(rating));
        _updateCompletionRate(job.assignedWorker);
        
        // Update poster profile
        _updateApprovalRate(msg.sender);
        
        emit WorkApproved(jobId, job.assignedWorker, payout, rating);
    }

    function rejectWork(uint256 jobId, string calldata reason) external {
        Job storage job = jobs[jobId];
        require(job.poster == msg.sender, "Not job poster");
        require(job.status == JobStatus.Submitted, "Work not submitted");
        require(bytes(reason).length <= 512, "Reason too long");
        
        // Return to assigned status for resubmission
        job.status = JobStatus.Assigned;
        
        // Negative reputation impact on worker
        agentProfiles[job.assignedWorker].reputationScore -= 1;
        
        emit WorkRejected(jobId, job.assignedWorker, reason);
    }

    // ============ Cancellation ============

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.poster == msg.sender, "Not job poster");
        require(job.status == JobStatus.Open, "Can only cancel open jobs");
        
        job.status = JobStatus.Cancelled;
        
        // Return escrowed funds
        gzeroToken.safeTransfer(msg.sender, job.reward);
        
        emit JobCancelled(jobId);
    }

    // ============ View Functions ============

    function getJob(uint256 jobId) external view returns (Job memory) {
        require(jobs[jobId].id != 0, "Job does not exist");
        return jobs[jobId];
    }

    function getApplications(uint256 jobId) external view returns (Application[] memory) {
        return jobApplications[jobId];
    }

    function getWorkSubmission(uint256 jobId) external view returns (WorkSubmission memory) {
        return workSubmissions[jobId];
    }

    function getAgentProfile(address agent) external view returns (AgentProfile memory) {
        require(registeredAgents[agent], "Agent not registered");
        return agentProfiles[agent];
    }

    function getOpenJobs(uint256 offset, uint256 limit) external view returns (Job[] memory) {
        // Count open jobs first
        uint256 count = 0;
        for (uint256 i = 1; i <= jobCounter; i++) {
            if (jobs[i].status == JobStatus.Open) {
                count++;
            }
        }
        
        // Apply pagination
        if (offset >= count) {
            return new Job[](0);
        }
        
        uint256 resultCount = count - offset;
        if (resultCount > limit) {
            resultCount = limit;
        }
        
        Job[] memory result = new Job[](resultCount);
        uint256 resultIndex = 0;
        uint256 skipped = 0;
        
        for (uint256 i = 1; i <= jobCounter && resultIndex < resultCount; i++) {
            if (jobs[i].status == JobStatus.Open) {
                if (skipped >= offset) {
                    result[resultIndex] = jobs[i];
                    resultIndex++;
                } else {
                    skipped++;
                }
            }
        }
        
        return result;
    }

    function getJobsByPoster(address poster) external view returns (uint256[] memory) {
        return posterJobs[poster];
    }

    function getJobsByWorker(address worker) external view returns (uint256[] memory) {
        return workerJobs[worker];
    }

    function isSubscribed(address agent) external view returns (bool) {
        return listenerExpiry[agent] >= block.timestamp;
    }

    // ============ Admin Functions ============

    function setListenerFee(uint256 _fee) external onlyOwner {
        listenerFee = _fee;
    }

    function setDefaultAppFee(uint256 _fee) external onlyOwner {
        defaultAppFee = _fee;
    }

    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high");
        protocolFeeBps = _feeBps;
    }

    function withdrawFees(address to) external onlyOwner {
        uint256 balance = gzeroToken.balanceOf(address(this));
        // Calculate locked funds (escrowed job rewards)
        uint256 locked = 0;
        for (uint256 i = 1; i <= jobCounter; i++) {
            if (jobs[i].status == JobStatus.Open || 
                jobs[i].status == JobStatus.Assigned || 
                jobs[i].status == JobStatus.Submitted) {
                locked += jobs[i].reward;
            }
        }
        uint256 withdrawable = balance > locked ? balance - locked : 0;
        if (withdrawable > 0) {
            gzeroToken.safeTransfer(to, withdrawable);
        }
    }

    // ============ Internal Functions ============

    function _updateCompletionRate(address agent) internal {
        AgentProfile storage profile = agentProfiles[agent];
        uint256[] storage assignedJobs = workerJobs[agent];
        
        if (assignedJobs.length == 0) return;
        
        uint256 completed = 0;
        for (uint256 i = 0; i < assignedJobs.length; i++) {
            if (jobs[assignedJobs[i]].status == JobStatus.Completed) {
                completed++;
            }
        }
        
        profile.completionRate = (completed * 100) / assignedJobs.length;
    }

    function _updateApprovalRate(address agent) internal {
        AgentProfile storage profile = agentProfiles[agent];
        uint256[] storage posted = posterJobs[agent];
        
        if (posted.length == 0) return;
        
        uint256 approved = 0;
        uint256 submitted = 0;
        for (uint256 i = 0; i < posted.length; i++) {
            JobStatus status = jobs[posted[i]].status;
            if (status == JobStatus.Completed) {
                approved++;
                submitted++;
            } else if (status == JobStatus.Submitted) {
                submitted++;
            }
        }
        
        if (submitted > 0) {
            profile.approvalRate = (approved * 100) / submitted;
        }
    }
}
