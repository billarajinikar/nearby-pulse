/* global process */

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

export const loader = async ({
  request,
}) => {
  const { authenticate } =
    await import(
      "../shopify.server"
    );

  const {
    admin,
    redirect,
    session,
  } = await authenticate.admin(
    request,
  );

  const storeHandle =
    session.shop.replace(
      ".myshopify.com",
      "",
    );

  const appHandle =
    await resolveAppHandle(
      admin,
    );

  const pricingUrl =
    `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;

  return redirect(pricingUrl, {
    target: "_top",
  });
};

export default function BillingRedirect() {
  return null;
}

