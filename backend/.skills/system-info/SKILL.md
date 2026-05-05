---
name: system-info
description: Get system information (OS, CPU, memory, disk)
author: built-in
version: 1.0.0
---

# System Info Skill

When the user asks about their system, hardware, or performance, use
the available tools to gather and summarize system information.

## Instructions

1. Use the `get_current_time` tool to check the current time.
2. Use `python3` in the shell to gather system info:

   ```python
   import platform, os, json
   info = {
       "system": platform.system(),
       "release": platform.release(),
       "version": platform.version(),
       "machine": platform.machine(),
       "processor": platform.processor(),
       "cpu_count": os.cpu_count(),
   }
   print(json.dumps(info, indent=2))
   ```

3. Present the information in a human-readable summary.
