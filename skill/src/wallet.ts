import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { getConfigDir, ensureConfigDir, loadConfig } from './config';

const WALLET_FILE = 'wallet.enc';

// Derive encryption key from machine-specific data
function deriveKey(): Buffer {
  const machineId = [
    process.env.USER || '',
    process.env.HOME || '',
    process.arch,
    process.platform,
  ].join(':');
  
  return crypto.scryptSync(machineId, 'shellcorp-salt', 32);
}

function encrypt(text: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const key = deriveKey();
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface WalletData {
  publicKey: string;
  encryptedSecretKey: string;
  createdAt: string;
}

export function getWalletPath(): string {
  return path.join(getConfigDir(), WALLET_FILE);
}

export function walletExists(): boolean {
  return fs.existsSync(getWalletPath());
}

export function createWallet(): { keypair: Keypair; data: WalletData } {
  ensureConfigDir();
  
  const keypair = Keypair.generate();
  const secretKeyBase58 = bs58.encode(keypair.secretKey);
  
  const data: WalletData = {
    publicKey: keypair.publicKey.toBase58(),
    encryptedSecretKey: encrypt(secretKeyBase58),
    createdAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(getWalletPath(), JSON.stringify(data, null, 2));
  fs.chmodSync(getWalletPath(), 0o600); // Only owner can read/write
  
  console.log(`[Shellcorp] New wallet created: ${keypair.publicKey.toBase58()}`);
  console.log(`[Shellcorp] Fund this address with SOL and $SHELL to start working`);
  
  return { keypair, data };
}

export function loadWallet(): Keypair {
  if (!walletExists()) {
    const { keypair } = createWallet();
    return keypair;
  }
  
  const content = fs.readFileSync(getWalletPath(), 'utf-8');
  const data: WalletData = JSON.parse(content);
  const secretKeyBase58 = decrypt(data.encryptedSecretKey);
  const secretKey = bs58.decode(secretKeyBase58);
  
  return Keypair.fromSecretKey(secretKey);
}

export function getWalletAddress(): string {
  if (!walletExists()) {
    const { data } = createWallet();
    return data.publicKey;
  }
  
  const content = fs.readFileSync(getWalletPath(), 'utf-8');
  const data: WalletData = JSON.parse(content);
  return data.publicKey;
}

export function getWalletPublicKey(): PublicKey {
  return new PublicKey(getWalletAddress());
}

export function getConnection(): Connection {
  const config = loadConfig();
  return new Connection(config.rpcUrl, 'confirmed');
}

export async function getSolBalance(): Promise<number> {
  const connection = getConnection();
  const publicKey = getWalletPublicKey();
  const balance = await connection.getBalance(publicKey);
  return balance / LAMPORTS_PER_SOL;
}
