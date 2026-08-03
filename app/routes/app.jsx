/* global process */

import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../services/shop-onboarding.server";

async function resolveAppHandle(admin) {
  if (process.env.SHOPIFY_APP_HANDLE) {
    return process.env.SHOPIFY_APP_HANDLE;
  }

  const response =
    await admin.graphql(
      `#graphql
      query NearbyPulseAppHandle {
        currentAppInstallation {
          app {
            handle
          }
        }
      }`,
    );

  const payload =
    await response.json();

  const resolvedHandle =
    payload?.data
      ?.currentAppInstallation
      ?.app?.handle;

  if (resolvedHandle) {
    return resolvedHandle;
  }

  throw new Error(
    "SHOPIFY_APP_HANDLE is not configured and app handle could not be resolved from Shopify Admin API.",
  );
}

export const loader = async ({ request }) => {
  const {
    admin,
    billing,
    redirect,
    session,
  } = await authenticate.admin(
    request,
  );

  const appHandle =
    await resolveAppHandle(
      admin,
    );

  const {
    hasActivePayment,
  } = await billing.check();

  const url =
    new URL(request.url);

  const isBillingRoute =
    url.pathname ===
    "/app/billing";

  if (
    !hasActivePayment &&
    !isBillingRoute
  ) {
    const storeHandle =
      session.shop.replace(
        ".myshopify.com",
        "",
      );

    const pricingUrl =
      `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;

    return redirect(pricingUrl, {
      target: "_top",
    });
  }

  await ensureShopSetup(session.shop);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
  <s-link href="/app">Home</s-link>

  <s-link href="/app/settings">Settings</s-link>

  <s-link href="/app/analytics">Analytics</s-link>

  <s-link href="/app/billing">Billing</s-link>

  <s-link href="/support">Support</s-link>

  <s-link href="/privacy">Privacy</s-link>

  <s-link href="/terms">Terms</s-link>
</s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};


