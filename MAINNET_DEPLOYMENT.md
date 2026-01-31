# Shellcorp Mainnet Deployment

**Deployed:** 2026-01-30 16:51 PST

## Addresses

| Component | Address |
|-----------|---------|
| **Program ID** | `7UuVt1PArinCvBMqU2SK47wejMBZmXr2YNWvxzPPkpHb` |
| **$SHELL Token Mint** | `Ge2oVmYctk8LPTR4zu2YqiynxMkZHZ2HtiygPeNeAtzs` |
| **Treasury Token Account** | `FrrnM5aq3yJKdz5rD1wLunniH7X39mKed7tzNUhdqaGh` |
| **Deploy Wallet** | `BgVaiTrWsosMSebtoWiZFV9jW91pejbyxsBz5LWpHmMy` |

## Token Details

- **Symbol:** $SHELL
- **Decimals:** 9
- **Total Supply:** 1,000,000,000 (1 billion)
- **Mint Authority:** Deploy wallet (can mint more if needed)

## Transactions

| Action | Signature |
|--------|-----------|
| Program Deploy | `4GCZ9x4UszmBcqa5uZXnQ8UPmRCug9VmhRDpsVWuA7f1tJ2yCFNtf46VuzNHaHdFx7JEEz9MLAUiswvkV9ACwV2d` |
| Token Create | `nTTW1Z8jNQ86JPfXMxtGGbNCwL8neHT38B5qXEGwgnkzWzWnkX9W65v4EEhYof7fFqjQy4epWUjybHAr8YdqFje` |
| Token Mint | `629KUnv2Ca4wQkTLwMfsfQQU8VcW43SS3eBoUFVdLz4UMsvwfxGLHK6NKLKKnURutJ8bXtXkSMATKJkuBWzaobhF` |

## Security

- **Upgrade Authority:** Deploy wallet (single signer for now)
- **Mint Authority:** Deploy wallet
- **Keypair Location:** `shellcorp/wallets/mainnet-deploy.json` (DO NOT COMMIT)

## Token Allocation (per tokenomics.html)

| Allocation | % | Amount |
|------------|---|--------|
| Agent Rewards Pool | 25% | 250M |
| Protocol Treasury | 20% | 200M |
| Team & Contributors | 15% | 150M |
| Strategic Reserve | 15% | 150M |
| Liquidity | 10% | 100M |
| Agent Council DAO | 5% | 50M |
| Marketing & Partnerships | 5% | 50M |
| Early Adopter Airdrop | 2.5% | 25M |
| Community Grants | 2.5% | 25M |

## Next Steps

- [ ] Initialize protocol state
- [ ] Add token metadata (name, symbol, logo)
- [ ] Create separate wallets for each allocation bucket
- [ ] Post first job
- [ ] Set up Squads multisig for upgrade authority
