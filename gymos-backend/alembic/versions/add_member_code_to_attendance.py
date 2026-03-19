"""add member_code to raw_punches and attendance

Revision ID: a1b2c3d4e5f6
Revises: 28cb7e4fc7a5
Create Date: 2026-03-13
"""

from alembic import op
from sqlalchemy import text

revision = "a1b2c3d4e5f6"
down_revision = "28cb7e4fc7a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add columns if not already exist
    conn.execute(text(
        "ALTER TABLE raw_punches ADD COLUMN IF NOT EXISTS member_code VARCHAR(50)"
    ))
    conn.execute(text(
        "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS member_code VARCHAR(50)"
    ))

    # 2. Backfill existing rows from members table
    conn.execute(text(
        "UPDATE raw_punches rp "
        "SET member_code = m.member_code "
        "FROM members m "
        "WHERE m.id = rp.member_id "
        "AND rp.member_code IS NULL"
    ))
    conn.execute(text(
        "UPDATE attendance a "
        "SET member_code = m.member_code "
        "FROM members m "
        "WHERE m.id = a.member_id "
        "AND a.member_code IS NULL"
    ))

    # 3. Indexes for fast lookup by member_code
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_raw_punches_member_code "
        "ON raw_punches(member_code)"
    ))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_attendance_member_code "
        "ON attendance(member_code)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DROP INDEX IF EXISTS ix_raw_punches_member_code"))
    conn.execute(text("DROP INDEX IF EXISTS ix_attendance_member_code"))
    conn.execute(text("ALTER TABLE raw_punches DROP COLUMN IF EXISTS member_code"))
    conn.execute(text("ALTER TABLE attendance DROP COLUMN IF EXISTS member_code"))