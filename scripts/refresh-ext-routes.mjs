#!/usr/bin/env node
// ISSUE - 672: regenerate src/__tests__/fixtures/ext-routes.json, the snapshot of
// anydb-server's ext API that the drift tests check the MCP tools against.
//
// The server's EXT_API_OPENAPI.yaml documents a fraction of the routes, so the
// source of truth is the controller itself: each @route and the express-validator
// chain in its @validate block. Run it from this repo after any anydb-server change
// to src/modules/integrations/ext/ext.controller.ts, and commit the result:
//
//   node scripts/refresh-ext-routes.mjs [path/to/anydb-server]
//
// The server path defaults to the sibling checkout ../anydb-server. Read it from the
// commit you mean to match (normally origin/main), not from a feature branch.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(process.argv[2] ?? join(here, "..", "..", "anydb-server"));
const controllerPath = join(serverRoot, "src/modules/integrations/ext/ext.controller.ts");
const source = readFileSync(controllerPath, "utf8");

const base = source.match(/@controller\("([^"]+)"\)/)?.[1];
if (!base) throw new Error(`No @controller base path in ${controllerPath}`);

const routes = [];
const routeRe = /@route\("([A-Z]+)",\s*"([^"]+)"\)/g;
for (let m; (m = routeRe.exec(source)); ) {
  // The decorators for one handler run from @route to the method itself.
  const rest = source.slice(m.index + m[0].length);
  const handler = rest.search(/\n\s*(public\s+)?async\s+\w+\s*\(/);
  const decorators = handler < 0 ? rest : rest.slice(0, handler);
  const validate = decorators.match(/@validate\(\[([\s\S]*)\]\)/);
  let params = null;
  if (validate) {
    params = {};
    // One chunk per validator chain: query("x")..., body("x")..., param("x")...
    for (const chain of validate[1].split(/(?=\b(?:query|body|param)\(")/)) {
      const v = chain.match(/^(query|body|param)\("([^"]+)"\)/);
      if (!v) continue;
      const [, where, field] = v;
      const name = field.split(/[.[]/)[0];
      const own = name === field;
      const optional = /\.optional\(|\.default\(|\.if\(/.test(chain);
      const prev = params[name];
      // A nested rule (body("type.name")) never makes its parent required.
      params[name] = {
        in: where,
        optional: prev ? (own ? optional : prev.optional) : own ? optional : true,
      };
    }
  }
  routes.push({ method: m[1], path: `${base}${m[2]}`.replace(/^\/api/, ""), params });
}

routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
const out = join(here, "..", "src/__tests__/fixtures/ext-routes.json");
writeFileSync(out, JSON.stringify(routes, null, 2) + "\n");
console.log(`${routes.length} routes from ${controllerPath} -> ${out}`);
