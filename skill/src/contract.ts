import { ethers, Contract, formatEther, parseEther, Wallet, HDNodeWallet } from 'ethers';
import { loadConfig } from './config';
import { getConnectedWallet } from './wallet';
import { Job, Application, WorkSubmission, AgentProfile, JobStatus } from './types';

// ABI fragments for the functions we need
const TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const PROTOCOL_ABI = [
  'function registerAgent() external',
  'function subscribeToJobs(uint256 periods) external',
  'function postJob(string title, string description, string acceptanceCriteria, uint256 reward, uint256 applicationFee, uint256 deadline, string[] requiredSkills) external returns (uint256)',
  'function applyToJob(uint256 jobId, string proposal) external',
  'function acceptApplicant(uint256 jobId, address applicant) external',
  'function submitWork(uint256 jobId, string proofUri, string notes) external',
  'function approveWork(uint256 jobId, uint8 rating) external',
  'function rejectWork(uint256 jobId, string reason) external',
  'function cancelJob(uint256 jobId) external',
  'function getJob(uint256 jobId) view returns (tuple(uint256 id, address poster, string title, string description, string acceptanceCriteria, uint256 reward, uint256 applicationFee, uint8 status, address assignedWorker, uint256 createdAt, uint256 deadline, string[] requiredSkills))',
  'function getApplications(uint256 jobId) view returns (tuple(uint256 jobId, address applicant, string proposal, uint256 appliedAt, bool accepted)[])',
  'function getWorkSubmission(uint256 jobId) view returns (tuple(uint256 jobId, address worker, string proofUri, string notes, uint256 submittedAt, bool approved))',
  'function getAgentProfile(address agent) view returns (tuple(address wallet, uint256 jobsCompleted, uint256 jobsPosted, uint256 totalEarned, uint256 totalSpent, uint256 approvalRate, uint256 completionRate, int256 reputationScore, uint256 registeredAt))',
  'function getOpenJobs(uint256 offset, uint256 limit) view returns (tuple(uint256 id, address poster, string title, string description, string acceptanceCriteria, uint256 reward, uint256 applicationFee, uint8 status, address assignedWorker, uint256 createdAt, uint256 deadline, string[] requiredSkills)[])',
  'function registeredAgents(address) view returns (bool)',
  'function listenerExpiry(address) view returns (uint256)',
  'function isSubscribed(address agent) view returns (bool)',
  'function listenerFee() view returns (uint256)',
  'function jobCounter() view returns (uint256)',
];

export class GigZeroClient {
  private wallet: Wallet | HDNodeWallet;
  private token: Contract;
  private protocol: Contract;
  private config: ReturnType<typeof loadConfig>;

  constructor() {
    this.config = loadConfig();
    
    if (!this.config.tokenAddress || !this.config.protocolAddress) {
      throw new Error('Contract addresses not configured. Run gigzero setup first.');
    }
    
    this.wallet = getConnectedWallet(this.config.rpcUrl);
    this.token = new ethers.Contract(this.config.tokenAddress, TOKEN_ABI, this.wallet);
    this.protocol = new ethers.Contract(this.config.protocolAddress, PROTOCOL_ABI, this.wallet);
  }

  get address(): string {
    return this.wallet.address;
  }

  // ============ Read Functions ============

  async getBalance(): Promise<string> {
    const balance = await this.token.balanceOf(this.wallet.address);
    return formatEther(balance);
  }

  async getEthBalance(): Promise<string> {
    const balance = await this.wallet.provider!.getBalance(this.wallet.address);
    return formatEther(balance);
  }

  async isRegistered(): Promise<boolean> {
    return this.protocol.registeredAgents(this.wallet.address);
  }

  async isSubscribed(): Promise<boolean> {
    return this.protocol.isSubscribed(this.wallet.address);
  }

  async getSubscriptionExpiry(): Promise<Date | null> {
    const expiry = await this.protocol.listenerExpiry(this.wallet.address);
    if (expiry === 0n) return null;
    return new Date(Number(expiry) * 1000);
  }

  async getListenerFee(): Promise<string> {
    const fee = await this.protocol.listenerFee();
    return formatEther(fee);
  }

  async getProfile(): Promise<AgentProfile | null> {
    try {
      const profile = await this.protocol.getAgentProfile(this.wallet.address);
      return {
        wallet: profile.wallet,
        jobsCompleted: profile.jobsCompleted,
        jobsPosted: profile.jobsPosted,
        totalEarned: profile.totalEarned,
        totalSpent: profile.totalSpent,
        approvalRate: profile.approvalRate,
        completionRate: profile.completionRate,
        reputationScore: profile.reputationScore,
        registeredAt: profile.registeredAt,
      };
    } catch {
      return null;
    }
  }

  async getOpenJobs(offset = 0, limit = 20): Promise<Job[]> {
    const jobs = await this.protocol.getOpenJobs(offset, limit);
    return jobs.map(this.parseJob);
  }

  async getJob(jobId: number): Promise<Job> {
    const job = await this.protocol.getJob(jobId);
    return this.parseJob(job);
  }

  async getApplications(jobId: number): Promise<Application[]> {
    const apps = await this.protocol.getApplications(jobId);
    return apps.map((app: any) => ({
      jobId: app.jobId,
      applicant: app.applicant,
      proposal: app.proposal,
      appliedAt: app.appliedAt,
      accepted: app.accepted,
    }));
  }

  async getWorkSubmission(jobId: number): Promise<WorkSubmission | null> {
    try {
      const sub = await this.protocol.getWorkSubmission(jobId);
      if (sub.jobId === 0n) return null;
      return {
        jobId: sub.jobId,
        worker: sub.worker,
        proofUri: sub.proofUri,
        notes: sub.notes,
        submittedAt: sub.submittedAt,
        approved: sub.approved,
      };
    } catch {
      return null;
    }
  }

  // ============ Write Functions ============

  async ensureApproval(amount: bigint): Promise<void> {
    const allowance = await this.token.allowance(this.wallet.address, this.config.protocolAddress);
    if (allowance < amount) {
      console.log('[GigZero] Approving token spend...');
      const tx = await this.token.approve(this.config.protocolAddress, ethers.MaxUint256);
      await tx.wait();
      console.log('[GigZero] Approval confirmed');
    }
  }

  async register(): Promise<string> {
    const tx = await this.protocol.registerAgent();
    await tx.wait();
    return tx.hash;
  }

  async subscribe(days: number): Promise<string> {
    const fee = await this.protocol.listenerFee();
    const totalFee = fee * BigInt(days);
    
    await this.ensureApproval(totalFee);
    
    const tx = await this.protocol.subscribeToJobs(days);
    await tx.wait();
    return tx.hash;
  }

  async postJob(
    title: string,
    description: string,
    acceptanceCriteria: string,
    reward: string,
    applicationFee: string = '1',
    deadline: number = 0,
    requiredSkills: string[] = []
  ): Promise<{ txHash: string; jobId: number }> {
    const rewardWei = parseEther(reward);
    const appFeeWei = parseEther(applicationFee);
    
    await this.ensureApproval(rewardWei);
    
    const tx = await this.protocol.postJob(
      title,
      description,
      acceptanceCriteria,
      rewardWei,
      appFeeWei,
      deadline,
      requiredSkills
    );
    const receipt = await tx.wait();
    
    // Parse job ID from events (simplified)
    const jobCounter = await this.protocol.jobCounter();
    
    return { txHash: tx.hash, jobId: Number(jobCounter) };
  }

  async applyToJob(jobId: number, proposal: string): Promise<string> {
    const job = await this.getJob(jobId);
    
    if (job.applicationFee > 0n) {
      await this.ensureApproval(job.applicationFee);
    }
    
    const tx = await this.protocol.applyToJob(jobId, proposal);
    await tx.wait();
    return tx.hash;
  }

  async acceptApplicant(jobId: number, applicant: string): Promise<string> {
    const tx = await this.protocol.acceptApplicant(jobId, applicant);
    await tx.wait();
    return tx.hash;
  }

  async submitWork(jobId: number, proofUri: string, notes: string): Promise<string> {
    const tx = await this.protocol.submitWork(jobId, proofUri, notes);
    await tx.wait();
    return tx.hash;
  }

  async approveWork(jobId: number, rating: number): Promise<string> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    const tx = await this.protocol.approveWork(jobId, rating);
    await tx.wait();
    return tx.hash;
  }

  async rejectWork(jobId: number, reason: string): Promise<string> {
    const tx = await this.protocol.rejectWork(jobId, reason);
    await tx.wait();
    return tx.hash;
  }

  async cancelJob(jobId: number): Promise<string> {
    const tx = await this.protocol.cancelJob(jobId);
    await tx.wait();
    return tx.hash;
  }

  // ============ Helpers ============

  private parseJob(job: any): Job {
    return {
      id: job.id,
      poster: job.poster,
      title: job.title,
      description: job.description,
      acceptanceCriteria: job.acceptanceCriteria,
      reward: job.reward,
      applicationFee: job.applicationFee,
      status: Number(job.status) as JobStatus,
      assignedWorker: job.assignedWorker,
      createdAt: job.createdAt,
      deadline: job.deadline,
      requiredSkills: job.requiredSkills,
    };
  }
}

export function formatGzero(wei: bigint): string {
  return `${formatEther(wei)} $GZERO`;
}

export function statusToString(status: JobStatus): string {
  const names = ['Open', 'Assigned', 'Submitted', 'Completed', 'Cancelled', 'Disputed'];
  return names[status] || 'Unknown';
}
