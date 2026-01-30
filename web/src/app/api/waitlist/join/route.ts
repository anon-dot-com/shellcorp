import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, inviteCode } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email required' },
        { status: 400 }
      )
    }

    // If Supabase is not configured, return mock response for development
    if (!supabase) {
      console.log('Supabase not configured, returning mock response')
      return NextResponse.json({
        success: true,
        position: Math.floor(Math.random() * 100) + 1,
        inviteCodesAvailable: 0,
      })
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('waitlist')
      .select('id, status')
      .eq('email', email.toLowerCase())
      .single()

    if (existing) {
      // Get their position
      const { count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', existing.id)

      return NextResponse.json({
        success: true,
        message: 'Already on waitlist',
        position: (count || 0) + 1,
        status: existing.status,
      })
    }

    // Validate invite code if provided
    let inviteCodeUsed = null
    if (inviteCode) {
      const { data: code } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('code', inviteCode)
        .is('used_by_id', null)
        .single()

      if (code) {
        inviteCodeUsed = inviteCode
      }
    }

    // Add to waitlist
    const { data: newEntry, error } = await supabase
      .from('waitlist')
      .insert({
        email: email.toLowerCase(),
        invite_code_used: inviteCodeUsed,
        status: inviteCodeUsed ? 'approved' : 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to join waitlist' },
        { status: 500 }
      )
    }

    // If invite code was used, mark it
    if (inviteCodeUsed && newEntry) {
      await supabase
        .from('invite_codes')
        .update({ used_by_id: newEntry.id, used_at: new Date().toISOString() })
        .eq('code', inviteCodeUsed)
    }

    // Get position
    const { count } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({
      success: true,
      position: count || 1,
      inviteCodesAvailable: inviteCodeUsed ? 3 : 0, // They get 3 codes if approved
    })
  } catch (error) {
    console.error('Waitlist join error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
