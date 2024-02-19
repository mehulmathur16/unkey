import { Env, zEnv } from "@/pkg/env";
import { analytics, init, logger, metrics } from "@/pkg/global";
import { newApp } from "@/pkg/hono/app";
import { ResolveConfigFn, instrument } from "@microlabs/otel-cf-workers";
import { newId } from "@unkey/id";
import type { Metric } from "@unkey/metrics";
import { cors } from "hono/cors";

import { registerV1ApisCreateApi } from "./routes/v1_apis_createApi";
import { registerV1ApisDeleteApi } from "./routes/v1_apis_deleteApi";
import { registerV1ApisGetApi } from "./routes/v1_apis_getApi";
import { registerV1ApisListKeys } from "./routes/v1_apis_listKeys";
import { registerV1KeysCreateKey } from "./routes/v1_keys_createKey";
import { registerV1KeysDeleteKey } from "./routes/v1_keys_deleteKey";
import { registerV1KeysGetKey } from "./routes/v1_keys_getKey";
import { registerV1KeysGetVerifications } from "./routes/v1_keys_getVerifications";
import { registerV1KeysUpdate } from "./routes/v1_keys_updateKey";
import { registerV1KeysUpdateRemaining } from "./routes/v1_keys_updateRemaining";
import { registerV1KeysVerifyKey } from "./routes/v1_keys_verifyKey";
import { registerV1Liveness } from "./routes/v1_liveness";

// Legacy Routes
import { registerLegacyApisCreateApi } from "./routes/legacy_apis_createApi";
import { registerLegacyApisDeleteApi } from "./routes/legacy_apis_deleteApi";
import { registerLegacyApisGetApi } from "./routes/legacy_apis_getApi";
import { registerLegacyApisListKeys } from "./routes/legacy_apis_listKeys";
import { registerLegacyKeysCreate } from "./routes/legacy_keys_createKey";
import { registerLegacyKeysDelete } from "./routes/legacy_keys_deleteKey";
import { registerLegacyKeysGet } from "./routes/legacy_keys_getKey";
import { registerLegacyKeysUpdate } from "./routes/legacy_keys_updateKey";
import { registerLegacyKeysVerifyKey } from "./routes/legacy_keys_verifyKey";

// Export Durable Objects for cloudflare
export { DurableObjectRatelimiter } from "@/pkg/ratelimit/durable_object";
export { DurableObjectUsagelimiter } from "@/pkg/usagelimit/durable_object";

const app = newApp();

app.get("/routes", (c) => {
  return c.json(
    app.routes.map((r) => ({
      method: r.method,
      path: r.path,
    })),
  );
});
type DiscriminateMetric<T, M = Metric> = M extends { metric: T } ? M : never;

app.use("*", async (c, next) => {
  // logger.info("request", {
  //   method: c.req.method,
  //   path: c.req.path,
  // });
  const start = performance.now();
  const m = {
    metric: "metric.http.request",
    path: c.req.path,
    method: c.req.method,
    // @ts-ignore - this is a bug in the types
    continent: c.req.raw?.cf?.continent,
    // @ts-ignore - this is a bug in the types
    country: c.req.raw?.cf?.country,
    // @ts-ignore - this is a bug in the types
    colo: c.req.raw?.cf?.colo,
    // @ts-ignore - this is a bug in the types
    city: c.req.raw?.cf?.city,
    userAgent: c.req.header("user-agent"),
    fromAgent: c.req.header("Unkey-Redirect"),
  } as DiscriminateMetric<"metric.http.request">;
  try {
    const requestId = newId("request");
    m.requestId = requestId;
    c.set("requestId", requestId);

    const telemetry = {
      runtime: c.req.header("Unkey-Telemetry-Runtime"),
      platform: c.req.header("Unkey-Telemetry-Platform"),
      versions: c.req.header("Unkey-Telemetry-SDK")?.split(","),
    };
    if (telemetry.runtime || telemetry.platform || telemetry.versions) {
      c.executionCtx.waitUntil(
        analytics
          .ingestSdkTelemetry({
            runtime: telemetry.runtime || "unknown",
            platform: telemetry.platform || "unknown",
            versions: telemetry.versions || [],
            requestId,
            time: Date.now(),
          })
          .catch((err) => {
            logger.error("Error ingesting SDK telemetry", {
              method: c.req.method,
              path: c.req.path,
              error: err.message,
            });
          }),
      );
    }

    await next();
    // headers should be set after calling `next()`, otherwise they will be lowercased by the framework
    c.res.headers.append("Unkey-Request-Id", requestId);
  } catch (e) {
    m.error = (e as Error).message;
    logger.error("request", {
      method: c.req.method,
      path: c.req.path,
      error: e,
    });
    throw e;
  } finally {
    m.status = c.res.status;
    m.serviceLatency = performance.now() - start;
    c.res.headers.append("Unkey-Latency", `service=${m.serviceLatency}ms`);
    c.res.headers.append("Unkey-Version", c.env.VERSION);
    metrics.emit(m);
    c.executionCtx.waitUntil(Promise.all([metrics.flush(), logger.flush()]));
  }
});
app.use("*", cors());

/**
 * Registering all route handlers
 */

// misc
registerV1Liveness(app);

// keys
registerV1KeysGetKey(app);
registerV1KeysDeleteKey(app);
registerV1KeysCreateKey(app);
registerV1KeysVerifyKey(app);
registerV1KeysUpdate(app);
registerV1KeysUpdateRemaining(app);
registerV1KeysGetVerifications(app);

// apis
registerV1ApisGetApi(app);
registerV1ApisCreateApi(app);
registerV1ApisListKeys(app);
registerV1ApisDeleteApi(app);

// legacy REST style routes
registerLegacyKeysUpdate(app);
registerLegacyKeysGet(app);
registerLegacyKeysCreate(app);
registerLegacyKeysVerifyKey(app);
registerLegacyKeysDelete(app);

registerLegacyApisCreateApi(app);
registerLegacyApisGetApi(app);
registerLegacyApisDeleteApi(app);
registerLegacyApisListKeys(app);

const handler = {
  fetch: (req: Request, env: Env, executionCtx: ExecutionContext) => {
    const parsedEnv = zEnv.safeParse(env);
    if (!parsedEnv.success) {
      return Response.json(
        {
          code: "BAD_ENVIRONMENT",
          message: "Some environment variables are missing or are invalid",
          errors: parsedEnv.error,
        },
        { status: 500 },
      );
    }
    init({ env: parsedEnv.data });

    return app.fetch(req, parsedEnv.data, executionCtx);
  },
};

const config: ResolveConfigFn = (env: Env, _trigger) => {
  return {
    exporter: {
      url: "https://otel.baselime.io/v1/",
      headers: { "x-api-key": env.BASELIME_API_KEY },
    },
    service: { name: env.BASELIME_SERVICE_NAME },
  };
};

export default instrument(handler, config);
