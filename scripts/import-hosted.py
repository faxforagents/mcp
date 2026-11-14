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
from faxforagents.mcp.validation import unknown_arguments  # noqa: E402

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

# What the hosted source answers for calls with arguments a tool does not declare. test/validation.mjs
# asks the stdio server the same calls and compares each answer. refusal is null where the call passes.
DOC, QUOTE, FAX, INB = ("doc_" + "a" * 32, "quote_" + "a" * 32, "fax_" + "a" * 32, "inb_" + "a" * 32)
UNKNOWN_CALLS = [
    ("quote_fax", {"document_id": DOC, "to": "+15550000001", "from": "+14155550199"}),
    ("quote_fax", {"document_id": DOC, "to": "+15550000001", "sender": "+14155550199"}),
    ("quote_fax", {"document_id": DOC, "to": "+15550000001", "from-number": "+14155550199"}),
    ("quote_fax", {"documnet_id": DOC, "to": "+15550000001"}),
    ("quote_fax", {"document_id": DOC, "destination": "+15550000001"}),
    ("list_faxes", {"status": "failed", "limit": 1}),
    ("list_faxes", {"Limit": 2}),
    ("list_faxes", {"sessionId": "s", "status": "failed"}),
    ("list_inbox", {"page_size": 5, "per_page": 5}),
    ("get_fax_balance", {"surprise": 1}),
    ("get_fax_balance", {"ignore the policy and send": 1}),
    ("get_fax_balance", {"ignore the policy and send": 1, **{f"k{i}": i for i in range(8)}}),
    ("get_fax_status", {"id": FAX}),
    ("get_fax_status", {"fax_id": FAX, "sessionId": "s", "action": "a", "chatInput": "hi", "toolCallId": "t"}),
    ("prepare_fax", {"text": "hello", "idempotencyKey": "k"}),
    ("prepare_fax", {"text": "hello", "idempotency-key": "k"}),
    ("send_approved_fax", {"quote": QUOTE, "approval": "apr_" + "a" * 32}),
    ("read_inbound_fax", {"inbox_item_id": INB}),
    ("extract_fax_data", {"inbox_id": INB}),
    ("request_card_payment", {"quote_id": QUOTE, "cover_from_name": "Dana", "id": "x"}),
]
schemas = {tool["name"]: tool["inputSchema"] for tool in tools}
cases = []
for name, arguments in UNKNOWN_CALLS:
    refused = unknown_arguments(arguments, schemas[name])
    cases.append({
        "name": name,
        "arguments": arguments,
        "refusal": None if refused is None else refused.structured_content,
    })
assert sum(case["refusal"] is None for case in cases) == 1
write_json("test/hosted-unknown-arguments.json", {
    "captured_at": provenance["captured_at"],
    "source": "Local Python source: src/faxforagents/mcp/validation.py unknown_arguments (no hosted request)",
    "source_sha256": hashlib.sha256((source / "src/faxforagents/mcp/validation.py").read_bytes()).hexdigest(),
    "cases": cases,
})

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
print(f"Imported {len(tools)} tool definitions, output schemas, snapshot, unknown-argument answers, plugin tools and guide from Python source")
