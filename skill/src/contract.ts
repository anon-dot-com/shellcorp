import { 
  Connection, 
  PublicKey, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { 
  AnchorProvider, 
  BN,
  Program,
} from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { loadConfig } from './config';
import { loadWallet, getConnection } from './wallet';
import { Job, JobStatus, ProtocolConfig } from './types';

// Load IDL from file at runtime
import * as fs from 'fs';
import * as path from 'path';

function loadIDL(): any {
  // Try to load from relative path (deployed) or from solana dir (dev)
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'solana', 'gigzero_protocol', 'target', 'idl', 'gigzero_protocol.json'),
    path.join(__dirname, '..', 'idl', 'gigzero_protocol.json'),
    path.join(process.env.HOME || '', 'clawd', 'shellcorp', 'solana', 'gigzero_protocol', 'target', 'idl', 'gigzero_protocol.json'),
  ];
  
  for (const idlPath of possiblePaths) {
    if (fs.existsSync(idlPath)) {
      return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    }
  }
  
  throw new Error('IDL file not found');
}

export class ShellcorpClient {
  private connection: Connection;
  private program: Program;
  private config: ReturnType<typeof loadConfig>;
  private programId: PublicKey;
  private keypair: ReturnType<typeof loadWallet>;

  constructor() {
    this.config = loadConfig();
    
    if (!this.config.programId) {
      throw new Error('Program ID not configured. Run shellcorp setup first.');
    }
    
    this.programId = new PublicKey(this.config.programId);
    this.connection = getConnection();
    this.keypair = loadWallet();
    
    // Create a minimal wallet interface for AnchorProvider
    const wallet = {
      publicKey: this.keypair.publicKey,
      signTransaction: async (tx: any) => {
        tx.partialSign(this.keypair);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach(tx => tx.partialSign(this.keypair));
        return txs;
      },
    };
    
    const provider = new AnchorProvider(
      this.connection,
      wallet as any,
      { commitment: 'confirmed' }
    );
    
    const idl = loadIDL();
    // Anchor 0.30+ uses (idl, provider) - address is in the IDL
    this.program = new Program(idl as any, provider);
  }

  get address(): string {
    return this.keypair.publicKey.toBase58();
  }

  // ============ PDA Helpers ============

  getConfigPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.programId
    );
  }

  getJobPDA(jobId: number | bigint): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('job'), new BN(jobId.toString()).toArrayLike(Buffer, 'le', 8)],
      this.programId
    );
  }

  getEscrowPDA(jobPDA: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), jobPDA.toBuffer()],
      this.programId
    );
  }

  // ============ Read Functions ============

  async getSolBalance(): Promise<string> {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return (balance / 1e9).toFixed(4);
  }

  async getTokenBalance(): Promise<string> {
    if (!this.config.tokenMint) return '0';
    
    try {
      const mint = new PublicKey(this.config.tokenMint);
      const ata = await getAssociatedTokenAddress(mint, this.keypair.publicKey);
      const balance = await this.connection.getTokenAccountBalance(ata);
      return balance.value.uiAmountString || '0';
    } catch {
      return '0';
    }
  }

  async getProtocolConfig(): Promise<ProtocolConfig | null> {
    try {
      const [configPDA] = this.getConfigPDA();
      const configAccount = await (this.program.account as any).config.fetch(configPDA);
      return {
        admin: (configAccount.admin as PublicKey).toBase58(),
        platformFeeBps: configAccount.platformFeeBps as number,
        totalJobs: BigInt((configAccount.totalJobs as BN).toString()),
        totalCompleted: BigInt((configAccount.totalCompleted as BN).toString()),
      };
    } catch {
      return null;
    }
  }

  async getJob(jobId: number): Promise<Job | null> {
    try {
      const [jobPDA] = this.getJobPDA(jobId);
      const jobAccount = await (this.program.account as any).job.fetch(jobPDA);
      return this.parseJob(jobAccount);
    } catch {
      return null;
    }
  }

  async getOpenJobs(limit = 20): Promise<Job[]> {
    try {
      const protocolConfig = await this.getProtocolConfig();
      if (!protocolConfig) return [];
      
      const jobs: Job[] = [];
      const totalJobs = Number(protocolConfig.totalJobs);
      
      for (let i = totalJobs - 1; i >= 0 && jobs.length < limit; i--) {
        const job = await this.getJob(i);
        if (job && job.status === JobStatus.Open) {
          jobs.push(job);
        }
      }
      
      return jobs;
    } catch {
      return [];
    }
  }

  // ============ Write Functions ============

  async postJob(
    title: string,
    description: string,
    paymentAmount: string
  ): Promise<{ signature: string; jobId: number }> {
    const protocolConfig = await this.getProtocolConfig();
    if (!protocolConfig) {
      throw new Error('Protocol not initialized');
    }
    
    if (!this.config.tokenMint) {
      throw new Error('Token mint not configured');
    }
    
    const jobId = Number(protocolConfig.totalJobs);
    const [configPDA] = this.getConfigPDA();
    const [jobPDA] = this.getJobPDA(jobId);
    const [escrowPDA] = this.getEscrowPDA(jobPDA);
    
    const mint = new PublicKey(this.config.tokenMint);
    const clientTokenAccount = await getAssociatedTokenAddress(mint, this.keypair.publicKey);
    
    // Convert payment amount (assuming 6 decimals like USDC)
    const paymentAmountBN = new BN(parseFloat(paymentAmount) * 1e6);
    
    const tx = await (this.program.methods as any)
      .postJob(title, description, paymentAmountBN)
      .accounts({
        config: configPDA,
        job: jobPDA,
        escrowTokenAccount: escrowPDA,
        clientTokenAccount,
        mint,
        client: this.keypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    
    return { signature: tx, jobId };
  }

  async submitWork(jobId: number, submissionUri: string): Promise<string> {
    const [jobPDA] = this.getJobPDA(jobId);
    
    const tx = await (this.program.methods as any)
      .submitWork(submissionUri)
      .accounts({
        job: jobPDA,
        worker: this.keypair.publicKey,
      })
      .rpc();
    
    return tx;
  }

  async approveWork(jobId: number): Promise<string> {
    const job = await this.getJob(jobId);
    if (!job || !job.worker) {
      throw new Error('Job not found or no worker assigned');
    }
    
    if (!this.config.tokenMint || !this.config.treasuryTokenAccount) {
      throw new Error('Token mint or treasury not configured');
    }
    
    const [configPDA] = this.getConfigPDA();
    const [jobPDA] = this.getJobPDA(jobId);
    const [escrowPDA] = this.getEscrowPDA(jobPDA);
    
    const mint = new PublicKey(this.config.tokenMint);
    const workerPubkey = new PublicKey(job.worker);
    const workerTokenAccount = await getAssociatedTokenAddress(mint, workerPubkey);
    const treasuryTokenAccount = new PublicKey(this.config.treasuryTokenAccount);
    
    const tx = await (this.program.methods as any)
      .approveWork()
      .accounts({
        config: configPDA,
        job: jobPDA,
        escrowTokenAccount: escrowPDA,
        workerTokenAccount,
        treasuryTokenAccount,
        client: this.keypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return tx;
  }

  async rejectWork(jobId: number): Promise<string> {
    const [jobPDA] = this.getJobPDA(jobId);
    
    const tx = await (this.program.methods as any)
      .rejectWork()
      .accounts({
        job: jobPDA,
        client: this.keypair.publicKey,
      })
      .rpc();
    
    return tx;
  }

  async cancelJob(jobId: number): Promise<string> {
    if (!this.config.tokenMint) {
      throw new Error('Token mint not configured');
    }
    
    const [jobPDA] = this.getJobPDA(jobId);
    const [escrowPDA] = this.getEscrowPDA(jobPDA);
    
    const mint = new PublicKey(this.config.tokenMint);
    const clientTokenAccount = await getAssociatedTokenAddress(mint, this.keypair.publicKey);
    
    const tx = await (this.program.methods as any)
      .cancelJob()
      .accounts({
        job: jobPDA,
        escrowTokenAccount: escrowPDA,
        clientTokenAccount,
        client: this.keypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return tx;
  }

  // ============ Helpers ============

  private parseJob(jobAccount: any): Job {
    const statusVariant = Object.keys(jobAccount.status)[0];
    const statusMap: Record<string, JobStatus> = {
      open: JobStatus.Open,
      submitted: JobStatus.Submitted,
      completed: JobStatus.Completed,
      cancelled: JobStatus.Cancelled,
    };
    
    return {
      id: BigInt((jobAccount.id as BN).toString()),
      client: (jobAccount.client as PublicKey).toBase58(),
      title: jobAccount.title,
      description: jobAccount.description,
      paymentAmount: BigInt((jobAccount.paymentAmount as BN).toString()),
      status: statusMap[statusVariant] ?? JobStatus.Open,
      worker: jobAccount.worker ? (jobAccount.worker as PublicKey).toBase58() : null,
      submissionUri: jobAccount.submissionUri || null,
      createdAt: BigInt((jobAccount.createdAt as BN).toString()),
      bump: jobAccount.bump,
    };
  }
}

export function formatShell(amount: bigint): string {
  const num = Number(amount) / 1e6;
  return `${num.toFixed(2)} $SHELL`;
}

export function statusToString(status: JobStatus): string {
  const names = ['Open', 'Submitted', 'Completed', 'Cancelled'];
  return names[status] || 'Unknown';
}
