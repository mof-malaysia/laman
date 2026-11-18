/** Builds the app the way the tests use it: signed in, so the API answers. */
import { randomUUID } from "node:crypto";
import type { Role } from "@laman/contracts";
import { type AppOptions, buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { hashToken, newToken } from "../src/auth/tokens.js";
import { now } from "../src/db/index.js";
import { DEV_MEDIA_STORE } from "../src/env.js";
import { bundledSetup, s3MediaStore } from "../src/media-store/index.js";

export type App = Awaited<ReturnType<typeof buildApp>>;

export const SUPER_ADMIN = { username: "pentadbir", password: "kata laluan ujian yang panjang" };

/**
 * The tests' own buckets in the dev media store (scripts/rustfs.ts, started
 * by test/global-setup.ts), apart from the ones `pnpm dev` uses.
 */
export const TEST_BUCKETS = { private: "laman-test-media", published: "laman-test-published" };

/** The bundled store with the tests' buckets, made when missing: for tests that don't boot the app. */
export async function testMediaStore(buckets = TEST_BUCKETS) {
  const store = s3MediaStore(
    "bundled",
    bundledSetup({
      endpoint: DEV_MEDIA_STORE.MEDIA_STORE_ENDPOINT,
      accessKeyId: DEV_MEDIA_STORE.MEDIA_STORE_ACCESS_KEY_ID,
      secret: DEV_MEDIA_STORE.MEDIA_STORE_SECRET_ACCESS_KEY,
      buckets,
    }),
  );
  await store.ensureBuckets();
  return store;
}

/** The app with a super admin seeded from the environment, as a first boot makes it. */
export const testApp = (options: AppOptions) =>
  buildApp({
    mediaBuckets: TEST_BUCKETS,
    ...options,
    env: {
      ...options.env,
      SUPER_ADMIN_USERNAME: options.env.SUPER_ADMIN_USERNAME ?? SUPER_ADMIN.username,
      SUPER_ADMIN_PASSWORD: options.env.SUPER_ADMIN_PASSWORD ?? SUPER_ADMIN.password,
    },
  });

/**
 * A finished sign-in's cookie for someone with `role`: the seeded super
 * admin (with its password already changed), or a new account.
 */
export async function sessionCookie(app: App, role: Role = "superAdmin", username?: string) {
  const { db } = app;
  let id: string;
  if (role === "superAdmin") {
    const user = await db
      .selectFrom("users")
      .select("id")
      .where("role", "=", "superAdmin")
      .executeTakeFirstOrThrow();
    await db
      .updateTable("users")
      .set({ must_change_password: 0 })
      .where("id", "=", user.id)
      .execute();
    id = user.id;
  } else {
    id = randomUUID();
    await db
      .insertInto("users")
      .values({
        id,
        username: username ?? `${role.toLowerCase()}-${id.slice(0, 8)}`,
        display_name: role,
        role,
        password_hash: await hashPassword(SUPER_ADMIN.password),
        created_at: now(),
        created_by: null,
      })
      .execute();
  }
  const token = newToken();
  await db
    .insertInto("sessions")
    .values({
      id: randomUUID(),
      token_hash: hashToken(token),
      user_id: id,
      stage: "full",
      created_at: now(),
      last_seen_at: now(),
    })
    .execute();
  return { id, cookie: `sb_session=${token}` };
}

/** The app, with every `inject` signed in as `role` unless it sends its own cookie. */
export async function signedInApp(options: AppOptions, role: Role = "superAdmin") {
  const app = await testApp(options);
  const { cookie } = await sessionCookie(app, role);
  const inject = app.inject.bind(app) as (opts: object) => ReturnType<App["inject"]>;
  app.inject = ((opts: { headers?: Record<string, string> }) =>
    inject({ ...opts, headers: { cookie, ...opts.headers } })) as unknown as App["inject"];
  return app;
}

/** A file as a multipart upload, for `inject`: `{ payload, headers }`. */
export { multipartFile } from "../src/multipart.js";

/**
 * `hours` from now as the admin's date pickers send it: Malaysian time with
 * its offset ("…T09:00:00+08:00"), not UTC.
 */
export const myt = (hours: number) =>
  `${new Date(Date.now() + (hours + 8) * 3_600_000).toISOString().slice(0, 19)}+08:00`;
