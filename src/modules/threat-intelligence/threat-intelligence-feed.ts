import { ThreatIndicator } from './interfaces/threat-intelligence.interface';

/**
 * Base class all threat intelligence feed adapters must extend.
 *
 * This is the feed abstraction: it decouples the ingestion pipeline from the
 * specifics of any one upstream source (HTTP API, file drop, third-party SDK,
 * etc.) by requiring only that a feed can name itself and fetch its current
 * set of indicators.
 */
export abstract class ThreatIntelligenceFeed {
  constructor(public readonly name: string) {}

  /**
   * Fetch the latest set of threat indicators from this feed's source.
   *
   * Implementations should throw on unrecoverable failures — the ingestion
   * pipeline catches errors per-feed so one failing feed cannot block
   * ingestion of the others.
   */
  abstract fetchIndicators(): Promise<ThreatIndicator[]>;
}
