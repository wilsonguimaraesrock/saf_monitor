// Redirecionado para db.ts — não usamos mais Supabase.
// Use src/lib/db.ts para todas as operações de banco.
export { query, queryOne, execute, withTransaction, getPool, healthCheck } from './db';
