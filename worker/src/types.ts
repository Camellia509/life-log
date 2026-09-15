export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  MINT_LOCAL_SETUP?: string;
  MINT_OWNER_EMAIL?: string;
  MINT_SETUP_TOKEN?: string;
}

export type JsonObject = Record<string, unknown>;

