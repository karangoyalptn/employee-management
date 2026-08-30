import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

load_dotenv(Path(__file__).parent / ".env")
DATABASE_URL = os.environ["DATABASE_URL"]
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=5,
    max_overflow=5,
    pool_recycle=1800,
    pool_pre_ping=False,
    connect_args={"statement_cache_size": 0, "command_timeout": 30},
)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with SessionLocal() as session:
        yield session