import { RouteHarness } from "@/pkg/testutil/route-harness";
import { schema } from "@unkey/db";
import { sha256 } from "@unkey/hash";
import { newId } from "@unkey/id";
import { KeyV1 } from "@unkey/keys";
import { expect, test } from "vitest";
import {
  LegacyKeysUpdateKeyRequest,
  LegacyKeysUpdateKeyResponse,
  registerLegacyKeysUpdate,
} from "./legacy_keys_updateKey";

test("returns 200", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerLegacyKeysUpdate);

  const key = {
    id: newId("key"),
    keyAuthId: h.resources.userKeyAuth.id,
    workspaceId: h.resources.userWorkspace.id,
    start: "test",
    name: "test",
    hash: await sha256(new KeyV1({ byteLength: 16 }).toString()),
    createdAt: new Date(),
  };
  await h.db.insert(schema.keys).values(key);
  const { key: rootKey } = await h.createRootKey(["*"]);
  const res = await h.put<LegacyKeysUpdateKeyRequest, LegacyKeysUpdateKeyResponse>({
    url: `/v1/keys/${key.id}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rootKey}`,
    },
    body: {
      name: "test2",
      ownerId: "test2",
      meta: { test: "test" },
      expires: Date.now(),
    },
  });

  expect(res.status).toEqual(200);
});

test("update all", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerLegacyKeysUpdate);

  const key = {
    id: newId("key"),
    keyAuthId: h.resources.userKeyAuth.id,
    workspaceId: h.resources.userWorkspace.id,
    start: "test",
    name: "test",
    hash: await sha256(new KeyV1({ byteLength: 16 }).toString()),
    createdAt: new Date(),
  };
  await h.db.insert(schema.keys).values(key);
  const { key: rootKey } = await h.createRootKey(["*"]);

  const res = await h.put<LegacyKeysUpdateKeyRequest, LegacyKeysUpdateKeyResponse>({
    url: `/v1/keys/${key.id}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rootKey}`,
    },
    body: {
      name: "newName",
      ownerId: "newOwnerId",
      expires: null,
      meta: { new: "meta" },
      ratelimit: {
        type: "fast",
        limit: 10,
        refillRate: 5,
        refillInterval: 1000,
      },
      remaining: 0,
    },
  });

  expect(res.status).toEqual(200);

  const found = await h.db.query.keys.findFirst({
    where: (table, { eq }) => eq(table.id, key.id),
  });
  expect(found).toBeDefined();
  expect(found?.name).toEqual("newName");
  expect(found?.ownerId).toEqual("newOwnerId");
  expect(found?.meta).toEqual(JSON.stringify({ new: "meta" }));
  expect(found?.ratelimitType).toEqual("fast");
  expect(found?.ratelimitLimit).toEqual(10);
  expect(found?.ratelimitRefillRate).toEqual(5);
  expect(found?.ratelimitRefillInterval).toEqual(1000);
  expect(found?.remaining).toEqual(0);
});

test("update ratelimit", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerLegacyKeysUpdate);

  const key = {
    id: newId("key"),
    keyAuthId: h.resources.userKeyAuth.id,
    workspaceId: h.resources.userWorkspace.id,
    start: "test",
    name: "test",
    hash: await sha256(new KeyV1({ byteLength: 16 }).toString()),
    createdAt: new Date(),
  };
  await h.db.insert(schema.keys).values(key);
  const { key: rootKey } = await h.createRootKey(["*"]);

  const res = await h.put<LegacyKeysUpdateKeyRequest, LegacyKeysUpdateKeyResponse>({
    url: `/v1/keys/${key.id}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rootKey}`,
    },
    body: {
      ratelimit: {
        type: "fast",
        limit: 10,
        refillRate: 5,
        refillInterval: 1000,
      },
    },
  });

  expect(res.status).toEqual(200);

  const found = await h.db.query.keys.findFirst({
    where: (table, { eq }) => eq(table.id, key.id),
  });
  expect(found).toBeDefined();
  expect(found?.name).toEqual("test");
  expect(found?.ownerId).toBeNull();
  expect(found?.meta).toBeNull();
  expect(found?.ratelimitType).toEqual("fast");
  expect(found?.ratelimitLimit).toEqual(10);
  expect(found?.ratelimitRefillRate).toEqual(5);
  expect(found?.ratelimitRefillInterval).toEqual(1000);
  expect(found?.remaining).toBeNull();
});

test("delete expires", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerLegacyKeysUpdate);

  const key = {
    id: newId("key"),
    keyAuthId: h.resources.userKeyAuth.id,
    workspaceId: h.resources.userWorkspace.id,
    start: "test",
    name: "test",
    hash: await sha256(new KeyV1({ byteLength: 16 }).toString()),
    createdAt: new Date(),
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
  await h.db.insert(schema.keys).values(key);

  const { key: rootKey } = await h.createRootKey(["*"]);

  const res = await h.put<LegacyKeysUpdateKeyRequest, LegacyKeysUpdateKeyResponse>({
    url: `/v1/keys/${key.id}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rootKey}`,
    },
    body: {
      expires: null,
    },
  });

  expect(res.status).toEqual(200);

  const found = await h.db.query.keys.findFirst({
    where: (table, { eq }) => eq(table.id, key.id),
  });
  expect(found).toBeDefined();
  expect(found?.name).toEqual("test");
  expect(found?.ownerId).toBeNull();
  expect(found?.meta).toBeNull();
  expect(found?.expires).toBeNull();
});

test("update should not affect undefined fields", async () => {
  using h = new RouteHarness();
  await h.seed();
  h.useRoutes(registerLegacyKeysUpdate);

  const key = {
    id: newId("key"),
    keyAuthId: h.resources.userKeyAuth.id,
    workspaceId: h.resources.userWorkspace.id,
    start: "test",
    name: "test",
    hash: await sha256(new KeyV1({ byteLength: 16 }).toString()),
    createdAt: new Date(),
    ownerId: "ownerId",
    expires: new Date(Date.now() + 60 * 60 * 1000),
  };
  await h.db.insert(schema.keys).values(key);

  const rootKey = await h.createRootKey(["*"]);

  const res = await h.put<LegacyKeysUpdateKeyRequest, LegacyKeysUpdateKeyResponse>({
    url: `/v1/keys/${key.id}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rootKey.key}`,
    },
    body: {
      ownerId: "newOwnerId",
    },
  });

  expect(res.status).toEqual(200);

  const found = await h.db.query.keys.findFirst({
    where: (table, { eq }) => eq(table.id, key.id),
  });
  expect(found).toBeDefined();
  expect(found?.name).toEqual("test");
  expect(found?.ownerId).toEqual("newOwnerId");
  expect(found?.meta).toBeNull();
  expect(found?.expires).toEqual(key.expires);
  expect(found?.ratelimitType).toBeNull();
  expect(found?.ratelimitLimit).toBeNull();
  expect(found?.ratelimitRefillRate).toBeNull();
  expect(found?.ratelimitRefillInterval).toBeNull();
  expect(found?.remaining).toBeNull();
});
