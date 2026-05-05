"""File read tool."""

from langchain_core.tools import tool


@tool
def read_file(path: str) -> str:
    """Read the contents of a text file.

    Args:
        path: Absolute path to the file.

    Returns:
        File contents as a string.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error: {e}"
