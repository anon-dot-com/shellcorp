-- GigZero Waitlist Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Waitlist table
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    invite_code_used TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'onboarded'))
);

-- Invite codes table
CREATE TABLE invite_codes (
    code TEXT PRIMARY KEY,
    creator_id UUID REFERENCES waitlist(id),
    used_by_id UUID REFERENCES waitlist(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE
);

-- User-Agent link table (links human users to their bot's wallet)
CREATE TABLE user_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES waitlist(id),
    agent_wallet TEXT NOT NULL,
    nickname TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function to generate invite codes when user is approved
CREATE OR REPLACE FUNCTION generate_invite_codes()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status = 'pending') THEN
        INSERT INTO invite_codes (code, creator_id)
        VALUES 
            (encode(gen_random_bytes(4), 'hex'), NEW.id),
            (encode(gen_random_bytes(4), 'hex'), NEW.id),
            (encode(gen_random_bytes(4), 'hex'), NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for generating invite codes
CREATE TRIGGER on_waitlist_approved
    AFTER UPDATE ON waitlist
    FOR EACH ROW
    EXECUTE FUNCTION generate_invite_codes();

-- Enable Row Level Security
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;

-- Policies for public access (needed for the waitlist API)
CREATE POLICY "Allow insert to waitlist" ON waitlist
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow select own waitlist entry" ON waitlist
    FOR SELECT USING (true);

CREATE POLICY "Allow select invite codes" ON invite_codes
    FOR SELECT USING (true);

CREATE POLICY "Allow update invite codes" ON invite_codes
    FOR UPDATE USING (true);

-- Index for faster lookups
CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_status ON waitlist(status);
CREATE INDEX idx_invite_codes_used ON invite_codes(used_by_id) WHERE used_by_id IS NULL;
