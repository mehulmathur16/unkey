import { expect, test } from "vitest";

import { randomUUID } from "crypto";
import type { ErrorResponse } from "@/pkg/errors";
import { RouteHarness } from "@/pkg/testutil/route-harness";
import { schema } from "@unkey/db";
import { newId } from "@unkey/id";
import { registerV1ApisListKeys } from "./v1_apis_listKeys";

test("when the api does not exist", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerV1ApisListKeys);

  const apiId = newId("api");

  const { key: rootKey } = await h.createRootKey([
    `api.${apiId}.read_api`,
    `api.${apiId}.read_key`,
  ]);

  const res = await h.get<ErrorResponse>({
    url: `/v1/apis.listKeys?apiId=${apiId}`,
    headers: {
      Authorization: `Bearer ${rootKey}`,
    },
  });

  expect(res.status).toEqual(404);
  expect(res.body).toMatchObject({
    error: {
      code: "NOT_FOUND",
      docs: "https://unkey.dev/docs/api-reference/errors/code/NOT_FOUND",
      message: `api ${apiId} not found`,
    },
  });
});

test("when the api has no keyAuth", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerV1ApisListKeys);

  const apiId = newId("api");
  await h.db.insert(schema.apis).values({
    id: apiId,
    name: randomUUID(),
    workspaceId: h.resources.userWorkspace.id,
  });

  const { key: rootKey } = await h.createRootKey([
    `api.${apiId}.read_api`,
    `api.${apiId}.read_key`,
  ]);

  const res = await h.get<ErrorResponse>({
    url: `/v1/apis.listKeys?apiId=${apiId}`,
    headers: {
      Authorization: `Bearer ${rootKey}`,
    },
  });

  expect(res.status).toEqual(412);
  expect(res.body).toMatchObject({
    error: {
      code: "PRECONDITION_FAILED",
      docs: "https://unkey.dev/docs/api-reference/errors/code/PRECONDITION_FAILED",
      message: `api ${apiId} is not setup to handle keys`,
    },
  });
});
