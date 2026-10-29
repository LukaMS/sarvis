// Shared, platform-neutral code for the app, the pipeline and edge functions (D-007).

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './db/database.types';

export * from './gtin';
export * from './records';
export * from './runs';
export * from './slug';

export const APP_NAME = 'Sarvis';
