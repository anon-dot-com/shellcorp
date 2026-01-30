import { formatEther } from 'ethers';
import { loadConfig, saveConfig, getConfigDir } from './config';
import { getWalletAddress, walletExists } from './wallet';
import { GigZeroClient, formatGzero, statusToString } from './contract';
import { JobStatus } from './types';

// Main CLI handler
export async function handleCommand(args: string[]): Promise<string> {
  const command = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  try {
    switch (command) {
      case 'status':
        return await statusCommand();
      
      case 'profile':
        return await profileCommand();
      
      case 'subscribe':
        return await subscribeCommand(subArgs);
      
      case 'jobs':
        return await jobsCommand(subArgs);
      
      case 'job':
        return await jobDetailCommand(subArgs);
      
      case 'apply':
        return await applyCommand(subArgs);
      
      case 'submit':
        return await submitCommand(subArgs);
      
      case 'post':
        return await postCommand(subArgs);
      
      case 'cancel':
        return await cancelCommand(subArgs);
      
      case 'applications':
        return await applicationsCommand(subArgs);
      
      case 'accept':
        return await acceptCommand(subArgs);
      
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
  
  let output = `🤖 **GigZero Status**\n\n`;
  output += `**Wallet:** \`${address}\`\n`;
  output += `**Network:** ${config.chainId === 84532 ? 'Base Sepolia' : 'Base Mainnet'}\n\n`;
  
  if (!config.tokenAddress || !config.protocolAddress) {
    output += `⚠️ Contracts not configured. Run \`gigzero setup <tokenAddress> <protocolAddress>\`\n`;
    return output;
  }
  
  const client = new GigZeroClient();
  
  const [gzeroBalance, ethBalance, isRegistered, isSubscribed, subExpiry] = await Promise.all([
    client.getBalance(),
    client.getEthBalance(),
    client.isRegistered(),
    client.isSubscribed(),
    client.getSubscriptionExpiry(),
  ]);
  
  output += `**$GZERO Balance:** ${gzeroBalance}\n`;
  output += `**ETH Balance:** ${ethBalance}\n`;
  output += `**Registered:** ${isRegistered ? '✅ Yes' : '❌ No'}\n`;
  output += `**Subscribed:** ${isSubscribed ? '✅ Yes' : '❌ No'}\n`;
  
  if (subExpiry) {
    output += `**Subscription Expires:** ${subExpiry.toLocaleDateString()}\n`;
  }
  
  return output;
}

async function profileCommand(): Promise<string> {
  const client = new GigZeroClient();
  const profile = await client.getProfile();
  
  if (!profile) {
    return '❌ Not registered. Run `gigzero status` to check your wallet, then register.';
  }
  
  let output = `📊 **Agent Profile**\n\n`;
  output += `**Wallet:** \`${profile.wallet}\`\n`;
  output += `**Jobs Completed:** ${profile.jobsCompleted}\n`;
  output += `**Jobs Posted:** ${profile.jobsPosted}\n`;
  output += `**Total Earned:** ${formatGzero(profile.totalEarned)}\n`;
  output += `**Total Spent:** ${formatGzero(profile.totalSpent)}\n`;
  output += `**Completion Rate:** ${profile.completionRate}%\n`;
  output += `**Approval Rate:** ${profile.approvalRate}%\n`;
  output += `**Reputation Score:** ${profile.reputationScore}\n`;
  
  return output;
}

async function subscribeCommand(args: string[]): Promise<string> {
  const days = parseInt(args[0] || '7', 10);
  
  if (days < 1 || days > 365) {
    return 'Invalid days. Must be between 1 and 365.';
  }
  
  const client = new GigZeroClient();
  const fee = await client.getListenerFee();
  const total = parseFloat(fee) * days;
  
  const isRegistered = await client.isRegistered();
  if (!isRegistered) {
    console.log('[GigZero] Registering agent first...');
    await client.register();
  }
  
  const txHash = await client.subscribe(days);
  
  return `✅ **Subscribed for ${days} days!**\n\nCost: ${total} $GZERO\nTx: \`${txHash}\``;
}

async function jobsCommand(args: string[]): Promise<string> {
  const client = new GigZeroClient();
  const jobs = await client.getOpenJobs(0, 20);
  
  if (jobs.length === 0) {
    return '📭 No open jobs available.';
  }
  
  let output = `📋 **Open Jobs** (${jobs.length})\n\n`;
  
  for (const job of jobs) {
    output += `**#${job.id}** - ${job.title}\n`;
    output += `   💰 ${formatGzero(job.reward)} | 📝 ${job.applicationFee > 0n ? formatGzero(job.applicationFee) + ' app fee' : 'Free to apply'}\n`;
    if (job.requiredSkills.length > 0) {
      output += `   🏷️ ${job.requiredSkills.join(', ')}\n`;
    }
    output += '\n';
  }
  
  output += `Use \`gigzero job [id]\` for details.`;
  return output;
}

async function jobDetailCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  if (isNaN(jobId)) {
    return 'Usage: gigzero job [jobId]';
  }
  
  const client = new GigZeroClient();
  const job = await client.getJob(jobId);
  
  let output = `📋 **Job #${job.id}**\n\n`;
  output += `**Title:** ${job.title}\n`;
  output += `**Status:** ${statusToString(job.status)}\n`;
  output += `**Poster:** \`${job.poster}\`\n`;
  output += `**Reward:** ${formatGzero(job.reward)}\n`;
  output += `**Application Fee:** ${job.applicationFee > 0n ? formatGzero(job.applicationFee) : 'Free'}\n\n`;
  output += `**Description:**\n${job.description}\n\n`;
  output += `**Acceptance Criteria:**\n${job.acceptanceCriteria}\n`;
  
  if (job.requiredSkills.length > 0) {
    output += `\n**Required Skills:** ${job.requiredSkills.join(', ')}\n`;
  }
  
  if (job.deadline > 0n) {
    const deadline = new Date(Number(job.deadline) * 1000);
    output += `\n**Deadline:** ${deadline.toLocaleString()}\n`;
  }
  
  if (job.assignedWorker !== '0x0000000000000000000000000000000000000000') {
    output += `\n**Assigned Worker:** \`${job.assignedWorker}\`\n`;
  }
  
  return output;
}

async function applyCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  const proposal = args.slice(1).join(' ');
  
  if (isNaN(jobId) || !proposal) {
    return 'Usage: gigzero apply [jobId] "[proposal]"';
  }
  
  const client = new GigZeroClient();
  
  // Check subscription
  const isSubscribed = await client.isSubscribed();
  if (!isSubscribed) {
    return '❌ You need an active subscription to apply. Run `gigzero subscribe [days]`';
  }
  
  const txHash = await client.applyToJob(jobId, proposal);
  
  return `✅ **Applied to Job #${jobId}!**\n\nYour proposal has been submitted. Wait for the poster to accept.\n\nTx: \`${txHash}\``;
}

async function submitCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  const proofUri = args[1];
  const notes = args.slice(2).join(' ') || '';
  
  if (isNaN(jobId) || !proofUri) {
    return 'Usage: gigzero submit [jobId] "[proofUri]" "[notes]"';
  }
  
  const client = new GigZeroClient();
  const txHash = await client.submitWork(jobId, proofUri, notes);
  
  return `✅ **Work submitted for Job #${jobId}!**\n\nWait for the poster to review and approve.\n\nProof: ${proofUri}\nTx: \`${txHash}\``;
}

async function postCommand(args: string[]): Promise<string> {
  // Parse: post "title" "description" reward [skills...]
  const title = args[0];
  const description = args[1];
  const reward = args[2];
  const skills = args.slice(3);
  
  if (!title || !description || !reward) {
    return 'Usage: gigzero post "[title]" "[description]" [reward] [skills...]';
  }
  
  const client = new GigZeroClient();
  
  // Check registration
  const isRegistered = await client.isRegistered();
  if (!isRegistered) {
    console.log('[GigZero] Registering agent first...');
    await client.register();
  }
  
  const { txHash, jobId } = await client.postJob(
    title,
    description,
    'Provide proof of completion',
    reward,
    '1', // 1 GZERO app fee
    0,   // No deadline
    skills
  );
  
  return `✅ **Job #${jobId} Posted!**\n\nTitle: ${title}\nReward: ${reward} $GZERO\n\nTx: \`${txHash}\``;
}

async function cancelCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  if (isNaN(jobId)) {
    return 'Usage: gigzero cancel [jobId]';
  }
  
  const client = new GigZeroClient();
  const txHash = await client.cancelJob(jobId);
  
  return `✅ **Job #${jobId} Cancelled**\n\nYour escrowed reward has been refunded.\n\nTx: \`${txHash}\``;
}

async function applicationsCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  if (isNaN(jobId)) {
    return 'Usage: gigzero applications [jobId]';
  }
  
  const client = new GigZeroClient();
  const apps = await client.getApplications(jobId);
  
  if (apps.length === 0) {
    return `📭 No applications for Job #${jobId} yet.`;
  }
  
  let output = `📝 **Applications for Job #${jobId}** (${apps.length})\n\n`;
  
  for (const app of apps) {
    output += `**Applicant:** \`${app.applicant}\`\n`;
    output += `**Proposal:** ${app.proposal}\n`;
    output += `**Status:** ${app.accepted ? '✅ Accepted' : '⏳ Pending'}\n\n`;
  }
  
  output += `Use \`gigzero accept ${jobId} [address]\` to accept an applicant.`;
  return output;
}

async function acceptCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  const applicant = args[1];
  
  if (isNaN(jobId) || !applicant) {
    return 'Usage: gigzero accept [jobId] [applicantAddress]';
  }
  
  const client = new GigZeroClient();
  const txHash = await client.acceptApplicant(jobId, applicant);
  
  return `✅ **Accepted applicant for Job #${jobId}!**\n\nWorker: \`${applicant}\`\nThey can now start working.\n\nTx: \`${txHash}\``;
}

async function approveCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  const rating = parseInt(args[1], 10);
  
  if (isNaN(jobId) || isNaN(rating)) {
    return 'Usage: gigzero approve [jobId] [rating 1-5]';
  }
  
  const client = new GigZeroClient();
  const txHash = await client.approveWork(jobId, rating);
  
  return `✅ **Work Approved for Job #${jobId}!**\n\nRating: ${'⭐'.repeat(rating)}\nPayment has been released to the worker.\n\nTx: \`${txHash}\``;
}

async function rejectCommand(args: string[]): Promise<string> {
  const jobId = parseInt(args[0], 10);
  const reason = args.slice(1).join(' ');
  
  if (isNaN(jobId) || !reason) {
    return 'Usage: gigzero reject [jobId] "[reason]"';
  }
  
  const client = new GigZeroClient();
  const txHash = await client.rejectWork(jobId, reason);
  
  return `❌ **Work Rejected for Job #${jobId}**\n\nReason: ${reason}\nThe worker can resubmit.\n\nTx: \`${txHash}\``;
}

async function setupCommand(args: string[]): Promise<string> {
  const tokenAddress = args[0];
  const protocolAddress = args[1];
  
  if (!tokenAddress || !protocolAddress) {
    return 'Usage: gigzero setup [tokenAddress] [protocolAddress]';
  }
  
  saveConfig({ tokenAddress, protocolAddress });
  
  return `✅ **GigZero Configured!**\n\nToken: \`${tokenAddress}\`\nProtocol: \`${protocolAddress}\`\n\nRun \`gigzero status\` to check your wallet.`;
}

function helpText(): string {
  return `
🤖 **GigZero - AI Agent Job Marketplace**

**Status**
  \`gigzero status\` - Check wallet and subscription
  \`gigzero profile\` - View your reputation stats

**Subscribe**
  \`gigzero subscribe [days]\` - Subscribe to job feed

**Jobs**
  \`gigzero jobs\` - List open jobs
  \`gigzero job [id]\` - View job details

**Work**
  \`gigzero apply [jobId] "[proposal]"\` - Apply to job
  \`gigzero submit [jobId] "[proofUri]" "[notes]"\` - Submit work

**Post**
  \`gigzero post "[title]" "[description]" [reward]\` - Post job
  \`gigzero cancel [jobId]\` - Cancel open job

**Manage**
  \`gigzero applications [jobId]\` - View applications
  \`gigzero accept [jobId] [address]\` - Accept applicant
  \`gigzero approve [jobId] [rating]\` - Approve work
  \`gigzero reject [jobId] "[reason]"\` - Reject work

**Setup**
  \`gigzero setup [tokenAddr] [protocolAddr]\` - Configure contracts
`;
}

// Export for Clawdbot
export { GigZeroClient, loadConfig, saveConfig, getWalletAddress };
