import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { ensureDefaults } from "./routes/channels";
import { loadBrandingCache } from "./services/mailer";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (process.env.NODE_ENV === "production") {
  if (process.env.AUTH_DEV_BYPASS === "true") {
    throw new Error("SECURITY FAULT: AUTH_DEV_BYPASS is prohibited in production builds and has been stripped.");
  }
} else if (process.env.AUTH_DEV_BYPASS === "true") {
  logger.warn("AUTH_DEV_BYPASS ENABLED — DEVELOPMENT ONLY. NEVER DEPLOY WITH THIS FLAG.");
}

async function migrateLegacyMerchantRoles() {
  if (!process.env.DATABASE_URL || !pool || typeof pool.query !== "function") {
    return;
  }

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) THEN
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        UPDATE users SET role = 'BUSINESS_OWNER' WHERE role = 'SUPER_ADMIN';
        UPDATE users SET role = 'BUSINESS' WHERE role = 'ADMIN';
        ALTER TABLE users
          ADD CONSTRAINT users_role_check
          CHECK (role IN ('CUSTOMER', 'BUSINESS', 'BUSINESS_OWNER', 'PLATFORM_ADMIN'));
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'team_members'
      ) THEN
        UPDATE team_members SET role = 'Business' WHERE role = 'Admin';
      END IF;
    END $$;
  `);
}

async function start() {
  await migrateLegacyMerchantRoles();

  await loadBrandingCache().catch((err) => {
    logger.error({ err }, "Failed to load branding cache during startup");
  });

  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

start().catch((error) => {
  logger.fatal({ err: error }, "Startup initialization failed");
  process.exit(1);
});
