import { Sequelize } from 'sequelize';
import * as fs from 'fs';
import * as path from 'path';

/** Minimal .env loader (no dotenv dependency). Reads KEY=VALUE lines. */
const loadEnv = (file: string): void => {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
};

loadEnv(path.join(__dirname, '..', '..', '.env'));
loadEnv(path.join(process.cwd(), '.env'));

export type DbConfig = {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
};

export const readDbConfig = (): DbConfig => ({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  name: process.env.DB_NAME || 'snack_counter',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
});

/** Create a Sequelize instance bound to MySQL. Does not connect until used. */
export const createSequelize = (): Sequelize => {
  const cfg = readDbConfig();
  return new Sequelize(cfg.name, cfg.user, cfg.password, {
    host: cfg.host,
    port: cfg.port,
    dialect: 'mysql',
    logging: false,
    define: {
      underscored: true,
      timestamps: false,
    },
  });
};
