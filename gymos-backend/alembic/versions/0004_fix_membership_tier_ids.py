"""Fix members FK: point to membership_tiers.tier_id instead of id (UUID)

Revision ID: 0004_fix_members_fk_to_tier_id
Revises: 0003_fix_membership_tier_ids
Create Date: 2026-03-12

ROOT CAUSE:
    membership_tiers ka actual PK = tier_id ('basic','silver','gold','platinum')
    membership_tiers.id = UUID (internal)
    
    Purana FK: members.membership_tier_id → membership_tiers.id (UUID) ← GALAT
    Sahi FK:   members.membership_tier_id → membership_tiers.tier_id  ← SAHI

FIX:
    1. Galat FK drop karo
    2. Members ke UUID-based tier values NULL karo
    3. Sahi FK banao → membership_tiers.tier_id
    4. Members ko 'basic' se set karo

HOW TO RUN:
    alembic upgrade head
"""

from alembic import op
from sqlalchemy import text

revision      = '0004_fix_members_fk_to_tier_id'
down_revision = 'fd6ff52ad66c'
branch_labels = None
depends_on    = None


def upgrade():
    bind = op.get_bind()

    # ── Step 1: Purana GALAT FK drop karo ────────────────────────
    bind.execute(text("""
        ALTER TABLE members
        DROP CONSTRAINT IF EXISTS members_membership_tier_id_fkey
    """))
    print("✅ Old FK dropped")

    # ── Step 2: Members mein jo UUID values hain unhe NULL karo ──
    # (kyunke woh ab invalid hain — tier_id text hona chahiye)
    bind.execute(text("""
        UPDATE members
        SET membership_tier_id = NULL
        WHERE membership_tier_id NOT IN (
            SELECT tier_id FROM membership_tiers WHERE tier_id IS NOT NULL
        )
        OR membership_tier_id IS NULL
    """))
    print("✅ Invalid UUID tier values cleared")

    # ── Step 3: Sab NULL members ko 'basic' set karo ─────────────
    bind.execute(text("""
        UPDATE members
        SET membership_tier_id = 'basic'
        WHERE membership_tier_id IS NULL
    """))
    print("✅ NULL tiers set to 'basic'")

    # ── Step 4: SAHI FK banao → tier_id column ───────────────────
    bind.execute(text("""
        ALTER TABLE members
        ADD CONSTRAINT members_membership_tier_id_fkey
        FOREIGN KEY (membership_tier_id)
        REFERENCES membership_tiers(tier_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
    """))
    print("✅ Correct FK created: members.membership_tier_id → membership_tiers.tier_id")
    print("✅ Migration complete! Ab fees save hogi bina error ke.")


def downgrade():
    bind = op.get_bind()
    bind.execute(text("""
        ALTER TABLE members
        DROP CONSTRAINT IF EXISTS members_membership_tier_id_fkey
    """))
    print("FK dropped — downgrade complete")