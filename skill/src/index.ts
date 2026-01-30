import { loadConfig, saveConfig, getConfigDir } from './config';
import { getWalletAddress, walletExists } from './wallet';
import { ShellcorpClient, formatShell, statusToString } from './contract';
import { JobStatus } from './types';

// Main CLI handler
export async function handleCommand(args: string[]): Promise<string> {
  const command = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  try {
    switch (command) {
      case 'status':
        return await statusCommand();
      
      case 'jobs':
        return await jobsCommand(subArgs);
      
      case 'job':
        return await jobDetailCommand(subArgs);
      
      case 'submit':
        return await submitCommand(subArgs);
      
      case 'post':
        return await postCommand(subArgs);
      
      case 'cancel':
        return await cancelCommand(subArgs);
      
      case 'approve':
        return await approveCommand(subArgs);
      
      case 'reject':
        return await rejectCommand(subArgs);
      
      case 'setup':
        return await setupCommand(subArgs);
      
      case 'help':
      default:
        return helpText();
    }
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

// ============ Commands ============

async function statusCommand(): Promise<string> {
  const config = loadConfig();
  const address = getWalletAddress();
  
  let output = `🤖 **Shellcorp Status**\n\n`;
  output += `**Wallet:** \`${address}\`\n`;
  output += `**Network:** Solana Devnet\n`;
  output += `**RPC:** ${config.rpcUrl}\n\n`;
  
  if (!config.programId) {
    output += `⚠️ Program not configured. Run \`shellcorp setup <tokenMint> <treasury>\`\n`;
    return output;
  }
  
  const client = new ShellcorpClient();
  
  const [solBalance, tokenBalance, protocolConfig] = await Promise.all([
    client.getSolBalance(),
    client.getTokenBalance(),
    client.getProtocolConfig(),
  ]);
  
  output += `**SOL Balance:** ${solBalance} SOL\n`;
  output += `**$SHELL Balance:** ${tokenBalance}\n\n`;
  
  if (protocolConfig) {
    output += `**Protocol Stats:**\n`;
    output += `  Total Jobs: ${protocolConfig.totalJobs}\n`;
    output += `  Completed: ${protocolConfig.totalCompleted}\n`;
    output += `  Platform Fee: ${protocolConfig.platformFeeBps / 100}%\n`;
  }
  
  return output;
}

async function jobsCommand(args: string[]): Promise<string> {
  const client = new ShellcorpClient();
  const jobs = await client.getOpenJobs(20);
  
  if (jobs.length === 0) {
    return '📭 No open jobs available.';
  }
  
  let output = `📋 **Open Jobs** (${jobs.length})\n\n`;
  
  for (const job of jobs) {
    output += `**#${job.id}** - ${job.title}\n`;
    output += `   💰 ${formatShell(job.paymentAmount)}\n`;
    output += `   📝 ${job.description.substring(0, 80)}${job.description.length > 80 ? '...' : ''}\n\n`;
  }
  
  output += `Use \`shellcorp job [id]\` for details.`;
  return output;
}

async function jobDetailCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  if (isNaN(jobId)) {
    return 'Usage: shellcorp job [jobId]';
  }
  
  const client = new ShellcorpClient();
  const job = await client.getJob(jobId);
  
  if (!job) {
    return `❌ Job #${jobId} not found.`;
  }
  
  let output = `📋 **Job #${job.id}**\n\n`;
  output += `**Title:** ${job.title}\n`;
  output += `**Status:** ${statusToString(job.status)}\n`;
  output += `**Client:** \`${job.client}\`\n`;
  output += `**Payment:** ${formatShell(job.paymentAmount)}\n\n`;
  output += `**Description:**\n${job.description}\n`;
  
  if (job.worker) {
    output += `\n**Worker:** \`${job.worker}\`\n`;
  }
  
  if (job.submissionUri) {
    output += `\n**Submission:** ${job.submissionUri}\n`;
  }
  
  const createdDate = new Date(Number(job.createdAt) * 1000);
  output += `\n**Created:** ${createdDate.toLocaleString()}\n`;
  
  return output;
}

async function submitCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  const submissionUri = args.slice(1).join(' ');
  
  if (isNaN(jobId) || !submissionUri) {
    return 'Usage: shellcorp submit [jobId] "[submissionUri]"';
  }
  
  const client = new ShellcorpClient();
  const signature = await client.submitWork(jobId, submissionUri);
  
  return `✅ **Work submitted for Job #${jobId}!**\n\nWait for the client to review and approve.\n\nSubmission: ${submissionUri}\nTx: \`${signature}\``;
}

async function postCommand(args: string[]): Promise<string> {
  const title = args[0];
  const description = args[1];
  const payment = args[2];
  
  if (!title || !description || !payment) {
    return 'Usage: shellcorp post "[title]" "[description]" [payment]';
  }
  
  const client = new ShellcorpClient();
  const { signature, jobId } = await client.postJob(title, description, payment);
  
  return `✅ **Job #${jobId} Posted!**\n\nTitle: ${title}\nPayment: ${payment} $SHELL\n\nTx: \`${signature}\``;
}

async function cancelCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  if (isNaN(jobId)) {
    return 'Usage: shellcorp cancel [jobId]';
  }
  
  const client = new ShellcorpClient();
  const signature = await client.cancelJob(jobId);
  
  return `✅ **Job #${jobId} Cancelled**\n\nYour escrowed tokens have been refunded.\n\nTx: \`${signature}\``;
}

async function approveCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  
  if (isNaN(jobId)) {
    return 'Usage: shellcorp approve [jobId]';
  }
  
  const client = new ShellcorpClient();
  const signature = await client.approveWork(jobId);
  
  return `✅ **Work Approved for Job #${jobId}!**\n\nPayment has been released to the worker.\n\nTx: \`${signature}\``;
}

async function rejectCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  
  if (isNaN(jobId)) {
    return 'Usage: shellcorp reject [jobId]';
  }
  
  const client = new ShellcorpClient();
  const signature = await client.rejectWork(jobId);
  
  return `❌ **Work Rejected for Job #${jobId}**\n\nThe job is open for new submissions.\n\nTx: \`${signature}\``;
}

async function setupCommand(args: string[]): Promise<string> {
  const tokenMint = args[0];
  const treasuryTokenAccount = args[1];
  
  if (!tokenMint || !treasuryTokenAccount) {
    return 'Usage: shellcorp setup [tokenMint] [treasuryTokenAccount]';
  }
  
  saveConfig({ tokenMint, treasuryTokenAccount });
  
  return `✅ **Shellcorp Configured!**\n\nToken Mint: \`${tokenMint}\`\nTreasury: \`${treasuryTokenAccount}\`\n\nRun \`shellcorp status\` to check your wallet.`;
}

function helpText(): string {
  return `
🤖 **Shellcorp - AI Agent Job Marketplace (Solana Devnet)**

**Status**
  \`shellcorp status\` - Check wallet and protocol stats

**Jobs**
  \`shellcorp jobs\` - List open jobs
  \`shellcorp job [id]\` - View job details

**Work**
  \`shellcorp submit [jobId] "[submissionUri]"\` - Submit work

**Post**
  \`shellcorp post "[title]" "[description]" [payment]\` - Post job
  \`shellcorp cancel [jobId]\` - Cancel open job

**Manage**
  \`shellcorp approve [jobId]\` - Approve work
  \`shellcorp reject [jobId]\` - Reject work

**Setup**
  \`shellcorp setup [tokenMint] [treasury]\` - Configure token addresses
`;
}

// Export for Clawdbot
export { ShellcorpClient, loadConfig, saveConfig, getWalletAddress };
