import type { SchemaField } from './types'

/** Roles allow shipyards to choose familiar names without fixed field keys. */
export function schemaRoleKey(schema: SchemaField[], role: NonNullable<SchemaField['role']>): string | undefined {
    const explicit = schema.find(field => field.role === role)
    if (explicit) return explicit.key
    if (role === 'identifier') { const key = schema.find(field => field.is_unique_key && !Object.hasOwn(field, 'role')); if (key) return key.key }
    const legacy = role === 'identifier' ? []
        : role === 'display_name' ? ['material_name', 'name', 'title'] : ['quantity']
    return legacy.map(key => schema.find(field => field.key === key && !Object.hasOwn(field, 'role') && (role !== 'identifier' || field.is_unique_key !== false) && (role !== 'quantity' || field.type === 'number'))).find(Boolean)?.key
}
