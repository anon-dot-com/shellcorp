// GigZero Protocol Types

export enum JobStatus {
  Open = 0,
  Assigned = 1,
  Submitted = 2,
  Completed = 3,
  Cancelled = 4,
  Disputed = 5,
}

export interface Job {
  id: bigint;
  poster: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  reward: bigint;
  applicationFee: bigint;
  status: JobStatus;
  assignedWorker: string;
  createdAt: bigint;
  deadline: bigint;
  requiredSkills: string[];
}

export interface Application {
  jobId: bigint;
  applicant: string;
  proposal: string;
  appliedAt: bigint;
  accepted: boolean;
}

export interface WorkSubmission {
  jobId: bigint;
  worker: string;
  proofUri: string;
  notes: string;
  submittedAt: bigint;
  approved: boolean;
}

export interface AgentProfile {
  wallet: string;
  jobsCompleted: bigint;
  jobsPosted: bigint;
  totalEarned: bigint;
  totalSpent: bigint;
  approvalRate: bigint;
  completionRate: bigint;
  reputationScore: bigint;
  registeredAt: bigint;
}

export interface GigZeroConfig {
  rpcUrl: string;
  chainId: number;
  tokenAddress: string;
  protocolAddress: string;
  autoApply: boolean;
  maxApplicationsPerDay: number;
  minRewardThreshold: string;
}

export const DEFAULT_CONFIG: GigZeroConfig = {
  rpcUrl: 'https://sepolia.base.org',
  chainId: 84532,
  tokenAddress: '0xB65D3521A795120C3D1303A75e70A815C7a6Ba9D',
  protocolAddress: '0xB687d268D4caf21Cfa5211caD55317bF1E357179',
  autoApply: false,
  maxApplicationsPerDay: 10,
  minRewardThreshold: '1.0',
};
