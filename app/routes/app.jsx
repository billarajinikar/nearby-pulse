/* global process */

import {
  Outlet,
  useLoaderData,
  useRouteError,
} from "react-router";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import {
  AppProvider,
} from "@shopify/shopify-app-react-router/react";

import {
  authenticate,
} from "../shopify.server";

import {
  ensureShopSetup,
} from "../services/shop-onboarding.server";

/**
 * Resolve the Shopify app handle.
 *
 * Preferred source:
 * SHOPIFY_APP_HANDLE environment variable.
 *
 * Fallback:
 * Shopify Admin GraphQL API.
 */
async function resolveAppHandle(admin) {
  const configuredHandle =
    process.env.SHOPIFY_APP_HANDLE?.trim();

  if (configuredHandle) {
    return configuredHandle;
  }

  const response = await admin.graphql(
    `#graphql
      query NearbyPulseAppHandle {
        currentAppInstallation {
          app {
            handle
          }
        }
      }
    `,
  );

  if (!response.ok) {
    throw new Error(
      `Unable to resolve Shopify app handle. HTTP ${response.status}`,
    );
  }

  const payload = await response.json();

  if (
    Array.isArray(payload.errors) &&
    payload.errors.length > 0
  ) {
    console.error(
      "[NearbyPulse Billing] App-handle GraphQL errors:",
      payload.errors,
    );

    throw new Error(
      "Shopify returned an error while resolving the app handle.",
    );
  }

  const resolvedHandle =
    payload?.data
      ?.currentAppInstallation
      ?.app
      ?.handle
      ?.trim();

  if (!resolvedHandle) {
    throw new Error(
      "SHOPIFY_APP_HANDLE is not configured and Shopify did not return an app handle.",
    );
  }

  console.info(
    "[NearbyPulse Billing] Resolved Shopify app handle:",
    resolvedHandle,
  );

  return resolvedHandle;
}

/**
 * Build the Shopify-hosted App Pricing URL.
 */
function buildPricingUrl({
  shop,
  appHandle,
}) {
  const storeHandle = shop.replace(
    /\.myshopify\.com$/i,
    "",
  );

  return (
    "https://admin.shopify.com/store/" +
    `${encodeURIComponent(storeHandle)}/charges/` +
    `${encodeURIComponent(appHandle)}/pricing_plans`
  );
}

export const loader = async ({
  request,
}) => {
  const {
    admin,
    billing,
    redirect,
    session,
  } = await authenticate.admin(request);

  const url = new URL(request.url);

  /*
   * Allow /app/billing to reach its child loader.
   * That route redirects directly to Shopify's hosted
   * pricing and subscription-management page.
   */
  const isBillingRoute =
    url.pathname === "/app/billing" ||
    url.pathname.startsWith(
      "/app/billing/",
    );

  /*
   * Shopify remains the source of truth for whether
   * the merchant has an active subscription.
   */
  const {
    hasActivePayment,
  } = await billing.check();

  /*
   * Merchants without an active subscription should
   * be sent directly to Shopify App Pricing.
   */
  if (
    !hasActivePayment &&
    !isBillingRoute
  ) {
    const appHandle =
      await resolveAppHandle(admin);

    const pricingUrl =
      buildPricingUrl({
        shop: session.shop,
        appHandle,
      });

    console.info(
      "[NearbyPulse Billing] No active subscription. Redirecting to Shopify pricing.",
      {
        shop: session.shop,
        appHandle,
      },
    );

    return redirect(pricingUrl, {
      target: "_top",
    });
  }

  /*
   * Initialise the merchant only after an active
   * Shopify subscription has been confirmed.
   *
   * Do not initialise an unpaid shop merely because
   * it visited /app/billing.
   */
  if (hasActivePayment) {
    await ensureShopSetup(
      session.shop,
    );
  }

  return {
    apiKey:
      process.env.SHOPIFY_API_KEY ||
      "",

    hasActivePayment,
  };
};

export default function App() {
  const {
    apiKey,
  } = useLoaderData();

  return (
    <AppProvider
      embedded
      apiKey={apiKey}
    >
      <s-app-nav>
        <s-link href="/app">
          Home
        </s-link>

        <s-link href="/app/settings">
          Settings
        </s-link>

        <s-link href="/app/analytics">
          Analytics
        </s-link>

        <s-link href="/app/billing">
          Billing
        </s-link>

        <s-link href="/support">
          Support
        </s-link>

        <s-link href="/privacy">
          Privacy
        </s-link>

        <s-link href="/terms">
          Terms
        </s-link>
      </s-app-nav>

      <Outlet />
    </AppProvider>
  );
}

/**
 * Shopify requires React Router errors and redirects
 * to preserve Shopify-specific response headers.
 */
export function ErrorBoundary() {
  return boundary.error(
    useRouteError(),
  );
}

export const headers = (
  headersArgs,
) => {
  return boundary.headers(
    headersArgs,
  );
};
