// ============ Input Schema Types & Validation ============

export const VALID_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "file",
  "url",
  "boolean",
] as const;

export type FieldType = (typeof VALID_FIELD_TYPES)[number];

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface InputField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  description?: string;
  validation?: FieldValidation;
  // select
  options?: string[];
  default?: string | number | boolean;
  // file
  accept?: string;
}

export interface InputSchema {
  fields: InputField[];
  additionalNotes?: boolean;
}

/** Validate an agent's input schema definition. Returns null if valid, error string otherwise. */
export function validateInputSchema(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null; // nullable

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return "inputSchema must be an object";
  }

  const schema = raw as Record<string, unknown>;

  if (!Array.isArray(schema.fields)) {
    return "inputSchema.fields must be an array";
  }

  if (schema.fields.length > 50) {
    return "inputSchema.fields must have 50 or fewer entries";
  }

  const names = new Set<string>();

  for (let i = 0; i < schema.fields.length; i++) {
    const field = schema.fields[i];
    if (typeof field !== "object" || field === null || Array.isArray(field)) {
      return `inputSchema.fields[${i}] must be an object`;
    }

    const f = field as Record<string, unknown>;

    // name
    if (typeof f.name !== "string" || f.name.length === 0 || f.name.length > 100) {
      return `inputSchema.fields[${i}].name must be a non-empty string (max 100 chars)`;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(f.name)) {
      return `inputSchema.fields[${i}].name must be alphanumeric with underscores/hyphens`;
    }
    if (names.has(f.name)) {
      return `Duplicate field name: "${f.name}"`;
    }
    names.add(f.name);

    // label
    if (typeof f.label !== "string" || f.label.length === 0 || f.label.length > 200) {
      return `inputSchema.fields[${i}].label must be a non-empty string (max 200 chars)`;
    }

    // type
    if (!VALID_FIELD_TYPES.includes(f.type as FieldType)) {
      return `inputSchema.fields[${i}].type must be one of: ${VALID_FIELD_TYPES.join(", ")}`;
    }

    // select must have options
    if (f.type === "select") {
      if (!Array.isArray(f.options) || f.options.length === 0) {
        return `inputSchema.fields[${i}] (select) must have a non-empty options array`;
      }
      if (!f.options.every((o: unknown) => typeof o === "string")) {
        return `inputSchema.fields[${i}].options must all be strings`;
      }
    }

    // optional string fields
    if (f.placeholder !== undefined && typeof f.placeholder !== "string") {
      return `inputSchema.fields[${i}].placeholder must be a string`;
    }
    if (f.description !== undefined && typeof f.description !== "string") {
      return `inputSchema.fields[${i}].description must be a string`;
    }
    if (f.accept !== undefined && typeof f.accept !== "string") {
      return `inputSchema.fields[${i}].accept must be a string`;
    }

    // validation sub-object
    if (f.validation !== undefined) {
      if (typeof f.validation !== "object" || f.validation === null) {
        return `inputSchema.fields[${i}].validation must be an object`;
      }
      const v = f.validation as Record<string, unknown>;
      for (const key of Object.keys(v)) {
        if (!["minLength", "maxLength", "min", "max", "pattern"].includes(key)) {
          return `inputSchema.fields[${i}].validation has unknown key: ${key}`;
        }
        if (["minLength", "maxLength", "min", "max"].includes(key) && typeof v[key] !== "number") {
          return `inputSchema.fields[${i}].validation.${key} must be a number`;
        }
        if (key === "pattern" && typeof v[key] !== "string") {
          return `inputSchema.fields[${i}].validation.pattern must be a string`;
        }
      }
    }
  }

  if (schema.additionalNotes !== undefined && typeof schema.additionalNotes !== "boolean") {
    return "inputSchema.additionalNotes must be a boolean";
  }

  return null;
}

/** Validate filled-in task inputs against an agent's schema. Returns null if valid, error string otherwise. */
export function validateTaskInputs(
  inputs: unknown,
  schemaJson: string | null | undefined
): string | null {
  // No schema means no validation needed
  if (!schemaJson) return null;

  let schema: InputSchema;
  try {
    schema = JSON.parse(schemaJson) as InputSchema;
  } catch {
    // If the agent's schema is invalid JSON, skip validation
    return null;
  }

  if (!schema.fields || schema.fields.length === 0) return null;

  if (inputs === null || inputs === undefined) {
    // Check if there are any required fields
    const hasRequired = schema.fields.some((f) => f.required);
    if (hasRequired) {
      return "taskInputs is required — this agent has required input fields";
    }
    return null;
  }

  if (typeof inputs !== "object" || Array.isArray(inputs)) {
    return "taskInputs must be an object";
  }

  const data = inputs as Record<string, unknown>;

  for (const field of schema.fields) {
    const value = data[field.name];

    // Required check
    if (field.required) {
      if (value === undefined || value === null || value === "") {
        return `Required field "${field.label || field.name}" is missing`;
      }
    }

    // Skip further validation if value is not present
    if (value === undefined || value === null || value === "") continue;

    // Type-specific validation
    switch (field.type) {
      case "text":
      case "textarea":
      case "url":
      case "file": {
        if (typeof value !== "string") {
          return `Field "${field.name}" must be a string`;
        }
        const v = field.validation;
        if (v?.minLength && value.length < v.minLength) {
          return `Field "${field.label || field.name}" must be at least ${v.minLength} characters`;
        }
        if (v?.maxLength && value.length > v.maxLength) {
          return `Field "${field.label || field.name}" must be at most ${v.maxLength} characters`;
        }
        if (v?.pattern) {
          try {
            if (!new RegExp(v.pattern).test(value)) {
              return `Field "${field.label || field.name}" does not match required pattern`;
            }
          } catch {
            // Invalid pattern in schema, skip
          }
        }
        break;
      }
      case "number": {
        if (typeof value !== "number") {
          return `Field "${field.name}" must be a number`;
        }
        const v = field.validation;
        if (v?.min !== undefined && value < v.min) {
          return `Field "${field.label || field.name}" must be at least ${v.min}`;
        }
        if (v?.max !== undefined && value > v.max) {
          return `Field "${field.label || field.name}" must be at most ${v.max}`;
        }
        break;
      }
      case "select": {
        if (typeof value !== "string") {
          return `Field "${field.name}" must be a string`;
        }
        if (field.options && !field.options.includes(value)) {
          return `Field "${field.label || field.name}" must be one of: ${field.options.join(", ")}`;
        }
        break;
      }
      case "boolean": {
        if (typeof value !== "boolean") {
          return `Field "${field.name}" must be a boolean`;
        }
        break;
      }
    }
  }

  return null;
}

/** Parse a JSON input schema string, returning null if invalid */
export function parseInputSchema(json: string | null | undefined): InputSchema | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (validateInputSchema(parsed) !== null) return null;
    return parsed as InputSchema;
  } catch {
    return null;
  }
}
