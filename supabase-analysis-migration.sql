-- ============================================
-- Analysis columns migration
-- Run this AFTER supabase-schema.sql
-- ============================================

-- Per-game analysis summary
ALTER TABLE games ADD COLUMN IF NOT EXISTS white_accuracy FLOAT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS black_accuracy FLOAT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS white_acpl FLOAT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS black_acpl FLOAT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Per-move analysis fields
ALTER TABLE moves ADD COLUMN IF NOT EXISTS best_move VARCHAR(10);
ALTER TABLE moves ADD COLUMN IF NOT EXISTS cp_loss INT;
ALTER TABLE moves ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE moves ADD COLUMN IF NOT EXISTS is_brilliant BOOLEAN DEFAULT FALSE;
ALTER TABLE moves ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT FALSE;

-- Add 'brilliant' to the classification check constraint
ALTER TABLE moves DROP CONSTRAINT IF EXISTS moves_classification_check;
ALTER TABLE moves ADD CONSTRAINT moves_classification_check
  CHECK (classification IN ('best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'brilliant'));
