from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (registers the tables)
from app.db import Base, get_engine

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)

with get_engine().connect() as connection:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
