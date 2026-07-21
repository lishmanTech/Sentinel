/** Severity level associated with a threat indicator. */
export type ThreatSeverity = 'low' | 'medium' | 'high' | 'critical';

/** The kind of indicator of compromise (IOC) a record represents. */
export type ThreatIndicatorType = 'address' | 'domain' | 'ip' | 'hash' | 'url' | 'other';

/**
 * A single indicator of compromise as reported by a threat intelligence feed,
 * before it has been ingested and stamped with feed/timing metadata.
 */
export interface ThreatIndicator {
  /** The raw indicator value (address, domain, IP, file hash, URL, etc.). */
  indicator: string;
  /** The kind of indicator this record represents. */
  indicatorType: ThreatIndicatorType;
  /** Human-readable description of why this indicator is considered malicious. */
  description: string;
  /** Severity level assigned to this indicator. */
  severity: ThreatSeverity;
  /** Optional upstream source identifier (e.g. report URL, vendor name). */
  source?: string;
  /** Optional raw payload from the feed, preserved for auditing. */
  raw?: Record<string, unknown>;
}

/**
 * A threat indicator after ingestion, stamped with the feed it came from
 * and when it was fetched.
 */
export interface ThreatIntelRecord extends ThreatIndicator {
  /** Unique identifier assigned to this record at ingestion time. */
  id: string;
  /** Name of the feed this record was ingested from. */
  feedName: string;
  /** ISO-8601 timestamp of when this record was fetched. */
  fetchedAt: string;
}

/** Outcome of a single ingestion pass for one feed. */
export interface FeedIngestionResult {
  /** Name of the feed that was ingested. */
  feedName: string;
  /** Whether the ingestion pass completed without error. */
  success: boolean;
  /** Number of records ingested (0 on failure). */
  recordCount: number;
  /** Error message, present only when `success` is false. */
  error?: string;
  /** ISO-8601 timestamp of when this ingestion pass ran. */
  ingestedAt: string;
}

/** Options controlling periodic ingestion scheduling for a feed. */
export interface ScheduleOptions {
  /** Interval between automatic ingestion runs, in milliseconds. */
  intervalMs: number;
  /** Whether to run an ingestion pass immediately when scheduling starts. */
  runImmediately?: boolean;
}
