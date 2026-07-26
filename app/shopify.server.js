import "@shopify/shopify-app-react-router/adapters/node";

import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";

import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import prisma from "./db.server";

/**
 * NearbyPulse billing plan identifiers.
 *
 * Use the same plan key everywhere:
 * - shopify.server.jsx
 * - app.billing.jsx
 * - billing.check()
 * - billing.request()
 */
export const BILLING_PLANS = {
  GROWTH: "growth",
};

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

  /**
   * Manual Shopify Billing API configuration.
   *
   * The visible pricing text on your billing page does not
   * determine the actual charge. This configuration does.
   */
  billing: {
    [BILLING_PLANS.GROWTH]: {
      lineItems: [
        {
          amount: 4.99,
          currencyCode: "USD",
          interval:
            BillingInterval.Every30Days,
        },
      ],

      trialDays: 7,
    },
  },

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
