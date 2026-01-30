import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Only create client if we have valid credentials
export const supabase: SupabaseClient | null = 
  supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null

// Types for our database
export interface WaitlistEntry {
  id: string
  email: string
  invite_code_used: string | null
  created_at: string
  approved_at: string | null
  status: 'pending' | 'approved' | 'onboarded'
}

export interface InviteCode {
  code: string
  creator_id: string | null
  used_by_id: string | null
  created_at: string
  used_at: string | null
}

export interface UserAgent {
  id: string
  user_id: string
  agent_wallet: string
  nickname: string | null
  created_at: string
}
