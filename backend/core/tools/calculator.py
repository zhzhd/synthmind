"""Calculator tool — evaluates mathematical expressions."""

import math
from langchain_core.tools import tool


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression.

    Supports: +, -, *, /, **, //, %, and math functions (sin, cos, sqrt, log...).

    Args:
        expression: A mathematical expression string, e.g. "2 ** 10".

    Returns:
        The computed result as a string.
    """
    allowed = {k: v for k, v in math.__dict__.items() if not k.startswith("_")}
    allowed["__builtins__"] = {}
    try:
        return str(eval(expression, allowed, {}))
    except Exception as e:
        return f"Error: {e}"
