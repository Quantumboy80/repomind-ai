from pathlib import Path


def load_settings(config_path: str) -> dict[str, str]:
    """Return the minimal settings loaded from a configuration path."""
    return {"config": str(Path(config_path).name)}


class RepositoryIndex:
    def add_file(self, path: str) -> bool:
        return bool(path)
