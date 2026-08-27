CREATE TABLE `cart_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`slot` integer NOT NULL,
	`label` text NOT NULL,
	`asset_id` text,
	`color` text DEFAULT '#496042' NOT NULL,
	`hotkey` text,
	`requires_confirmation` integer DEFAULT true NOT NULL,
	`created_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`updated_at_utc` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL,
	`archived_at_utc` text,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `audio_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_assignments_slot_idx` ON `cart_assignments` (`station_id`,`slot`);