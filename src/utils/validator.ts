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
    const itemSchema = data.length > 0 ? inferSchema(data[0]) : { type: 'string' };
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

export function parseJsonSafe(text: string): { data: unknown; error: string | null } {
  try {
    const data = JSON.parse(text);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}
