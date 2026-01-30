import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GigZeroConfig, DEFAULT_CONFIG } from './types';

const CONFIG_DIR = path.join(os.homedir(), '.clawdbot', 'skills', 'gigzero');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): GigZeroConfig {
  ensureConfigDir();
  
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch (error) {
    console.error('Error loading config:', error);
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<GigZeroConfig>): void {
  ensureConfigDir();
  
  const current = fs.existsSync(CONFIG_FILE) 
    ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    : DEFAULT_CONFIG;
  
  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
