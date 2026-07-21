import { ThreatIntelligenceService } from './threat-intelligence.service';
import { ThreatIntelligenceFeed } from './threat-intelligence-feed';
import { FeedIngestionResult, ThreatIndicator } from './interfaces/threat-intelligence.interface';

/** Simple in-memory feed used to exercise the framework in tests. */
class StubFeed extends ThreatIntelligenceFeed {
  constructor(
    name: string,
    public indicators: ThreatIndicator[] = [],
  ) {
    super(name);
  }

  async fetchIndicators(): Promise<ThreatIndicator[]> {
    return this.indicators;
  }
}

/** Feed that always fails, to exercise error handling. */
class FailingFeed extends ThreatIntelligenceFeed {
  constructor(
    name: string,
    private readonly errorMessage: string,
  ) {
    super(name);
  }

  async fetchIndicators(): Promise<ThreatIndicator[]> {
    throw new Error(this.errorMessage);
  }
}

const sampleIndicator: ThreatIndicator = {
  indicator: '0xdeadbeef',
  indicatorType: 'address',
  description: 'Known drainer contract',
  severity: 'critical',
  source: 'TestVendor',
};

describe('ThreatIntelligenceService', () => {
  let service: ThreatIntelligenceService;

  beforeEach(() => {
    service = new ThreatIntelligenceService();
  });

  afterEach(() => {
    service.stopAllSchedules();
    jest.useRealTimers();
  });

  describe('Feed Abstraction', () => {
    it('should register a feed and list it', () => {
      const feed = new StubFeed('FeedA');
      service.registerFeed(feed);

      expect(service.getRegisteredFeeds()).toEqual(['FeedA']);
    });

    it('should support multiple distinct feed implementations', () => {
      service.registerFeed(new StubFeed('FeedA'));
      service.registerFeed(new FailingFeed('FeedB', 'boom'));

      expect(service.getRegisteredFeeds().sort()).toEqual(['FeedA', 'FeedB']);
    });

    it('should unregister a feed and discard its records', async () => {
      service.registerFeed(new StubFeed('FeedA', [sampleIndicator]));
      await service.ingestFeed('FeedA');
      expect(service.getRecords('FeedA').length).toBe(1);

      service.unregisterFeed('FeedA');

      expect(service.getRegisteredFeeds()).toEqual([]);
      expect(service.getRecords('FeedA')).toEqual([]);
    });
  });

  describe('Data Ingestion', () => {
    it('should ingest indicators from a feed and stamp them with feed metadata', async () => {
      service.registerFeed(new StubFeed('FeedA', [sampleIndicator]));

      const result = await service.ingestFeed('FeedA');

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(1);

      const records = service.getRecords('FeedA');
      expect(records.length).toBe(1);
      expect(records[0].feedName).toBe('FeedA');
      expect(records[0].indicator).toBe(sampleIndicator.indicator);
      expect(records[0].id).toEqual(expect.stringContaining('ti-FeedA-'));
      expect(records[0].fetchedAt).toBeTruthy();
    });

    it('should replace previously ingested records for a feed on re-ingestion', async () => {
      const feed = new StubFeed('FeedA', [sampleIndicator]);
      service.registerFeed(feed);
      await service.ingestFeed('FeedA');
      expect(service.getRecords('FeedA').length).toBe(1);

      // Re-ingest with no indicators this time
      feed.indicators = [];
      await service.ingestFeed('FeedA');

      expect(service.getRecords('FeedA').length).toBe(0);
    });

    it('should return a failed result for an unregistered feed', async () => {
      const result = await service.ingestFeed('DoesNotExist');

      expect(result.success).toBe(false);
      expect(result.recordCount).toBe(0);
      expect(result.error).toContain('not registered');
    });

    it('should isolate ingestion failures to the failing feed', async () => {
      service.registerFeed(new StubFeed('GoodFeed', [sampleIndicator]));
      service.registerFeed(new FailingFeed('BadFeed', 'upstream unavailable'));

      const results = await service.ingestAll();
      const byFeed = new Map(results.map(r => [r.feedName, r]));

      expect(byFeed.get('GoodFeed')?.success).toBe(true);
      expect(byFeed.get('GoodFeed')?.recordCount).toBe(1);

      expect(byFeed.get('BadFeed')?.success).toBe(false);
      expect(byFeed.get('BadFeed')?.error).toBe('upstream unavailable');

      // Good feed's records should still be present despite the other feed failing
      expect(service.getRecords('GoodFeed').length).toBe(1);
    });

    it('should aggregate records across all feeds', async () => {
      service.registerFeed(new StubFeed('FeedA', [sampleIndicator]));
      service.registerFeed(new StubFeed('FeedB', [{ ...sampleIndicator, indicator: '0xother' }]));

      await service.ingestAll();

      expect(service.getAllRecords().length).toBe(2);
    });

    it('should notify subscribers of ingestion results, including failures', async () => {
      const results: FeedIngestionResult[] = [];
      const unsubscribe = service.onIngestion(result => results.push(result));

      service.registerFeed(new StubFeed('FeedA', [sampleIndicator]));
      service.registerFeed(new FailingFeed('FeedB', 'nope'));
      await service.ingestAll();

      expect(results.length).toBe(2);
      expect(results.some(r => r.feedName === 'FeedA' && r.success)).toBe(true);
      expect(results.some(r => r.feedName === 'FeedB' && !r.success)).toBe(true);

      unsubscribe();
      await service.ingestFeed('FeedA');
      expect(results.length).toBe(2); // No new notifications after unsubscribing
    });
  });

  describe('Feed Scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should run ingestion on the configured interval', async () => {
      const feed = new StubFeed('FeedA', [sampleIndicator]);
      const fetchSpy = jest.spyOn(feed, 'fetchIndicators');
      service.registerFeed(feed);

      service.schedule('FeedA', { intervalMs: 1000 });
      expect(fetchSpy).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(2000);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should run an immediate ingestion when runImmediately is set', async () => {
      const feed = new StubFeed('FeedA', [sampleIndicator]);
      const fetchSpy = jest.spyOn(feed, 'fetchIndicators');
      service.registerFeed(feed);

      service.schedule('FeedA', { intervalMs: 1000, runImmediately: true });
      // Allow the immediate async ingestion to settle
      await Promise.resolve();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should report a feed as scheduled while active and not after stopping', () => {
      service.registerFeed(new StubFeed('FeedA'));

      expect(service.isScheduled('FeedA')).toBe(false);

      service.schedule('FeedA', { intervalMs: 1000 });
      expect(service.isScheduled('FeedA')).toBe(true);

      service.stopSchedule('FeedA');
      expect(service.isScheduled('FeedA')).toBe(false);
    });

    it('should stop firing ingestion once unscheduled', async () => {
      const feed = new StubFeed('FeedA', [sampleIndicator]);
      const fetchSpy = jest.spyOn(feed, 'fetchIndicators');
      service.registerFeed(feed);

      service.schedule('FeedA', { intervalMs: 1000 });
      await jest.advanceTimersByTimeAsync(1000);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      service.stopSchedule('FeedA');
      await jest.advanceTimersByTimeAsync(5000);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // No further calls
    });

    it('should replace an existing schedule when re-scheduling the same feed', async () => {
      const feed = new StubFeed('FeedA', [sampleIndicator]);
      const fetchSpy = jest.spyOn(feed, 'fetchIndicators');
      service.registerFeed(feed);

      service.schedule('FeedA', { intervalMs: 1000 });
      service.schedule('FeedA', { intervalMs: 500 });

      await jest.advanceTimersByTimeAsync(500);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw when scheduling a feed that is not registered', () => {
      expect(() => service.schedule('Unknown', { intervalMs: 1000 })).toThrow(
        'Cannot schedule unknown feed "Unknown"',
      );
    });

    it('should stop all schedules at once', async () => {
      const feedA = new StubFeed('FeedA', [sampleIndicator]);
      const feedB = new StubFeed('FeedB', [sampleIndicator]);
      const spyA = jest.spyOn(feedA, 'fetchIndicators');
      const spyB = jest.spyOn(feedB, 'fetchIndicators');
      service.registerFeed(feedA);
      service.registerFeed(feedB);

      service.schedule('FeedA', { intervalMs: 1000 });
      service.schedule('FeedB', { intervalMs: 1000 });

      service.stopAllSchedules();

      await jest.advanceTimersByTimeAsync(5000);
      expect(spyA).not.toHaveBeenCalled();
      expect(spyB).not.toHaveBeenCalled();
      expect(service.isScheduled('FeedA')).toBe(false);
      expect(service.isScheduled('FeedB')).toBe(false);
    });
  });
});
