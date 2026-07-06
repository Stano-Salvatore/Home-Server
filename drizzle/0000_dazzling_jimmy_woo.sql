CREATE TABLE `brain_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`token_count` integer NOT NULL,
	`embedding` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `brain_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brain_chunks_document_idx` ON `brain_chunks` (`document_id`);--> statement-breakpoint
CREATE TABLE `brain_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_path` text NOT NULL,
	`title` text NOT NULL,
	`content_hash` text NOT NULL,
	`indexed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brain_documents_source_path_idx` ON `brain_documents` (`source_path`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'New Chat' NOT NULL,
	`backend` text NOT NULL,
	`model_id` text NOT NULL,
	`system_prompt` text,
	`rag_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`kind` text NOT NULL,
	`thumbnail_path` text,
	`brain_document_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`brain_document_id`) REFERENCES `brain_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `library_books` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`format` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`cover_path` text,
	`text_extracted` integer DEFAULT false NOT NULL,
	`brain_document_id` text,
	`file_hash` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`brain_document_id`) REFERENCES `brain_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_books_file_path_idx` ON `library_books` (`file_path`);--> statement-breakpoint
CREATE TABLE `llamacpp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model_path` text NOT NULL,
	`port` integer NOT NULL,
	`extra_args` text,
	`tmux_session` text,
	`status` text DEFAULT 'stopped' NOT NULL,
	`pid` integer,
	`last_started_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`category` text,
	`source` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`citations_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`trigger_source` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`output` text,
	`error` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_runs_task_idx` ON `task_runs` (`task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`backend` text NOT NULL,
	`model_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`cron_expression` text,
	`watch_path` text,
	`watch_glob` text,
	`save_to_vault` integer DEFAULT false NOT NULL,
	`vault_filename_template` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
