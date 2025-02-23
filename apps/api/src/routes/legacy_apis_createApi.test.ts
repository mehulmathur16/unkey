import { expect, test } from "vitest";

import { ErrorResponse } from "@/pkg/errors";
import { RouteHarness } from "@/pkg/testutil/route-harness";
import { schema } from "@unkey/db";
import { eq } from "drizzle-orm";
import {
  LegacyApisCreateApiRequest,
  LegacyApisCreateApiResponse,
  registerLegacyApisCreateApi,
} from "./legacy_apis_createApi";

test("creates the api", async () => {
  using h = new RouteHarness();
  await h.seed();

  h.useRoutes(registerLegacyApisCreateApi);
  const { key: rootKey } = await h.createRootKey(["*"]);

  const res = await h.post<LegacyApisCreateApiRequest, LegacyApisCreateApiResponse>({
    url: "/v1/apis",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rootKey}`,
    },
    body: {
      name: "my api",
    },
  });

  expect(res.status).toEqual(200);
  expect(res.body.apiId).toBeDefined();

  const found = await h.db.query.apis.findFirst({
    where: (table, { eq }) => eq(table.id, res.body.apiId),
  });

  expect(found?.name).toBe("my api");
  await h.db.delete(schema.apis).where(eq(schema.apis.id, res.body.apiId));
});

test("creates rejects invalid root key", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerLegacyApisCreateApi);
  const res = await h.post<LegacyApisCreateApiRequest, ErrorResponse>({
    url: "/v1/apis",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalidRootKey",
    },
    body: {
      name: "my api",
    },
  });

  expect(res.status).toEqual(403);
  expect(res.body.error.code).toBe("UNAUTHORIZED");
});
