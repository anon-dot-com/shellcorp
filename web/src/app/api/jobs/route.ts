import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

const PROGRAM_ID = '7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb'
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

// Job status enum matching on-chain
const JOB_STATUS = ['open', 'submitted', 'completed', 'cancelled'] as const

interface Job {
  id: string
  title: string
  description: string
  client: string
  reward: string
  status: typeof JOB_STATUS[number]
  worker: string | null
  createdAt: string
}

export async function GET() {
  try {
    const connection = new Connection(RPC_URL, 'confirmed')
    const programId = new PublicKey(PROGRAM_ID)

    // Get all program accounts (jobs are stored as PDAs)
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        // Filter for job accounts by size (jobs have a specific size)
        // Adjust this based on actual job account size
        { dataSize: 500 }, // approximate, may need adjustment
      ],
    })

    const jobs: Job[] = []

    for (const account of accounts) {
      try {
        // Decode job data from account
        // This is a simplified decoder - in production use Anchor's IDL decoder
        const data = account.account.data
        
        // Skip if too small to be a job
        if (data.length < 100) continue

        // Parse the job data (this is a simplified version)
        // In production, use proper Anchor deserialization
        const job = parseJobAccount(account.pubkey.toBase58(), data)
        if (job) {
          jobs.push(job)
        }
      } catch (e) {
        // Skip accounts that aren't jobs
        continue
      }
    }

    // Sort by newest first
    jobs.sort((a, b) => parseInt(b.id) - parseInt(a.id))

    return NextResponse.json({ success: true, jobs })
  } catch (error) {
    console.error('Error fetching jobs:', error)
    
    // Return empty array for now - no jobs posted yet
    return NextResponse.json({ 
      success: true, 
      jobs: [],
      message: 'No jobs found or unable to fetch from chain'
    })
  }
}

function parseJobAccount(pubkey: string, data: Buffer): Job | null {
  try {
    // Anchor account discriminator is first 8 bytes
    // Then comes the actual job data
    
    // This is a placeholder parser - actual parsing depends on IDL
    // For now, return null since we haven't posted any jobs yet
    
    // When jobs exist, we'd parse:
    // - id (u64)
    // - client (Pubkey - 32 bytes)
    // - title (String - length prefix + bytes)
    // - description (String)
    // - payment_amount (u64)
    // - status (enum)
    // - worker (Option<Pubkey>)
    // - submission_uri (Option<String>)
    // - created_at (i64)
    // - bump (u8)
    
    return null
  } catch (e) {
    return null
  }
}
