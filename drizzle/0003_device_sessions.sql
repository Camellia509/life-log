ALTER TABLE `sessions` ADD `id` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_id_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `device_label` text DEFAULT '旧设备' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_agent_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_used_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `revoked_at` integer;--> statement-breakpoint
UPDATE `sessions`
SET `id` = lower(hex(randomblob(16))),
    `created_at` = CASE WHEN `expires` > 604800000 THEN `expires` - 604800000 ELSE 0 END,
    `last_used_at` = CASE WHEN `expires` > 604800000 THEN `expires` - 604800000 ELSE 0 END
WHERE `id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_public_id` ON `sessions` (`id`);--> statement-breakpoint
CREATE INDEX `sessions_user_active` ON `sessions` (`user_id`,`revoked_at`,`expires`);--> statement-breakpoint
CREATE INDEX `sessions_device` ON `sessions` (`user_id`,`device_id_hash`);
