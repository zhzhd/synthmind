"""Sandbox tools — execute shell commands and Python code."""

import subprocess
import sys
import tempfile

from langchain_core.tools import tool
from api.sandbox import record_execution


@tool
def execute_command(command: str, workdir: str = "") -> str:
    """Execute a shell command and return its output.

    Use this for running terminal commands, scripts, or system operations.
    Commands run in a thread-specific working directory if set.

    Args:
        command: The shell command to execute.
        workdir: Working directory (injected by runtime, not from LLM).

    Returns:
        Combined stdout and stderr output.
    """
    import os as _os
    cwd = workdir if workdir else tempfile.gettempdir()
    # Ensure the directory exists
    _os.makedirs(cwd, exist_ok=True)
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=cwd,
        )
        output = result.stdout or ""
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        result_text = output.strip() or "(no output)"
        record_execution("command", command, result_text)
        return result_text
    except subprocess.TimeoutExpired:
        return "❌ Command timed out after 30 seconds."
    except Exception as e:
        return f"❌ Execution error: {e}"


@tool
def python_repl(code: str, workdir: str = "") -> str:
    """Execute Python code and return its output.

    Use this for calculations, data analysis, or any Python task.
    The code runs in an isolated subprocess.  print() output is captured.

    Args:
        code: Python code to execute.
        workdir: Working directory (injected by runtime, not from LLM).

    Returns:
        Printed output or the value of the last expression.
    """
    import ast
    import os as _os
    import traceback

    # Try to compile first to catch syntax errors
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"❌ Syntax error: {e}"

    cwd = workdir if workdir else tempfile.gettempdir()
    _os.makedirs(cwd, exist_ok=True)

    # Wrapper that captures prints and last expression
    wrapped = (
        "import sys, json, math, random, datetime, re, os\n"
        "from collections import Counter, defaultdict\n"
        "_output = []\n"
        "_print = print\n"
        "def print(*a, **kw):\n"
        "  _output.append(' '.join(str(x) for x in a))\n"
    )

    last_is_expr = False
    if tree.body:
        last = tree.body[-1]
        last_is_expr = isinstance(last, ast.Expr)

    if last_is_expr:
        expr_node = tree.body.pop()
        line = ast.unparse(expr_node.value)
        wrapped += code + "\n"
        wrapped += f"_output.append(str({line}))\n"
    else:
        wrapped += code + "\n"

    wrapped += "\n_print('\\n'.join(_output))"

    try:
        result = subprocess.run(
            [sys.executable, "-c", wrapped],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=cwd,
        )
        output = result.stdout or ""
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        result_text = output.strip() or "(no output)"
        record_execution("python", code, result_text)
        return result_text
    except subprocess.TimeoutExpired:
        return "❌ Code timed out after 15 seconds."
    except Exception as e:
        return f"❌ Error: {e}"
