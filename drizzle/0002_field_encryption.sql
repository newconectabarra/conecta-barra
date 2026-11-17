-- Envelopes por campo: o conteúdo permanece no servidor somente em ciphertext autenticado.
-- Execute via `npm run db:push` ou aplique este SQL uma única vez no TiDB/MySQL.
ALTER TABLE users ADD COLUMN encryptedData TEXT NULL;
ALTER TABLE resident_credentials ADD COLUMN encryptedData TEXT NULL;
ALTER TABLE requests ADD COLUMN encryptedData TEXT NULL;
ALTER TABLE request_updates ADD COLUMN encryptedData TEXT NULL;
ALTER TABLE suggestions ADD COLUMN encryptedData TEXT NULL;
ALTER TABLE app_notifications ADD COLUMN encryptedData TEXT NULL;
ALTER TABLE email_verification_codes ADD COLUMN encryptedData TEXT NULL;
ALTER TABLE backup_snapshots ADD COLUMN encryptedData TEXT NULL;
