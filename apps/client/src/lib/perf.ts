type PerfMeta = Record<string, unknown>;

declare global {
  interface Window {
    __DOCMOST_PERF__?: Array<{
      type: string;
      name: string;
      durationMs?: number;
      timestamp: number;
      meta?: PerfMeta;
    }>;
  }
}

const isBrowser = typeof window !== "undefined";
const isPerfEnabled = import.meta.env.DEV;

function pushPerfEvent(
  type: string,
  name: string,
  durationMs?: number,
  meta?: PerfMeta,
) {
  if (!isBrowser || !isPerfEnabled) return;

  window.__DOCMOST_PERF__ ??= [];
  window.__DOCMOST_PERF__.push({
    type,
    name,
    durationMs,
    timestamp: Date.now(),
    meta,
  });

  if (type === "measure") {
    console.debug(`[perf] ${name}: ${durationMs?.toFixed(2)}ms`, meta ?? {});
    return;
  }

  console.debug(`[perf] ${type}:${name}`, meta ?? {});
}

export function markPerf(name: string, meta?: PerfMeta) {
  if (!isBrowser || !isPerfEnabled || typeof performance === "undefined") return;
  performance.mark(name);
  pushPerfEvent("mark", name, undefined, meta);
}

export function measurePerf(
  name: string,
  startMark: string,
  endMark?: string,
  meta?: PerfMeta,
) {
  if (!isBrowser || !isPerfEnabled || typeof performance === "undefined") return;

  const end = endMark ?? `${name}:end`;
  if (!endMark) {
    performance.mark(end);
  }

  try {
    performance.measure(name, startMark, end);
    const entries = performance.getEntriesByName(name, "measure");
    const entry = entries[entries.length - 1];
    pushPerfEvent("measure", name, entry?.duration, meta);
  } catch (error) {
    console.debug(`[perf] measure failed for ${name}`, error);
  }
}

export function logRequestPerf(
  name: string,
  phase: "start" | "end",
  meta?: PerfMeta,
) {
  pushPerfEvent(`request-${phase}`, name, undefined, meta);
}

export function parseServerTiming(
  headerValue?: string,
): Record<string, number | string> {
  if (!headerValue) return {};

  return headerValue.split(",").reduce<Record<string, number | string>>(
    (acc, metric) => {
      const [namePart, ...attrParts] = metric.trim().split(";");
      const name = namePart?.trim();
      if (!name) return acc;

      const metricData = attrParts.reduce<Record<string, string>>(
        (attrs, part) => {
          const [rawKey, rawValue] = part.split("=");
          if (!rawKey || !rawValue) return attrs;
          attrs[rawKey.trim()] = rawValue.replace(/^"|"$/g, "").trim();
          return attrs;
        },
        {},
      );

      acc[name] = metricData.dur ? Number(metricData.dur) : metricData.desc ?? "";
      return acc;
    },
    {},
  );
}
