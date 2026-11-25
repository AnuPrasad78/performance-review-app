"""What the running code knows about its own migration chain.

The image ships alembic.ini and alembic/ beside the app package (the
migration job runs from the same image), so the code can always name the
schema revision it was built against and every revision it has a history for.
Read once per process: the chain cannot change underneath a running build.
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class MigrationChain:
    head: str
    known_revisions: frozenset[str]


@lru_cache
def migration_chain() -> MigrationChain:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    if head is None:  # pragma: no cover — an empty chain is a packaging error
        raise RuntimeError("the migration chain has no head revision")
    return MigrationChain(
        head=head,
        known_revisions=frozenset(
            revision.revision for revision in script.walk_revisions()
        ),
    )
