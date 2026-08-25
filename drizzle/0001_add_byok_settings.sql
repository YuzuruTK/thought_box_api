ALTER TABLE `generated_documents` ADD COLUMN `generation_provider` text;
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`ai_provider` text DEFAULT 'platform' NOT NULL,
	`encrypted_api_key` text,
	`api_key_iv` text,
	`api_key_version` integer,
	`api_key_hint` text,
	`api_key_status` text,
	`api_key_verified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_settings_user_id_idx` ON `user_settings` (`user_id`);