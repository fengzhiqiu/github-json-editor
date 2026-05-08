import Ajv, { ErrorObject } from 'ajv';
import { JsonSchema } from '../types';

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateJson(data: unknown, schema?: JsonSchema): { valid: boolean; errors: string[] } {
  if (!schema) {
    // If no schema, just check if it's valid JSON
    return { valid: true, errors: [] };
  }

  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid && validate.errors) {
    const errors = validate.errors.map((err: ErrorObject) => {
      const path = err.instancePath || '/';
      return `${path}: ${err.message}`;
    });
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

export function inferSchema(data: unknown): JsonSchema {
  if (data === null || data === undefined) {
    return { type: 'null' };
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return { type: 'array', items: { type: 'string' } };
    }
    // Merge schema from all items for better coverage
    const itemSchema = inferItemSchema(data);
    return {
      type: 'array',
      items: itemSchema,
    };
  }

  if (typeof data === 'object') {
    const properties: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      properties[key] = inferSchema(value);
    }
    return {
      type: 'object',
      properties,
    };
  }

  if (typeof data === 'number') {
    return { type: 'number' };
  }

  if (typeof data === 'boolean') {
    return { type: 'boolean' };
  }

  return { type: 'string' };
}

// Infer schema for array items by merging all items' properties
function inferItemSchema(items: unknown[]): JsonSchema {
  if (items.length === 0) return { type: 'string' };

  // If items aren't objects, just use first item's type
  if (typeof items[0] !== 'object' || items[0] === null || Array.isArray(items[0])) {
    return inferSchema(items[0]);
  }

  // Merge all object keys to build a comprehensive schema
  const allProperties: Record<string, JsonSchema> = {};
  const keyCounts: Record<string, number> = {};

  for (const item of items) {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
        if (!allProperties[key]) {
          allProperties[key] = inferSchema(value);
          keyCounts[key] = 0;
        }
        keyCounts[key]++;
      }
    }
  }

  // Keys present in all items are required
  const required = Object.keys(keyCounts).filter(
    (key) => keyCounts[key] === items.length
  );

  return {
    type: 'object',
    properties: allProperties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export function parseJsonSafe(text: string): { data: unknown; error: string | null } {
  try {
    const data = JSON.parse(text);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}
