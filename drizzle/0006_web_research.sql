ALTER TABLE `conversations` ADD `web_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`mode` text DEFAULT 'auto' NOT NULL,
	`backend` text NOT NULL,
	`model_id` text NOT NULL,
	`rounds` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`status_text` text,
	`round` integer DEFAULT 0 NOT NULL,
	`sources_count` integer DEFAULT 0 NOT NULL,
	`report` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer
);
