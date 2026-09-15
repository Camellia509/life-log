DROP TABLE IF EXISTS `_single_user_guard`;--> statement-breakpoint
CREATE TABLE `_single_user_guard` (
	`count` integer NOT NULL CHECK (`count` <= 1)
);
--> statement-breakpoint
INSERT INTO `_single_user_guard` (`count`) SELECT COUNT(*) FROM `users`;--> statement-breakpoint
DROP TABLE `_single_user_guard`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
DROP TABLE `invites`;--> statement-breakpoint
DROP TABLE `shares`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_habits` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_habits`("id", "payload", "revision") SELECT "id", "payload", "revision" FROM `habits`;--> statement-breakpoint
DROP TABLE `habits`;--> statement-breakpoint
ALTER TABLE `__new_habits` RENAME TO `habits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_records`("id", "kind", "date", "payload", "revision", "updated") SELECT "id", "kind", "date", "payload", "revision", "updated" FROM `records`;--> statement-breakpoint
DROP TABLE `records`;--> statement-breakpoint
ALTER TABLE `__new_records` RENAME TO `records`;--> statement-breakpoint
CREATE INDEX `records_date` ON `records` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_daily_record` ON `records` (`kind`,`date`) WHERE kind IN ('sleep','meal');--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `role`;--> statement-breakpoint
PRAGMA optimize;
