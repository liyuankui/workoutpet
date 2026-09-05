import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * F18 匿名遥测（opt-out）——遵循 POSTHOG_USAGE_GUIDE：
 * project='micro-pet' + surface='app' 区分网页/应用；config.telemetry:false 一键关（关后零网络请求）。
 * 仅 3 事件：app_open / remind_fired / check_in。零 PII：distinct_id 为本地随机文件 uid。
 */
export const POSTHOG_KEY = "phc_AbKVVXPDZKThtUacCHhFOITuBczUvLmPStN1JAZs93e";
export const POSTHOG_ENDPOINT = "https://eu.i.posthog.com/capture/";
export const TELEMETRY_PROJECT = "micro-pet";

/** 是否允许发送：默认开，config.telemetry === false 关 */
export function telemetryEnabled(config: { telemetry?: boolean } | undefined): boolean {
  return config?.telemetry !== false;
}

/** 本地随机 uid（~/.micro-pet/uid，8 位，创建后稳定） */
export function readOrCreateUid(home: string): string {
  const p = join(home, "uid");
  try {
    if (existsSync(p)) return readFileSync(p, "utf8").trim();
    mkdirSync(home, { recursive: true });
    const uid = randomUUID().slice(0, 8);
    writeFileSync(p, uid);
    return uid;
  } catch {
    return "unknown";
  }
}

export interface TelemetryPayload {
  api_key: string;
  event: string;
  timestamp: string;
  properties: {
    distinct_id: string;
    project: string;
    surface: string;
    version: string;
  } & Record<string, unknown>;
}

export function buildPayload(
  event: string,
  props: Record<string, unknown>,
  uid: string,
  version: string,
): TelemetryPayload {
  return {
    api_key: POSTHOG_KEY,
    event,
    timestamp: new Date().toISOString(),
    properties: {
      distinct_id: uid,
      project: TELEMETRY_PROJECT,
      surface: "app",
      version,
      ...props,
    },
  };
}

/** 发送（fire-and-forget，任何失败静默——遥测不许影响产品） */
export async function sendTelemetry(
  event: string,
  props: Record<string, unknown>,
  uid: string,
  version: string,
): Promise<void> {
  try {
    await fetch(POSTHOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(event, props, uid, version)),
    });
  } catch {
    /* 网络失败丢弃 */
  }
}
