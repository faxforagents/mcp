#!/usr/bin/env python3
"""Copy MCP definitions from a local product checkout without contacting the hosted server.

Run with the product's Python environment and pass its checkout path. No files in that
checkout are written. The npm package and its tests do not need Python or the checkout.
"""

import asyncio
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True
source = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(source / "src"))

from faxforagents.mcp import guide  # noqa: E402
from faxforagents.mcp.tools import Runtime, build_server  # noqa: E402

root = Path(__file__).resolve().parents[1]
server = build_server(Runtime(api_for=lambda ctx: None, no_key_hint="unused"))
tools = [
    tool.model_dump(by_alias=True, exclude_none=True)
    for tool in asyncio.run(server.list_tools())
]
assert len(tools) == 17
assert {"get_fax_document", "request_card_payment", "get_card_payment_status"} <= {tool["name"] for tool in tools}
assert "get_document" not in {tool["name"] for tool in tools}


def write_json(path, value, *, sort_keys=False):
    (root / path).write_text(json.dumps(value, indent=2, sort_keys=sort_keys) + "\n")


provenance = {
    "captured_at": date.today().isoformat(),
    "source": "Local Python source: src/faxforagents/mcp/{tools,schemas,guide}.py (no hosted request)",
    "source_sha256": {
        name: hashlib.sha256((source / "src/faxforagents/mcp" / name).read_bytes()).hexdigest()
        for name in ("tools.py", "schemas.py", "guide.py")
    },
}
write_json("test/hosted-tools.json", {**provenance, "tools": tools})
write_json("src/tool-definitions.json", {
    "source": "scripts/import-hosted.py from the product's mcp/tools.py",
    "tools": {tool["name"]: {k: v for k, v in tool.items() if k != "outputSchema"} for tool in tools},
})
write_json("src/output-schemas.json", {
    "source": "scripts/export-mcp-output-schemas.py",
    "tools": {tool["name"]: tool["outputSchema"] for tool in tools},
}, sort_keys=True)

plugin = json.loads((root / "lhm.plugin.json").read_text())
plugin["tools"] = tools
write_json("lhm.plugin.json", plugin)

guide_path = root / "src/guide.ts"
existing = guide_path.read_text()
suffix = existing[existing.index("export const GUIDE_TEXT"):]
sections = []
for name, text in guide.SECTIONS.items():
    text = text.replace("FFA_API_KEY", "FAXFORAGENTS_API_KEY")
    text = text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
    if name == "overview":
        text = text.replace(f"MCP server {guide.__version__}:", "MCP server ${VERSION}:", 1)
    sections.append(f"  {name}: `{text}`,")
guide_path.write_text(
    "/** Copied from the hosted mcp/guide.py. Only the package version and stdio key name differ. */\n\n"
    "import { VERSION } from './version.js';\n\n"
    "export const SECTIONS: Record<string, string> = {\n"
    + "\n".join(sections) + "\n};\n\n" + suffix
)
print(f"Imported {len(tools)} tool definitions, output schemas, snapshot, plugin tools and guide from Python source")
