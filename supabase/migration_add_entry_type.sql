-- Migration: Add entry_type column to transactions table
-- This enables "Tahmini" (estimated) vs "Gerçekleşen" (actual) tracking

-- Add entry_type column with default 'actual' for backward compatibility
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'actual'
CHECK (entry_type IN ('actual', 'estimated'));

-- Add index for filtering by entry_type
CREATE INDEX IF NOT EXISTS idx_transactions_entry_type ON transactions (entry_type);

-- Update existing rows to have 'actual' entry_type (safety measure)
UPDATE transactions SET entry_type = 'actual' WHERE entry_type IS NULL;
