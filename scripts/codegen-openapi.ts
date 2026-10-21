#!/usr/bin/env bun
/**
 * codegen-openapi.ts
 *
 * Fetches the referee-core FastAPI OpenAPI spec from a running instance and
 * writes a TypeScript type file to lib/integrations/referee-core-openapi.ts.
 *
 * Usage:
 *   REFEREE_CORE_URL=http://localhost:8000 bun scripts/codegen-openapi.ts
 *
 * The generated file is informational — it documents the exact shape of every
 * request/response body from the Python engine.  Commit it alongside other
 * generated files and re-run after engine schema changes.
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.REFEREE_CORE_URL?.replace(/\/$/, '') ?? 'http://localhost:8000';

interface OpenAPISchema {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  $ref?: string;
  required?: string[];
  enum?: unknown[];
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  format?: string;
  default?: unknown;
}

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, {
    operationId?: string;
    summary?: string;
    requestBody?: { content?: { 'application/json'?: { schema?: OpenAPISchema } } };
    responses?: Record<string, { content?: { 'application/json'?: { schema?: OpenAPISchema } } }>;
  }>>;
  components?: { schemas?: Record<string, OpenAPISchema> };
}

function schemaToTs(schema: OpenAPISchema, components: Record<string, OpenAPISchema>, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (!schema) return 'unknown';

  if (schema.$ref) {
    const name = schema.$ref.split('/').pop() ?? 'unknown';
    return name;
  }

  if (schema.anyOf || schema.oneOf) {
    const union = (schema.anyOf ?? schema.oneOf ?? []).map(s => schemaToTs(s, components, indent));
    return union.join(' | ');
  }

  if (schema.allOf) {
    return schema.allOf.map(s => schemaToTs(s, components, indent)).join(' & ');
  }

  if (schema.enum) {
    return schema.enum.map(v => JSON.stringify(v)).join(' | ');
  }

  switch (schema.type) {
    case 'string': return 'string';
    case 'integer':
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    case 'array':
      return `Array<${schemaToTs(schema.items ?? {}, components, indent)}>`;
    case 'object': {
      if (!schema.properties) return 'Record<string, unknown>';
      const required = new Set(schema.required ?? []);
      const props = Object.entries(schema.properties).map(([k, v]) => {
        const opt = required.has(k) ? '' : '?';
        return `${pad}  ${k}${opt}: ${schemaToTs(v, components, indent + 1)}`;
      });
      return `{\n${props.join(';\n')};\n${pad}}`;
    }
    default:
      return 'unknown';
  }
}

async function main() {
  console.log(`Fetching OpenAPI spec from ${BASE_URL}/openapi.json ...`);
  
  let spec: OpenAPISpec;
  try {
    const res = await fetch(`${BASE_URL}/openapi.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    spec = await res.json() as OpenAPISpec;
  } catch (err) {
    console.error(`ERROR: Could not fetch spec — is referee-core running at ${BASE_URL}?`);
    console.error(err);
    process.exit(1);
  }

  const components = spec.components?.schemas ?? {};
  const lines: string[] = [
    '/**',
    ' * referee-core-openapi.ts',
    ' *',
    ` * AUTO-GENERATED from ${BASE_URL}/openapi.json`,
    ` * referee-core version: ${spec.info.version}`,
    ' *',
    ' * DO NOT EDIT MANUALLY — regenerate with:',
    ' *   REFEREE_CORE_URL=http://localhost:8000 bun scripts/codegen-openapi.ts',
    ' */',
    '',
    '// ── Component Schemas ──────────────────────────────────────────────────────',
    '',
  ];

  for (const [name, schema] of Object.entries(components)) {
    const doc = schema.description ? ` * ${schema.description}\n` : '';
    lines.push(`/**\n${doc} */`);
    lines.push(`export type ${name} = ${schemaToTs(schema, components)};`);
    lines.push('');
  }

  lines.push('// ── Endpoint Shapes ────────────────────────────────────────────────────────', '');

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (method === 'get') continue; // no request body on GETs
      const opId = op.operationId ?? `${method}_${path.replace(/\//g, '_').replace(/^_/, '')}`;
      const reqSchema = op.requestBody?.content?.['application/json']?.schema;
      const respSchema = op.responses?.['200']?.content?.['application/json']?.schema;

      if (reqSchema) {
        lines.push(`/** Request body for ${method.toUpperCase()} ${path} */`);
        lines.push(`export type ${opId}Request = ${schemaToTs(reqSchema, components)};`);
        lines.push('');
      }
      if (respSchema) {
        lines.push(`/** Response body for ${method.toUpperCase()} ${path} */`);
        lines.push(`export type ${opId}Response = ${schemaToTs(respSchema, components)};`);
        lines.push('');
      }
    }
  }

  const outPath = new URL('../../lib/integrations/referee-core-openapi.ts', import.meta.url).pathname.slice(1);
  fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`✅ Written to ${outPath}`);
  console.log(`   Schemas: ${Object.keys(components).length}`);
  console.log(`   Paths:   ${Object.keys(spec.paths).length}`);
}

main();
