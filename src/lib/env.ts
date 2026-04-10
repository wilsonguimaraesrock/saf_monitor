/**
 * Carrega variáveis de ambiente do .env.local para scripts Node
 * (Next.js faz isso automaticamente, mas scripts ts-node precisam chamar explicitamente)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
