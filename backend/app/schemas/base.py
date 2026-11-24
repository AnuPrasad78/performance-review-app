"""Shared base for API wire models.

Internal fields are snake_case; over the wire every schema keys camelCase so
the TypeScript client consumes one naming convention. Defining the config once
here keeps every response model in sync without copying per-file settings.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
