/* global process */

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
      "[NearbyPulse Billing] Shopify GraphQL errors:",
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
      "SHOPIFY_APP_HANDLE is not configured and the app handle could not be resolved from Shopify.",
    );
  }

  console.info(
    "[NearbyPulse Billing] Resolved app handle:",
    resolvedHandle,
  );

  return resolvedHandle;
}

export const loader = async ({ request }) => {
  const { authenticate } = await import(
    "../shopify.server"
  );

  const {
    admin,
    redirect,
    session,
  } = await authenticate.admin(request);

  const appHandle =
    await resolveAppHandle(admin);

  const storeHandle =
    session.shop.replace(
      /\.myshopify\.com$/i,
      "",
    );

  const pricingUrl =
    `https://admin.shopify.com/store/` +
    `${encodeURIComponent(storeHandle)}/charges/` +
    `${encodeURIComponent(appHandle)}/pricing_plans`;

  console.info(
    "[NearbyPulse Billing] Redirecting to hosted pricing page",
    {
      shop: session.shop,
      appHandle,
    },
  );

  return redirect(pricingUrl, {
    target: "_top",
  });
};

export default function BillingRedirect() {
  return null;
}
