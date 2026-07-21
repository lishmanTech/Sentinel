import { ThreatIntelligenceFeed } from './threat-intelligence-feed';
import {
  FeedIngestionResult,
  ScheduleOptions,
  ThreatIntelRecord,
} from './interfaces/threat-intelligence.interface';

/**
 * Core threat intelligence framework: manages registered feed adapters,
 * ingests their indicators, stores the resulting records, and supports
 * running ingestion on a recurring schedule.
 */
export class ThreatIntelligenceService {
  private feeds = new Map<string, ThreatIntelligenceFeed>();
  private records = new Map<string, ThreatIntelRecord[]>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private ingestionCallbacks: Array<(result: FeedIngestionResult) => void> = [];

  /** Register a feed adapter with the framework. */
  public registerFeed(feed: ThreatIntelligenceFeed): void {
    this.feeds.set(feed.name, feed);
  }

  /** Remove a feed, stopping any scheduled ingestion and discarding its records. */
  public unregisterFeed(feedName: string): void {
    this.stopSchedule(feedName);
    this.feeds.delete(feedName);
    this.records.delete(feedName);
  }

  /** Names of all currently registered feeds. */
  public getRegisteredFeeds(): string[] {
    return Array.from(this.feeds.keys());
  }

  /**
   * Run a single ingestion pass for one feed. Replaces any previously
   * ingested records for that feed with the newly fetched set.
   */
  public async ingestFeed(feedName: string): Promise<FeedIngestionResult> {
    const feed = this.feeds.get(feedName);
    const ingestedAt = new Date().toISOString();

    if (!feed) {
      const result: FeedIngestionResult = {
        feedName,
        success: false,
        recordCount: 0,
        error: `Feed "${feedName}" is not registered`,
        ingestedAt,
      };
      this.emitIngestionResult(result);
      return result;
    }

    try {
      const indicators = await feed.fetchIndicators();
      const records: ThreatIntelRecord[] = indicators.map((indicator, index) => ({
        ...indicator,
        id: `ti-${feedName}-${Date.now()}-${index}`,
        feedName,
        fetchedAt: ingestedAt,
      }));

      this.records.set(feedName, records);

      const result: FeedIngestionResult = {
        feedName,
        success: true,
        recordCount: records.length,
        ingestedAt,
      };
      this.emitIngestionResult(result);
      return result;
    } catch (error) {
      const result: FeedIngestionResult = {
        feedName,
        success: false,
        recordCount: 0,
        error: error instanceof Error ? error.message : String(error),
        ingestedAt,
      };
      this.emitIngestionResult(result);
      return result;
    }
  }

  /** Run an ingestion pass for every registered feed. */
  public async ingestAll(): Promise<FeedIngestionResult[]> {
    return Promise.all(this.getRegisteredFeeds().map(name => this.ingestFeed(name)));
  }

  /** Records currently held for a single feed. */
  public getRecords(feedName: string): ThreatIntelRecord[] {
    return this.records.get(feedName) ?? [];
  }

  /** Records currently held across all feeds. */
  public getAllRecords(): ThreatIntelRecord[] {
    return Array.from(this.records.values()).flat();
  }

  /**
   * Start periodic ingestion for a feed. Replaces any existing schedule
   * for the same feed.
   */
  public schedule(feedName: string, options: ScheduleOptions): void {
    if (!this.feeds.has(feedName)) {
      throw new Error(`Cannot schedule unknown feed "${feedName}"`);
    }
    this.stopSchedule(feedName);

    if (options.runImmediately) {
      void this.ingestFeed(feedName);
    }

    const timer = setInterval(() => {
      void this.ingestFeed(feedName);
    }, options.intervalMs);

    this.timers.set(feedName, timer);
  }

  /** Stop periodic ingestion for a feed, if it is scheduled. */
  public stopSchedule(feedName: string): void {
    const timer = this.timers.get(feedName);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(feedName);
    }
  }

  /** Stop every scheduled ingestion job. */
  public stopAllSchedules(): void {
    for (const feedName of Array.from(this.timers.keys())) {
      this.stopSchedule(feedName);
    }
  }

  /** Whether a feed currently has an active ingestion schedule. */
  public isScheduled(feedName: string): boolean {
    return this.timers.has(feedName);
  }

  /** Subscribe to ingestion results. Returns an unsubscribe function. */
  public onIngestion(callback: (result: FeedIngestionResult) => void): () => void {
    this.ingestionCallbacks.push(callback);
    return () => {
      this.ingestionCallbacks = this.ingestionCallbacks.filter(cb => cb !== callback);
    };
  }

  private emitIngestionResult(result: FeedIngestionResult): void {
    for (const callback of this.ingestionCallbacks) {
      try {
        callback(result);
      } catch (error) {
        // Prevent one faulty callback from aborting others
        console.error('Error in threat intelligence ingestion callback:', error);
      }
    }
  }
}
