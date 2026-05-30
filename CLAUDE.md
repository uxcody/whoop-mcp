# whoop-mcp

TypeScript MCP server giving Claude full read/write access to Whoop fitness data via Whoop's private iOS API. 48 tools, auto-refresh Cognito auth, zod-validated outputs.

## Stack
- TypeScript 6, Node 24+, MCP SDK 1.x
- Transport: stdio (local) or StreamableHTTP (hosted)
- Auth: Cognito tokens stored in `.env`, auto-refreshed via `src/whoop/token_manager.ts`

## Structure
- `src/tools/` — all 48 MCP tools
- `src/whoop/` — API client, auth, token store/manager
- `src/cli/` — setup wizard (`whoop-mcp auth`, `whoop-mcp deploy`)
- `src/scripts/` — bootstrap/rebootstrap auth scripts
- `src/schemas/` — zod schemas for all inputs/outputs
- `src/projections/` — data transformation helpers
- `tests/` — vitest test suite (176 tests)

## Commands
- Build: `npx tsc`
- Typecheck: `npx tsc --noEmit`
- Test: `npx vitest run`
- Dev (stdio): `npx tsx src/server.ts`
- Dev (HTTP): `npx tsx src/server-http.ts`

## Key files
- `TOOLS.md` — full reference for all 48 tools
- `WHOOP.md` — Whoop API notes and reverse-engineering context
- `.env.example` — required env vars (`WHOOP_IOS_BEARER_TOKEN`, `WHOOP_COGNITO_REFRESH_TOKEN`, `MCP_AUTH_TOKEN`)

## Notes
- `scripts` in `package.json` is intentionally empty — use `npx` or the `whoop-mcp` CLI directly
- `.env` files are written with `0o600` permissions (owner-only) since they hold long-lived Cognito tokens
- Uses Whoop's private iOS API (not the public OAuth API) — see README FAQ for context
