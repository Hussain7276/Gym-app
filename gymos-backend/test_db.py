import sqlalchemy

DATABASE_URL = "postgresql+asyncpg://gymos_user:GymOS%4012345@localhost:5432/gymos_db"
engine = sqlalchemy.create_engine(DATABASE_URL.replace("asyncpg","psycopg2"))

with engine.connect() as conn:
    result = conn.execute("SELECT 1")
    print(result.fetchall())