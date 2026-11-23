import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanHttpBaseUrl,
  isSameOriginLoomaHost,
  resolveLoomaBaseUrl,
  resolveLoomaTargetUrl,
} from "./loomaUrl";

test("cleanHttpBaseUrl accepts valid http/https origins and strips trailing slashes", () => {
  assert.equal(
    cleanHttpBaseUrl("https://looma.prigidcollection.workers.dev///"),
    "https://looma.prigidcollection.workers.dev"
  );
  assert.equal(cleanHttpBaseUrl("http://localhost:3000/app/"), "http://localhost:3000/app");
  assert.equal(cleanHttpBaseUrl("javascript:alert(1)"), "");
  assert.equal(cleanHttpBaseUrl("data:text/html,xss"), "");
  assert.equal(cleanHttpBaseUrl("not a url"), "");
});

test("isSameOriginLoomaHost allows localhost and *.workers.dev only", () => {
  assert.equal(isSameOriginLoomaHost("localhost"), true);
  assert.equal(isSameOriginLoomaHost("127.0.0.1"), true);
  assert.equal(isSameOriginLoomaHost("looma.prigidcollection.workers.dev"), true);
  assert.equal(isSameOriginLoomaHost("looma-commerce-api.onrender.com"), false);
  assert.equal(isSameOriginLoomaHost(""), false);
});

test("resolveLoomaBaseUrl prioritizes runtime -> meta -> viteEnv and avoids external /profile loops", () => {
  assert.equal(
    resolveLoomaBaseUrl({
      runtimeUrl: "https://runtime.looma.example/",
      metaUrl: "https://meta.looma.example/",
      viteEnvUrl: "https://vite.looma.example/",
      currentHostname: "looma-commerce-api.onrender.com",
    }),
    "https://runtime.looma.example"
  );

  assert.equal(
    resolveLoomaBaseUrl({
      runtimeUrl: "",
      metaUrl: "https://meta.looma.example/",
      viteEnvUrl: "https://vite.looma.example/",
      currentHostname: "looma-commerce-api.onrender.com",
    }),
    "https://meta.looma.example"
  );

  assert.equal(
    resolveLoomaBaseUrl({
      runtimeUrl: "",
      metaUrl: "",
      viteEnvUrl: "https://looma.prigidcollection.workers.dev/",
      currentHostname: "looma-commerce-api.onrender.com",
    }),
    "https://looma.prigidcollection.workers.dev"
  );

  // When on external Commerce host without a configured Looma URL, return null instead of relative '/profile'
  assert.equal(
    resolveLoomaBaseUrl({
      runtimeUrl: "",
      metaUrl: "",
      viteEnvUrl: "",
      currentHostname: "looma-commerce-api.onrender.com",
    }),
    null
  );

  // When on Looma Workers host, same-origin relative fallback ('') is safe
  assert.equal(
    resolveLoomaBaseUrl({
      runtimeUrl: "",
      metaUrl: "",
      viteEnvUrl: "",
      currentHostname: "looma.prigidcollection.workers.dev",
    }),
    ""
  );
});

test("resolveLoomaTargetUrl generates absolute URLs for Looma entrypoints and null when unconfigured externally", () => {
  const opts = {
    runtimeUrl: "",
    metaUrl: "https://looma.prigidcollection.workers.dev",
    viteEnvUrl: "",
    currentHostname: "looma-commerce-api.onrender.com",
  };
  assert.equal(resolveLoomaTargetUrl("/profile", opts), "https://looma.prigidcollection.workers.dev/profile");
  assert.equal(resolveLoomaTargetUrl("/marketplace", opts), "https://looma.prigidcollection.workers.dev/marketplace");
  assert.equal(resolveLoomaTargetUrl("/", opts), "https://looma.prigidcollection.workers.dev/");

  const unconfiguredExternal = {
    runtimeUrl: "",
    metaUrl: "",
    viteEnvUrl: "",
    currentHostname: "looma-commerce-api.onrender.com",
  };
  assert.equal(resolveLoomaTargetUrl("/profile", unconfiguredExternal), null);
  assert.equal(resolveLoomaTargetUrl("/marketplace", unconfiguredExternal), null);
});
