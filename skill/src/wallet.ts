import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ethers, Wallet, HDNodeWallet } from 'ethers';
import { getConfigDir, ensureConfigDir } from './config';

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
  address: string;
  encryptedKey: string;
  createdAt: string;
}

export function getWalletPath(): string {
  return path.join(getConfigDir(), WALLET_FILE);
}

export function walletExists(): boolean {
  return fs.existsSync(getWalletPath());
}

export function createWallet(): { wallet: HDNodeWallet; data: WalletData } {
  ensureConfigDir();
  
  const wallet = ethers.Wallet.createRandom();
  
  const data: WalletData = {
    address: wallet.address,
    encryptedKey: encrypt(wallet.privateKey),
    createdAt: new Date().toISOString(),
  };
  
  fs.writeFileSync(getWalletPath(), JSON.stringify(data, null, 2));
  fs.chmodSync(getWalletPath(), 0o600); // Only owner can read/write
  
  console.log(`[Shellcorp] New wallet created: ${wallet.address}`);
  console.log(`[Shellcorp] Fund this address with $SHELL to start working`);
  
  return { wallet, data };
}

export function loadWallet(): Wallet | HDNodeWallet {
  if (!walletExists()) {
    const { wallet } = createWallet();
    return wallet;
  }
  
  const content = fs.readFileSync(getWalletPath(), 'utf-8');
  const data: WalletData = JSON.parse(content);
  const privateKey = decrypt(data.encryptedKey);
  
  return new ethers.Wallet(privateKey);
}

export function getWalletAddress(): string {
  if (!walletExists()) {
    const { data } = createWallet();
    return data.address;
  }
  
  const content = fs.readFileSync(getWalletPath(), 'utf-8');
  const data: WalletData = JSON.parse(content);
  return data.address;
}

export function getConnectedWallet(rpcUrl: string): Wallet | HDNodeWallet {
  const wallet = loadWallet();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return wallet.connect(provider);
}
