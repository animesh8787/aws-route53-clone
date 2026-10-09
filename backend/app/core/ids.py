"""AWS-style public identifiers (``hc-0a1b...``, ``rslvr-in-...``)."""
import secrets

_ALPHABET = "0123456789abcdef"


def new_id(prefix: str, length: int = 17) -> str:
    return f"{prefix}-" + "".join(secrets.choice(_ALPHABET) for _ in range(length))
