CREATE TABLE `ai_usage` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `generation_type` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `status` text NOT NULL,
  `input_tokens` integer,
  `output_tokens` integer,
  `total_tokens` integer,
  `tokens_estimated` integer NOT NULL DEFAULT 1,
  `error_status` integer,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX `ai_usage_user_id_idx` ON `ai_usage` (`user_id`);
CREATE INDEX `ai_usage_created_at_idx` ON `ai_usage` (`created_at`);
CREATE INDEX `ai_usage_provider_idx` ON `ai_usage` (`provider`);
CREATE INDEX `ai_usage_generation_type_idx` ON `ai_usage` (`generation_type`);
