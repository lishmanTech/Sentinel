import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-node';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-node';

export interface TracingConfig {
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint?: string;
  enabled?: boolean;
}

const DEFAULT_CONFIG: TracingConfig = {
  serviceName: 'sentinel',
  serviceVersion: '1.0.0',
  enabled: true,
};

let tracingInitialized = false;

/**
 * Creates and configures the OpenTelemetry SDK instance for tracing.
 *
 * Uses BatchSpanProcessor for OTLP export (production-ready) and
 * SimpleSpanProcessor for console export (development debugging).
 *
 * @param config - Optional tracing configuration overrides.
 * @returns A configured NodeSDK instance ready to be started.
 */
export function createTracingSdk(config?: Partial<TracingConfig>): NodeSDK {
  const merged: TracingConfig = { ...DEFAULT_CONFIG, ...config };

  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: merged.serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: merged.serviceVersion,
  });

  const spanProcessors: SpanProcessor[] = [];

  if (merged.otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${merged.otlpEndpoint}/v1/traces`,
        }),
      ),
    );
  }

  // Add console exporter in development for easy debugging
  if (process.env.NODE_ENV !== 'production') {
    spanProcessors.push(
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    );
  }

  if (spanProcessors.length === 0) {
    console.warn(
      '[Observability] Warning: tracing is enabled but no span processors are configured. ' +
      'Set OTEL_EXPORTER_URL to export traces to an OTLP collector.',
    );
  }

  const sdk = new NodeSDK({
    resource,
    spanProcessors,
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
    ],
  });

  return sdk;
}

/**
 * Initializes tracing based on environment variables.
 *
 * Reads the following environment variables:
 * - OTEL_ENABLED: Whether tracing is enabled (default: true)
 * - OTEL_EXPORTER_URL: The OTLP collector endpoint
 * - OTEL_SERVICE_NAME: Override for the service name
 *
 * Safe to call multiple times — duplicate calls are ignored.
 *
 * @returns The initialized NodeSDK instance, or null if tracing is disabled.
 */
export function initTracing(): NodeSDK | null {
  if (tracingInitialized) {
    console.log('[Observability] Tracing already initialized, skipping');
    return null;
  }

  const enabled = process.env.OTEL_ENABLED !== 'false';

  if (!enabled) {
    console.log('[Observability] Tracing is disabled via OTEL_ENABLED=false');
    tracingInitialized = true;
    return null;
  }

  const sdk = createTracingSdk({
    serviceName: process.env.OTEL_SERVICE_NAME || 'sentinel',
    otlpEndpoint: process.env.OTEL_EXPORTER_URL,
  });

  sdk.start();
  tracingInitialized = true;
  console.log('[Observability] Tracing initialized successfully');

  // Graceful shutdown — register only once
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('[Observability] Tracing terminated'))
      .catch((error) =>
        console.error('[Observability] Error terminating tracing', error),
      )
      .finally(() => process.exit(0));
  });

  return sdk;
}
