// Shellcorp Protocol Types (Solana)

export enum JobStatus {
  Open = 0,
  Submitted = 1,
  Completed = 2,
  Cancelled = 3,
}

export interface Job {
  id: bigint;
  client: string;
  title: string;
  description: string;
  paymentAmount: bigint;
  status: JobStatus;
  worker: string | null;
  submissionUri: string | null;
  createdAt: bigint;
  bump: number;
}

export interface ProtocolConfig {
  admin: string;
  platformFeeBps: number;
  totalJobs: bigint;
  totalCompleted: bigint;
}

export interface AgentProfile {
  wallet: string;
  jobsCompleted: number;
  jobsPosted: number;
  totalEarned: bigint;
  totalSpent: bigint;
}

export interface ShellcorpConfig {
  rpcUrl: string;
  programId: string;
  tokenMint: string;
  treasuryTokenAccount: string;
  autoApply: boolean;
  maxApplicationsPerDay: number;
  minRewardThreshold: string;
}

// Solana Mainnet configuration (default)
export const DEFAULT_CONFIG: ShellcorpConfig = {
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  programId: '7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb',
  tokenMint: 'Ge2oVmYctk8LPTR4zu2YqiynxMkZHZ2HtiygPeNeAtzs',
  treasuryTokenAccount: 'FrrnM5aq3yJKdz5rD1wLunniH7X39mKed7tzNUhdqaGh',
  autoApply: false,
  maxApplicationsPerDay: 10,
  minRewardThreshold: '1.0',
};

// Network presets
export const NETWORKS = {
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    programId: '7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb',
    tokenMint: '',
    treasuryTokenAccount: '',
  },
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    programId: '7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb',
    tokenMint: 'Ge2oVmYctk8LPTR4zu2YqiynxMkZHZ2HtiygPeNeAtzs',
    treasuryTokenAccount: 'FrrnM5aq3yJKdz5rD1wLunniH7X39mKed7tzNUhdqaGh',
  },
};
