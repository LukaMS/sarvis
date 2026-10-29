// Shared, platform-neutral code for the app, the pipeline and edge functions (D-007).

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './db/database.types.ts';

export * from './gtin.ts';
export * from './price.ts';
export * from './records/index.ts';
export * from './runs.ts';
export * from './slug.ts';
export * from './text.ts';
export * from './validation/index.ts';

export const APP_NAME = 'Sarvis';
