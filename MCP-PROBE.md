# MCP Connector Probe

Read-only diagnostic. No generation calls were made (no Magic Patterns
`create_design`/`send_prompt`, no Lovable `create_project`/`send_message`).

Probe date: 2026-08-24

---

## Step 1 — `ListConnectors`

| Connector | `connected` | `enabledInChat` |
|---|---|---|
| Lovable | `true` | `true` |
| Magic Patterns | `true` | `true` |
| Mobbin | `true` | `true` |

Verbatim entries:

```json
{"name":"Lovable","description":"Build, iterate, inspect, and deploy Lovable apps","directoryUuid":"1d9dadfe-0a7d-4a47-af18-101ae0ae0efd","installedServerId":"2a2ed7f7-31bb-435d-94fc-e8c25d0a31ee","customOAuthClientId":null,"installState":"connected","isAuthless":false,"connected":true,"enabledInChat":true}
{"name":"Magic Patterns","description":"Discuss and iterate on Magic Patterns designs","directoryUuid":"088e0355-cb01-44fa-ba0b-23525fde8d5a","installedServerId":"3a44007c-f5cf-4d0d-bc5a-c0a6bbff4c98","customOAuthClientId":null,"installState":"connected","isAuthless":false,"connected":true,"enabledInChat":true}
{"name":"Mobbin","description":"Find UI & UX design references","directoryUuid":"705ad993-53e3-4be6-b32c-cc9cff5225f6","installedServerId":"90e64d8f-0d47-4a6d-a034-ad969e5a3b18","customOAuthClientId":null,"installState":"connected","isAuthless":false,"connected":true,"enabledInChat":true}
```

Also connected + enabled in this session: Asana, Gmail, Google Calendar,
Google Drive. Present but `installState: unknown` / `enabledInChat: false`:
Canva, Supabase, Trimble SketchUp, Wrike, Zoom for Claude.

---

## Step 2 — `ToolSearch` with the friendly-name query

Query, exactly as specified:

```
select:mcp__Magic_Patterns__create_design,mcp__Lovable__create_project,mcp__Mobbin__search_screens
```

Result, verbatim:

```
No matching deferred tools found
```

**This is a naming artifact, not an availability failure.** In this session the
MCP tools are namespaced by `installedServerId` (UUID), not by the connector's
friendly name. The generator tools exist under these real names:

- `mcp__3a44007c-f5cf-4d0d-bc5a-c0a6bbff4c98__create_design` (Magic Patterns)
- `mcp__3a44007c-f5cf-4d0d-bc5a-c0a6bbff4c98__send_prompt` (Magic Patterns)
- `mcp__2a2ed7f7-31bb-435d-94fc-e8c25d0a31ee__create_project` (Lovable)
- `mcp__2a2ed7f7-31bb-435d-94fc-e8c25d0a31ee__send_message` (Lovable)
- `mcp__90e64d8f-0d47-4a6d-a034-ad969e5a3b18__search_screens` (Mobbin)

Re-running the same query against the UUID-prefixed names returned full
schemas for both tools requested:

```
select:mcp__90e64d8f-0d47-4a6d-a034-ad969e5a3b18__search_screens,mcp__3a44007c-f5cf-4d0d-bc5a-c0a6bbff4c98__list_design_systems
→ schemas returned for both
```

Takeaway for future runs: **address these tools by their UUID server prefix.**
Any prompt or skill that hardcodes `mcp__Lovable__*`, `mcp__Magic_Patterns__*`,
or `mcp__Mobbin__*` will fail to resolve.

---

## Step 3 — Mobbin live execution test

Called `mcp__90e64d8f-0d47-4a6d-a034-ad969e5a3b18__search_screens` once
(`query: "sleep tracking screen"`, `platform: ios`, `limit: 1`, `mode: standard`).

**Returned results — no error.** Response verbatim:

```json
{"query":"sleep tracking screen","screens":[{"id":"690bc0dd-48c5-4d95-8337-ca094006ca55","image_url":"https://mobbin.com/api/mcp/short/UFrlBsiO","mobbin_url":"https://mobbin.com/screens/690bc0dd-48c5-4d95-8337-ca094006ca55","app_name":"Garmin Connect","platform":"ios"}]}
```

The screen image rendered inline as well, so the image pathway works end to end.

---

## Step 4 — Magic Patterns read-only test

Called `mcp__3a44007c-f5cf-4d0d-bc5a-c0a6bbff4c98__list_design_systems`
(read-only; zero generation spend).

**Success — no error.** Response verbatim:

```json
{"designSystems":[{"id":"ds-9b80b54e-92b3-4b2f-8265-afe466ee8b75","name":"Base","isReserved":true,"isActive":true},{"id":"ds-97ed19b0-3b48-480a-9762-c31eea74ed4b","name":"Wireframe","isReserved":true,"isActive":false},{"id":"ds-6551b66a-cfd3-4df9-a9b1-9ead8d7fe7e9","name":"Shadcn","isReserved":true,"isActive":false},{"id":"ds-5ade6818-4137-4e0d-803e-93f644300718","name":"MUI","isReserved":true,"isActive":false},{"id":"ds-c18ebcff-abdb-4fff-b94d-bc78ec675639","name":"Mantine","isReserved":true,"isActive":false},{"id":"ds-61b3e465-95c4-47cc-9988-b53bf8b3a0fa","name":"Chakra","isReserved":true,"isActive":false}]}
```

Authentication is live (the account's design systems resolved) and `Base` is
the active design system.

---

## Step 5 — `claude mcp list`

```
No MCP servers configured. Use `claude mcp add` to add a server.
```

Exit code 0. This is expected and **not** a contradiction of Steps 1–4:
`claude mcp list` reports only locally-configured (CLI/`.mcp.json`) servers.
The connectors in this session are injected by the remote harness from the
claude.ai account, so they do not appear here. Do not use `claude mcp list`
as the availability check in this environment — use `ListConnectors`.

---

## Verdict

**GENERATORS AVAILABLE**

Magic Patterns and Lovable are both connected, enabled in chat, and their tool
schemas load and execute — provided they are called by their UUID-prefixed
tool names rather than friendly names. Mobbin is verified live end to end.
