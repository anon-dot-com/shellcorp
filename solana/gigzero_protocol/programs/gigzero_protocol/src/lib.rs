use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb");

#[program]
pub mod gigzero_protocol {
    use super::*;

    /// Initialize the protocol with admin settings
    pub fn initialize(ctx: Context<Initialize>, platform_fee_bps: u16) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.platform_fee_bps = platform_fee_bps; // basis points (100 = 1%)
        config.total_jobs = 0;
        config.total_completed = 0;
        msg!("GigZero Protocol initialized with {}bps fee", platform_fee_bps);
        Ok(())
    }

    /// Post a new job with token escrow
    pub fn post_job(
        ctx: Context<PostJob>,
        title: String,
        description: String,
        payment_amount: u64,
    ) -> Result<()> {
        require!(title.len() <= 64, GigZeroError::TitleTooLong);
        require!(description.len() <= 512, GigZeroError::DescriptionTooLong);
        require!(payment_amount > 0, GigZeroError::InvalidPayment);

        let job = &mut ctx.accounts.job;
        let config = &mut ctx.accounts.config;

        job.id = config.total_jobs;
        job.client = ctx.accounts.client.key();
        job.title = title;
        job.description = description;
        job.payment_amount = payment_amount;
        job.status = JobStatus::Open;
        job.worker = None;
        job.submission_uri = None;
        job.created_at = Clock::get()?.unix_timestamp;
        job.bump = ctx.bumps.job;

        config.total_jobs += 1;

        // Transfer tokens to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.client_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.client.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, payment_amount)?;

        msg!("Job {} posted: {}", job.id, job.title);
        Ok(())
    }

    /// Submit work for a job
    pub fn submit_work(ctx: Context<SubmitWork>, submission_uri: String) -> Result<()> {
        require!(submission_uri.len() <= 256, GigZeroError::SubmissionUriTooLong);
        
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Open, GigZeroError::JobNotOpen);

        job.worker = Some(ctx.accounts.worker.key());
        job.submission_uri = Some(submission_uri.clone());
        job.status = JobStatus::Submitted;

        msg!("Work submitted for job {}: {}", job.id, submission_uri);
        Ok(())
    }

    /// Approve submission and release payment
    pub fn approve_work(ctx: Context<ApproveWork>) -> Result<()> {
        let config = &ctx.accounts.config;
        
        // Read values we need before mutating
        let job_status = ctx.accounts.job.status.clone();
        let job_client = ctx.accounts.job.client;
        let job_id = ctx.accounts.job.id;
        let job_bump = ctx.accounts.job.bump;
        let payment_amount = ctx.accounts.job.payment_amount;

        require!(job_status == JobStatus::Submitted, GigZeroError::NoSubmission);
        require!(job_client == ctx.accounts.client.key(), GigZeroError::NotJobClient);

        // Calculate platform fee
        let fee = (payment_amount as u128)
            .checked_mul(config.platform_fee_bps as u128)
            .unwrap()
            .checked_div(10000)
            .unwrap() as u64;
        let worker_payment = payment_amount.checked_sub(fee).unwrap();

        // Transfer to worker (using PDA signer)
        let job_id_bytes = job_id.to_le_bytes();
        let seeds = &[
            b"job",
            job_id_bytes.as_ref(),
            &[job_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.worker_token_account.to_account_info(),
            authority: ctx.accounts.job.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, worker_payment)?;

        // Transfer fee to treasury (if any)
        if fee > 0 {
            let cpi_accounts_fee = Transfer {
                from: ctx.accounts.escrow_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.job.to_account_info(),
            };
            let cpi_ctx_fee = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts_fee,
                signer,
            );
            token::transfer(cpi_ctx_fee, fee)?;
        }

        // Now mutate the job
        let job = &mut ctx.accounts.job;
        job.status = JobStatus::Completed;

        msg!("Job {} approved! Worker paid {} tokens", job_id, worker_payment);
        Ok(())
    }

    /// Cancel a job (only if no submissions yet)
    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        // Read values before mutating
        let job_status = ctx.accounts.job.status.clone();
        let job_client = ctx.accounts.job.client;
        let job_id = ctx.accounts.job.id;
        let job_bump = ctx.accounts.job.bump;
        let payment_amount = ctx.accounts.job.payment_amount;
        
        require!(job_status == JobStatus::Open, GigZeroError::JobNotOpen);
        require!(job_client == ctx.accounts.client.key(), GigZeroError::NotJobClient);

        // Return tokens from escrow
        let job_id_bytes = job_id.to_le_bytes();
        let seeds = &[
            b"job",
            job_id_bytes.as_ref(),
            &[job_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.client_token_account.to_account_info(),
            authority: ctx.accounts.job.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, payment_amount)?;

        let job = &mut ctx.accounts.job;
        job.status = JobStatus::Cancelled;
        msg!("Job {} cancelled", job_id);
        Ok(())
    }

    /// Reject submission (opens job for new submissions)
    pub fn reject_work(ctx: Context<RejectWork>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        
        require!(job.status == JobStatus::Submitted, GigZeroError::NoSubmission);
        require!(job.client == ctx.accounts.client.key(), GigZeroError::NotJobClient);

        job.worker = None;
        job.submission_uri = None;
        job.status = JobStatus::Open;

        msg!("Submission rejected for job {}", job.id);
        Ok(())
    }
}

// ============ Accounts ============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(title: String, description: String, payment_amount: u64)]
pub struct PostJob<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = client,
        space = 8 + Job::INIT_SPACE,
        seeds = [b"job", config.total_jobs.to_le_bytes().as_ref()],
        bump
    )]
    pub job: Account<'info, Job>,
    #[account(
        init,
        payer = client,
        token::mint = mint,
        token::authority = job,
        seeds = [b"escrow", job.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub client_token_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    pub worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct ApproveWork<'info> {
    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [b"escrow", job.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub worker_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    pub client: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelJob<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [b"escrow", job.key().as_ref()],
        bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub client_token_account: Account<'info, TokenAccount>,
    pub client: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RejectWork<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
    pub client: Signer<'info>,
}

// ============ State ============

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub platform_fee_bps: u16,
    pub total_jobs: u64,
    pub total_completed: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Job {
    pub id: u64,
    pub client: Pubkey,
    #[max_len(64)]
    pub title: String,
    #[max_len(512)]
    pub description: String,
    pub payment_amount: u64,
    pub status: JobStatus,
    pub worker: Option<Pubkey>,
    #[max_len(256)]
    pub submission_uri: Option<String>,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum JobStatus {
    Open,
    Submitted,
    Completed,
    Cancelled,
}

// ============ Errors ============

#[error_code]
pub enum GigZeroError {
    #[msg("Title must be 64 characters or less")]
    TitleTooLong,
    #[msg("Description must be 512 characters or less")]
    DescriptionTooLong,
    #[msg("Submission URI must be 256 characters or less")]
    SubmissionUriTooLong,
    #[msg("Payment amount must be greater than 0")]
    InvalidPayment,
    #[msg("Job is not open for submissions")]
    JobNotOpen,
    #[msg("No submission to approve")]
    NoSubmission,
    #[msg("Only the job client can perform this action")]
    NotJobClient,
}
