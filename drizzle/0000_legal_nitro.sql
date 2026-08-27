CREATE TABLE `aggregate_metrics` (
	`station_id` text NOT NULL,
	`date_utc` text NOT NULL,
	`connection_count` integer DEFAULT 0 NOT NULL,
	`peak_concurrent` integer DEFAULT 0 NOT NULL,
	`duration_buckets_json` text DEFAULT '{}' NOT NULL,
	`delivery_failures` integer DEFAULT 0 NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	PRIMARY KEY(`station_id`, `date_utc`)
);
--> statement-breakpoint
CREATE TABLE `audio_asset_tags` (
	`station_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`asset_id`, `tag`),
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `audio_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audio_asset_tags_filter_idx` ON `audio_asset_tags` (`station_id`,`tag`);--> statement-breakpoint
CREATE TABLE `audio_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`album` text,
	`show_name` text,
	`description` text,
	`year` integer,
	`track_number` integer,
	`explicit_content` integer DEFAULT false NOT NULL,
	`rights_source_note` text,
	`internal_notes` text,
	`artwork_key` text,
	`replay_gain_note` text,
	`availability` text DEFAULT 'AVAILABLE' NOT NULL,
	`compatibility` text DEFAULT 'REVIEW' NOT NULL,
	`compatibility_reason` text,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`duration_seconds` real,
	`object_key` text NOT NULL,
	`checksum` text,
	`original_filename` text,
	`uploaded_at_utc` text NOT NULL,
	`last_validated_at_utc` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audio_assets_station_title_idx` ON `audio_assets` (`station_id`,`title`);--> statement-breakpoint
CREATE INDEX `audio_assets_availability_idx` ON `audio_assets` (`station_id`,`availability`);--> statement-breakpoint
CREATE INDEX `audio_assets_checksum_idx` ON `audio_assets` (`station_id`,`checksum`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`operator_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`before_json` text,
	`after_json` text,
	`correlation_id` text NOT NULL,
	`created_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_date_idx` ON `audit_log` (`station_id`,`created_at_utc`);--> statement-breakpoint
CREATE TABLE `clock_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`clock_id` text NOT NULL,
	`position` integer NOT NULL,
	`slot_type` text NOT NULL,
	`duration_seconds` integer,
	`asset_id` text,
	`pool_json` text,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`clock_id`) REFERENCES `program_clocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `audio_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clock_slots_position_idx` ON `clock_slots` (`clock_id`,`position`);--> statement-breakpoint
CREATE TABLE `live_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`operator_id` text NOT NULL,
	`status` text NOT NULL,
	`provider_session_id` text,
	`started_at_utc` text,
	`ended_at_utc` text,
	`resume_rule` text,
	`failure_category` text,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text
);
--> statement-breakpoint
CREATE TABLE `on_air_events` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`transition_id` text NOT NULL,
	`revision` integer NOT NULL,
	`mode` text NOT NULL,
	`item_id` text,
	`occurred_at_utc` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `on_air_events_transition_idx` ON `on_air_events` (`station_id`,`transition_id`);--> statement-breakpoint
CREATE INDEX `on_air_events_lookup_idx` ON `on_air_events` (`station_id`,`occurred_at_utc`);--> statement-breakpoint
CREATE TABLE `operators` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`display_name` text,
	`email_hash` text,
	`last_seen_at_utc` text,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `operators_station_idx` ON `operators` (`station_id`);--> statement-breakpoint
CREATE TABLE `playlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`asset_id` text,
	`position` integer NOT NULL,
	`item_type` text DEFAULT 'FIXED' NOT NULL,
	`rotation_pool_json` text,
	`segue_type` text DEFAULT 'hard' NOT NULL,
	`segue_seconds` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`revision_id`) REFERENCES `playlist_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `audio_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playlist_items_membership_idx` ON `playlist_items` (`revision_id`,`position`);--> statement-breakpoint
CREATE INDEX `playlist_items_asset_idx` ON `playlist_items` (`asset_id`);--> statement-breakpoint
CREATE TABLE `playlist_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text DEFAULT 'DRAFT' NOT NULL,
	`total_duration_seconds` real,
	`created_by_operator_id` text,
	`published_at_utc` text,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_revisions_number_idx` ON `playlist_revisions` (`playlist_id`,`revision`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`active_revision_id` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlists_station_idx` ON `playlists` (`station_id`,`archived_at_utc`);--> statement-breakpoint
CREATE TABLE `program_clocks` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`duration_seconds` integer DEFAULT 3600 NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schedule_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`rule_id` text,
	`title` text NOT NULL,
	`playlist_revision_id` text,
	`start_at_utc` text NOT NULL,
	`end_at_utc` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `schedule_revisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_occurrences_range_idx` ON `schedule_occurrences` (`station_id`,`start_at_utc`,`end_at_utc`);--> statement-breakpoint
CREATE INDEX `schedule_occurrences_revision_idx` ON `schedule_occurrences` (`revision_id`);--> statement-breakpoint
CREATE TABLE `schedule_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text DEFAULT 'DRAFT' NOT NULL,
	`created_by_operator_id` text,
	`published_at_utc` text,
	`timeline_hash` text,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_revisions_number_idx` ON `schedule_revisions` (`schedule_id`,`revision`);--> statement-breakpoint
CREATE TABLE `schedule_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`title` text NOT NULL,
	`playlist_revision_id` text,
	`clock_id` text,
	`days_of_week_json` text DEFAULT '[]' NOT NULL,
	`local_start_time` text NOT NULL,
	`duration_seconds` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`end_behavior` text DEFAULT 'FALLBACK' NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`revision_id`) REFERENCES `schedule_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`playlist_revision_id`) REFERENCES `playlist_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clock_id`) REFERENCES `program_clocks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `schedule_rules_revision_idx` ON `schedule_rules` (`revision_id`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`name` text NOT NULL,
	`active_revision_id` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `station_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`program_id` text,
	`operator_id` text,
	`correlation_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at_utc` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `station_logs_date_idx` ON `station_logs` (`station_id`,`created_at_utc`);--> statement-breakpoint
CREATE INDEX `station_logs_type_idx` ON `station_logs` (`station_id`,`event_type`);--> statement-breakpoint
CREATE TABLE `station_runtime` (
	`station_id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at_utc` text NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `station_settings` (
	`station_id` text PRIMARY KEY NOT NULL,
	`history_visible` integer DEFAULT true NOT NULL,
	`default_fallback_asset_id` text,
	`default_fallback_playlist_id` text,
	`supported_upload_types_json` text DEFAULT '[]' NOT NULL,
	`max_upload_bytes` integer DEFAULT 536870912 NOT NULL,
	`default_transition` text DEFAULT 'hard' NOT NULL,
	`transition_seconds` real DEFAULT 0 NOT NULL,
	`sync_tolerance_seconds` real DEFAULT 3 NOT NULL,
	`history_retention_days` integer DEFAULT 30 NOT NULL,
	`metrics_retention_days` integer DEFAULT 90 NOT NULL,
	`explicit_content_notice` text,
	`rights_notice` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`call_sign` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`public_url` text,
	`accent_color` text DEFAULT '#8fc46f' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stations_call_sign_idx` ON `stations` (`call_sign`);--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`operator_id` text NOT NULL,
	`object_key` text NOT NULL,
	`r2_upload_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`duration_seconds` real,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`expires_at_utc` text NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text
);
--> statement-breakpoint
CREATE INDEX `upload_sessions_owner_idx` ON `upload_sessions` (`station_id`,`operator_id`,`status`);