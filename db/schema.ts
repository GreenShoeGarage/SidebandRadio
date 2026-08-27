import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAtUtc: text("created_at_utc").notNull().default("1970-01-01T00:00:00.000Z"),
  updatedAtUtc: text("updated_at_utc").notNull().default("1970-01-01T00:00:00.000Z"),
  archivedAtUtc: text("archived_at_utc"),
};

export const stations = sqliteTable("stations", {
  id: text("id").primaryKey(), name: text("name").notNull(), callSign: text("call_sign").notNull(),
  description: text("description").notNull().default(""), timeZone: text("time_zone").notNull().default("UTC"),
  publicUrl: text("public_url"), accentColor: text("accent_color").notNull().default("#8fc46f"),
  schemaVersion: integer("schema_version").notNull().default(1), ...timestamps,
}, t => [uniqueIndex("stations_call_sign_idx").on(t.callSign)]);

export const stationSettings = sqliteTable("station_settings", {
  stationId: text("station_id").primaryKey().references(() => stations.id, { onDelete: "cascade" }),
  historyVisible: integer("history_visible", { mode: "boolean" }).notNull().default(true),
  defaultFallbackAssetId: text("default_fallback_asset_id"), defaultFallbackPlaylistId: text("default_fallback_playlist_id"),
  supportedUploadTypesJson: text("supported_upload_types_json").notNull().default("[]"), maxUploadBytes: integer("max_upload_bytes").notNull().default(536870912),
  defaultTransition: text("default_transition").notNull().default("hard"), transitionSeconds: real("transition_seconds").notNull().default(0),
  syncToleranceSeconds: real("sync_tolerance_seconds").notNull().default(3), historyRetentionDays: integer("history_retention_days").notNull().default(30),
  metricsRetentionDays: integer("metrics_retention_days").notNull().default(90), explicitContentNotice: text("explicit_content_notice"),
  rightsNotice: text("rights_notice"), schemaVersion: integer("schema_version").notNull().default(1), ...timestamps,
});

export const operators = sqliteTable("operators", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }),
  displayName: text("display_name"), emailHash: text("email_hash"), lastSeenAtUtc: text("last_seen_at_utc"), ...timestamps,
}, t => [index("operators_station_idx").on(t.stationId)]);

export const audioAssets = sqliteTable("audio_assets", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }),
  title: text("title").notNull(), artist: text("artist"), album: text("album"), showName: text("show_name"), description: text("description"),
  year: integer("year"), trackNumber: integer("track_number"), explicitContent: integer("explicit_content", { mode: "boolean" }).notNull().default(false),
  rightsSourceNote: text("rights_source_note"), internalNotes: text("internal_notes"), artworkKey: text("artwork_key"), replayGainNote: text("replay_gain_note"),
  availability: text("availability").notNull().default("AVAILABLE"), compatibility: text("compatibility").notNull().default("REVIEW"), compatibilityReason: text("compatibility_reason"),
  fileSize: integer("file_size").notNull(), mimeType: text("mime_type").notNull(), durationSeconds: real("duration_seconds"), objectKey: text("object_key").notNull(),
  checksum: text("checksum"), originalFilename: text("original_filename"), uploadedAtUtc: text("uploaded_at_utc").notNull(), lastValidatedAtUtc: text("last_validated_at_utc"),
  schemaVersion: integer("schema_version").notNull().default(1), ...timestamps,
}, t => [index("audio_assets_station_title_idx").on(t.stationId, t.title), index("audio_assets_availability_idx").on(t.stationId, t.availability), index("audio_assets_checksum_idx").on(t.stationId, t.checksum)]);

export const audioAssetTags = sqliteTable("audio_asset_tags", {
  stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }),
  assetId: text("asset_id").notNull().references(() => audioAssets.id, { onDelete: "cascade" }), tag: text("tag").notNull(),
}, t => [primaryKey({ columns: [t.assetId, t.tag] }), index("audio_asset_tags_filter_idx").on(t.stationId, t.tag)]);

export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }), name: text("name").notNull(),
  description: text("description").notNull().default(""), activeRevisionId: text("active_revision_id"), schemaVersion: integer("schema_version").notNull().default(1), ...timestamps,
}, t => [index("playlists_station_idx").on(t.stationId, t.archivedAtUtc)]);

export const playlistRevisions = sqliteTable("playlist_revisions", {
  id: text("id").primaryKey(), playlistId: text("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(), state: text("state").notNull().default("DRAFT"), totalDurationSeconds: real("total_duration_seconds"),
  createdByOperatorId: text("created_by_operator_id"), publishedAtUtc: text("published_at_utc"), ...timestamps,
}, t => [uniqueIndex("playlist_revisions_number_idx").on(t.playlistId, t.revision)]);

export const playlistItems = sqliteTable("playlist_items", {
  id: text("id").primaryKey(), revisionId: text("revision_id").notNull().references(() => playlistRevisions.id, { onDelete: "cascade" }),
  assetId: text("asset_id").references(() => audioAssets.id), position: integer("position").notNull(), itemType: text("item_type").notNull().default("FIXED"),
  rotationPoolJson: text("rotation_pool_json"), segueType: text("segue_type").notNull().default("hard"), segueSeconds: real("segue_seconds").notNull().default(0), notes: text("notes"), ...timestamps,
}, t => [index("playlist_items_membership_idx").on(t.revisionId, t.position), index("playlist_items_asset_idx").on(t.assetId)]);

export const programClocks = sqliteTable("program_clocks", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }), name: text("name").notNull(), description: text("description"),
  durationSeconds: integer("duration_seconds").notNull().default(3600), schemaVersion: integer("schema_version").notNull().default(1), ...timestamps,
});
export const clockSlots = sqliteTable("clock_slots", {
  id: text("id").primaryKey(), clockId: text("clock_id").notNull().references(() => programClocks.id, { onDelete: "cascade" }), position: integer("position").notNull(),
  slotType: text("slot_type").notNull(), durationSeconds: integer("duration_seconds"), assetId: text("asset_id").references(() => audioAssets.id), poolJson: text("pool_json"), ...timestamps,
}, t => [index("clock_slots_position_idx").on(t.clockId, t.position)]);

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }), name: text("name").notNull(),
  activeRevisionId: text("active_revision_id"), schemaVersion: integer("schema_version").notNull().default(1), ...timestamps,
});
export const scheduleRevisions = sqliteTable("schedule_revisions", {
  id: text("id").primaryKey(), scheduleId: text("schedule_id").notNull().references(() => schedules.id, { onDelete: "cascade" }), revision: integer("revision").notNull(),
  state: text("state").notNull().default("DRAFT"), createdByOperatorId: text("created_by_operator_id"), publishedAtUtc: text("published_at_utc"), timelineHash: text("timeline_hash"), ...timestamps,
}, t => [uniqueIndex("schedule_revisions_number_idx").on(t.scheduleId, t.revision)]);
export const scheduleRules = sqliteTable("schedule_rules", {
  id: text("id").primaryKey(), revisionId: text("revision_id").notNull().references(() => scheduleRevisions.id, { onDelete: "cascade" }), title: text("title").notNull(),
  playlistRevisionId: text("playlist_revision_id").references(() => playlistRevisions.id), clockId: text("clock_id").references(() => programClocks.id),
  daysOfWeekJson: text("days_of_week_json").notNull().default("[]"), localStartTime: text("local_start_time").notNull(), durationSeconds: integer("duration_seconds"),
  startDate: text("start_date").notNull(), endDate: text("end_date"), priority: integer("priority").notNull().default(0), endBehavior: text("end_behavior").notNull().default("FALLBACK"), ...timestamps,
}, t => [index("schedule_rules_revision_idx").on(t.revisionId)]);
export const scheduleOccurrences = sqliteTable("schedule_occurrences", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }), revisionId: text("revision_id").notNull().references(() => scheduleRevisions.id, { onDelete: "cascade" }),
  ruleId: text("rule_id"), title: text("title").notNull(), playlistRevisionId: text("playlist_revision_id"), startAtUtc: text("start_at_utc").notNull(), endAtUtc: text("end_at_utc").notNull(), priority: integer("priority").notNull().default(0), payloadJson: text("payload_json").notNull().default("{}"), ...timestamps,
}, t => [index("schedule_occurrences_range_idx").on(t.stationId, t.startAtUtc, t.endAtUtc), index("schedule_occurrences_revision_idx").on(t.revisionId)]);

export const stationRuntime = sqliteTable("station_runtime", {
  stationId: text("station_id").primaryKey().references(() => stations.id, { onDelete: "cascade" }), stateJson: text("state_json").notNull(), revision: integer("revision").notNull().default(0), updatedAtUtc: text("updated_at_utc").notNull(),
});
export const cartAssignments = sqliteTable("cart_assignments", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "cascade" }),
  slot: integer("slot").notNull(), label: text("label").notNull(), assetId: text("asset_id").references(() => audioAssets.id),
  color: text("color").notNull().default("#496042"), hotkey: text("hotkey"), requiresConfirmation: integer("requires_confirmation", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, t => [uniqueIndex("cart_assignments_slot_idx").on(t.stationId, t.slot)]);
export const uploadSessions = sqliteTable("upload_sessions", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull(), operatorId: text("operator_id").notNull(), objectKey: text("object_key").notNull(), r2UploadId: text("r2_upload_id").notNull(),
  filename: text("filename").notNull(), mimeType: text("mime_type").notNull(), fileSize: integer("file_size").notNull(), durationSeconds: real("duration_seconds"), status: text("status").notNull().default("OPEN"), expiresAtUtc: text("expires_at_utc").notNull(), ...timestamps,
}, t => [index("upload_sessions_owner_idx").on(t.stationId, t.operatorId, t.status)]);
export const onAirEvents = sqliteTable("on_air_events", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull(), transitionId: text("transition_id").notNull(), revision: integer("revision").notNull(), mode: text("mode").notNull(), itemId: text("item_id"), occurredAtUtc: text("occurred_at_utc").notNull(), payloadJson: text("payload_json").notNull().default("{}"),
}, t => [uniqueIndex("on_air_events_transition_idx").on(t.stationId, t.transitionId), index("on_air_events_lookup_idx").on(t.stationId, t.occurredAtUtc)]);
export const liveSessions = sqliteTable("live_sessions", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull(), operatorId: text("operator_id").notNull(), status: text("status").notNull(), providerSessionId: text("provider_session_id"), startedAtUtc: text("started_at_utc"), endedAtUtc: text("ended_at_utc"), resumeRule: text("resume_rule"), failureCategory: text("failure_category"), ...timestamps,
});
export const stationLogs = sqliteTable("station_logs", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull(), eventType: text("event_type").notNull(), message: text("message").notNull(), programId: text("program_id"), operatorId: text("operator_id"), correlationId: text("correlation_id").notNull(), metadataJson: text("metadata_json").notNull().default("{}"), createdAtUtc: text("created_at_utc").notNull(),
}, t => [index("station_logs_date_idx").on(t.stationId, t.createdAtUtc), index("station_logs_type_idx").on(t.stationId, t.eventType)]);
export const aggregateMetrics = sqliteTable("aggregate_metrics", {
  stationId: text("station_id").notNull(), dateUtc: text("date_utc").notNull(), connectionCount: integer("connection_count").notNull().default(0), peakConcurrent: integer("peak_concurrent").notNull().default(0), durationBucketsJson: text("duration_buckets_json").notNull().default("{}"), deliveryFailures: integer("delivery_failures").notNull().default(0), ...timestamps,
}, t => [primaryKey({ columns: [t.stationId, t.dateUtc] })]);
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(), stationId: text("station_id").notNull(), operatorId: text("operator_id"), action: text("action").notNull(), targetType: text("target_type").notNull(), targetId: text("target_id"), beforeJson: text("before_json"), afterJson: text("after_json"), correlationId: text("correlation_id").notNull(), createdAtUtc: text("created_at_utc").notNull(),
}, t => [index("audit_log_date_idx").on(t.stationId, t.createdAtUtc)]);
