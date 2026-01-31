import { NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'

const PROGRAM_ID = new PublicKey('7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb')
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

// Account discriminators (first 8 bytes) - from actual on-chain data
const CONFIG_DISCRIMINATOR = Buffer.from([0x9b, 0x0c, 0xaa, 0xe0, 0x1e, 0xfa, 0xcc, 0x82])
const JOB_DISCRIMINATOR = Buffer.from([0x4b, 0x7c, 0x50, 0xcb, 0xa1, 0xb4, 0xca, 0x50])

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

function readString(buffer: Buffer, offset: number): [string, number] {
  const len = buffer.readUInt32LE(offset)
  const str = buffer.slice(offset + 4, offset + 4 + len).toString('utf-8')
  return [str, offset + 4 + len]
}

function parseJobAccount(data: Buffer): JobResponse | null {
  try {
    // Check discriminator
    if (!data.slice(0, 8).equals(JOB_DISCRIMINATOR)) {
      return null
    }

    let offset = 8

    // id: u64
    const id = data.readBigUInt64LE(offset)
    offset += 8

    // client: Pubkey (32 bytes)
    const client = new PublicKey(data.slice(offset, offset + 32)).toBase58()
    offset += 32

    // title: String
    const [title, newOffset1] = readString(data, offset)
    offset = newOffset1

    // description: String
    const [description, newOffset2] = readString(data, offset)
    offset = newOffset2

    // payment_amount: u64
    const paymentAmount = data.readBigUInt64LE(offset)
    offset += 8

    // status: enum (1 byte)
    const statusByte = data.readUInt8(offset)
    offset += 1
    const statusMap = ['open', 'submitted', 'completed', 'cancelled']
    const status = statusMap[statusByte] || 'open'

    // worker: Option<Pubkey>
    const hasWorker = data.readUInt8(offset) === 1
    offset += 1
    let worker: string | null = null
    if (hasWorker) {
      worker = new PublicKey(data.slice(offset, offset + 32)).toBase58()
      offset += 32
    }

    // submission_uri: Option<String> - skip for now
    // created_at: i64
    // We need to find created_at - it's near the end
    // For now, use current time as fallback

    const reward = Number(paymentAmount) / 1e9

    return {
      id: id.toString(),
      title,
      description,
      client,
      reward: reward.toLocaleString(),
      status,
      worker,
      createdAt: new Date().toISOString(),
    }
  } catch (e) {
    console.error('Error parsing job:', e)
    return null
  }
}

function parseConfigAccount(data: Buffer): { totalJobs: number } | null {
  try {
    if (!data.slice(0, 8).equals(CONFIG_DISCRIMINATOR)) {
      return null
    }

    // admin: Pubkey (32 bytes) at offset 8
    // platformFeeBps: u16 at offset 40
    // totalJobs: u64 at offset 42
    const totalJobs = Number(data.readBigUInt64LE(42))
    return { totalJobs }
  } catch (e) {
    return null
  }
}

export async function GET() {
  try {
    const connection = new Connection(RPC_URL, 'confirmed')

    // Get config PDA
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    )

    // Fetch config account
    const configInfo = await connection.getAccountInfo(configPDA)
    if (!configInfo) {
      return NextResponse.json({ success: true, jobs: [], message: 'Protocol not initialized' })
    }

    const config = parseConfigAccount(configInfo.data as Buffer)
    if (!config) {
      return NextResponse.json({ success: true, jobs: [], message: 'Failed to parse config' })
    }

    // Fetch all jobs
    const jobs: JobResponse[] = []

    for (let i = 0; i < config.totalJobs; i++) {
      try {
        // Calculate job PDA
        const jobIdBuffer = Buffer.alloc(8)
        jobIdBuffer.writeBigUInt64LE(BigInt(i))
        
        const [jobPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from('job'), jobIdBuffer],
          PROGRAM_ID
        )

        const jobInfo = await connection.getAccountInfo(jobPDA)
        if (jobInfo) {
          const job = parseJobAccount(jobInfo.data as Buffer)
          if (job) {
            jobs.push(job)
          }
        }
      } catch (e) {
        console.error(`Error fetching job ${i}:`, e)
        continue
      }
    }

    // Sort by newest first
    jobs.sort((a, b) => parseInt(b.id) - parseInt(a.id))

    return NextResponse.json({ success: true, jobs, totalOnChain: config.totalJobs })
  } catch (error: any) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json({
      success: false,
      jobs: [],
      error: error.message || 'Failed to fetch jobs from chain'
    })
  }
}
