-- Migrate WHATSAPP rows to WEB, then shrink enum to WEB only.
UPDATE `Conversation` SET `source` = 'WEB' WHERE `source` = 'WHATSAPP';
ALTER TABLE `Conversation` MODIFY `source` ENUM('WEB') NOT NULL DEFAULT 'WEB';
