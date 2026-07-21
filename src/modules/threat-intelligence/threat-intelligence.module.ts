import { ThreatIntelligenceService } from './threat-intelligence.service';

/**
 * Module wrapper for the threat intelligence feed framework.
 * Provides a static helper to instantiate the service.
 */
export class ThreatIntelligenceModule {
  /** Create and configure a ThreatIntelligenceService instance. */
  static create(): ThreatIntelligenceService {
    return new ThreatIntelligenceService();
  }
}

/** Factory helper function to instantiate the ThreatIntelligenceService. */
export function createThreatIntelligenceService(): ThreatIntelligenceService {
  return new ThreatIntelligenceService();
}
