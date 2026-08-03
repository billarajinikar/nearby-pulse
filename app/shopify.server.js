import "@shopify/shopify-app-react-router/adapters/node";

import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";

import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,

  apiSecretKey:
    process.env.SHOPIFY_API_SECRET || "",

  /**
   * October25 represents Shopify API version 2025-10.
   *
   * It is still within Shopify's normal supported API-version
   * lifecycle as of July 2026, but plan an upgrade before it
   * reaches the end of its support period.
   */
  apiVersion: ApiVersion.October25,

  scopes: process.env.SCOPES
    ?.split(",")
    .map((scope) => scope.trim())
    .filter(Boolean),

  appUrl:
    process.env.SHOPIFY_APP_URL || "",

  authPathPrefix: "/auth",

  sessionStorage:
    new PrismaSessionStorage(prisma),

  distribution:
    AppDistribution.AppStore,

  future: {
    expiringOfflineAccessTokens: true,
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? {
        customShopDomains: [
          process.env.SHOP_CUSTOM_DOMAIN,
        ],
      }
    : {}),
});

export default shopify;

export const apiVersion =
  ApiVersion.October25;

export const addDocumentResponseHeaders =
  shopify.addDocumentResponseHeaders;

export const authenticate =
  shopify.authenticate;

export const unauthenticated =
  shopify.unauthenticated;

export const login =
  shopify.login;

export const registerWebhooks =
  shopify.registerWebhooks;

export const sessionStorage =
  shopify.sessionStorage;
