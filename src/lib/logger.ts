import winston from 'winston';
import path from 'path';
import fs from 'fs';

const IS_VERCEL = !!process.env.VERCEL;
const LOG_DIR   = process.env.LOG_DIR ?? path.join(process.cwd(), 'logs');

// Em ambiente local cria o diretório; na Vercel (read-only fs) apenas loga no console
if (!IS_VERCEL && !fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignora */ }
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level}: ${stack ?? message}${metaStr}`;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
  }),
];

// Arquivos de log apenas em ambiente local
if (!IS_VERCEL && fs.existsSync(LOG_DIR)) {
  transports.push(
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 7,
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logFormat
  ),
  transports,
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
