import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor'

const PROGRAM_ID = '7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb'
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

// IDL for the program (minimal version for reading)
const IDL = {
  "address": "7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb",
  "metadata": { "name": "gigzero_protocol", "version": "0.1.0", "spec": "0.1.0" },
  "accounts": [
    {
      "name": "Config",
      "discriminator": [155, 12, 170, 224, 30, 250, 204, 130]
    },
    {
      "name": "Job", 
      "discriminator": [58, 110, 165, 77, 143, 218, 157, 170]
    }
  ],
  "types": [
    {
      "name": "Config",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "admin", "type": "pubkey" },
          { "name": "platformFeeBps", "type": "u16" },
          { "name": "totalJobs", "type": "u64" },
          { "name": "totalCompleted", "type": "u64" }
        ]
      }
    },
    {
      "name": "Job",
      "type": {
        "kind": "struct", 
        "fields": [
          { "name": "id", "type": "u64" },
          { "name": "client", "type": "pubkey" },
          { "name": "title", "type": "string" },
          { "name": "description", "type": "string" },
          { "name": "paymentAmount", "type": "u64" },
          { "name": "status", "type": { "defined": { "name": "JobStatus" } } },
          { "name": "worker", "type": { "option": "pubkey" } },
          { "name": "submissionUri", "type": { "option": "string" } },
          { "name": "createdAt", "type": "i64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "JobStatus",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "Open" },
          { "name": "Submitted" },
          { "name": "Completed" },
          { "name": "Cancelled" }
        ]
      }
    }
  ]
} as const

const JOB_STATUS_MAP: Record<string, string> = {
  'open': 'open',
  'submitted': 'submitted', 
  'completed': 'completed',
  'cancelled': 'cancelled'
}

interface JobResponse {
  id: string
  title: string
  description: string
  client: string
  reward: string
  status: string
  worker: string | null
  createdAt: string
}

export async function GET() {
  try {
    const connection = new Connection(RPC_URL, 'confirmed')
    const programId = new PublicKey(PROGRAM_ID)

    // First get config to know how many jobs exist
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      programId
    )

    // Create a read-only provider (no wallet needed for reading)
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: PublicKey.default,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any) => txs,
      } as any,
      { commitment: 'confirmed' }
    )

    const program = new Program(IDL as any, provider)

    // Fetch config
    let totalJobs = 0
    try {
      const config = await (program.account as any).config.fetch(configPDA)
      totalJobs = Number(config.totalJobs)
    } catch (e) {
      console.log('Config not found or not initialized')
      return NextResponse.json({ success: true, jobs: [] })
    }

    // Fetch all jobs
    const jobs: JobResponse[] = []
    
    for (let i = 0; i < totalJobs; i++) {
      try {
        const [jobPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from('job'), new BN(i).toArrayLike(Buffer, 'le', 8)],
          programId
        )
        
        const jobAccount = await (program.account as any).job.fetch(jobPDA)
        
        // Determine status string
        let status = 'open'
        if (jobAccount.status.submitted) status = 'submitted'
        else if (jobAccount.status.completed) status = 'completed'
        else if (jobAccount.status.cancelled) status = 'cancelled'
        
        // Convert payment amount (9 decimals for $SHELL)
        const rewardAmount = Number(jobAccount.paymentAmount) / 1e9
        
        jobs.push({
          id: jobAccount.id.toString(),
          title: jobAccount.title,
          description: jobAccount.description,
          client: jobAccount.client.toBase58(),
          reward: rewardAmount.toLocaleString(),
          status,
          worker: jobAccount.worker ? jobAccount.worker.toBase58() : null,
          createdAt: new Date(Number(jobAccount.createdAt) * 1000).toISOString(),
        })
      } catch (e) {
        console.error(`Error fetching job ${i}:`, e)
        continue
      }
    }

    // Sort by newest first
    jobs.sort((a, b) => parseInt(b.id) - parseInt(a.id))

    return NextResponse.json({ success: true, jobs })
  } catch (error) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json({ 
      success: true, 
      jobs: [],
      error: 'Failed to fetch jobs from chain'
    })
  }
}
