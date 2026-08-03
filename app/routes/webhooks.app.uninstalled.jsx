import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const {
    shop,
    session,
    admin,
    topic,
  } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session && admin) {
    try {
      const subscriptionsResponse =
        await admin.graphql(
          `#graphql
          query NearbyPulseActiveSubscriptions {
            currentAppInstallation {
              activeSubscriptions {
                id
                status
                test
              }
            }
          }`,
        );

      const subscriptionsPayload =
        await subscriptionsResponse.json();

      const activeSubscriptions =
        subscriptionsPayload?.data
          ?.currentAppInstallation
          ?.activeSubscriptions || [];

      for (const subscription of activeSubscriptions) {
        if (!subscription?.id) {
          continue;
        }

        const cancelResponse =
          await admin.graphql(
            `#graphql
            mutation NearbyPulseCancelSubscription($id: ID!, $prorate: Boolean!) {
              appSubscriptionCancel(id: $id, prorate: $prorate) {
                appSubscription {
                  id
                  status
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                id: subscription.id,
                prorate: false,
              },
            },
          );

        const cancelPayload =
          await cancelResponse.json();

        const userErrors =
          cancelPayload?.data
            ?.appSubscriptionCancel
            ?.userErrors || [];

        if (userErrors.length > 0) {
          console.warn(
            `[NearbyPulse Billing] Failed to cancel subscription ${subscription.id} on uninstall for ${shop}`,
            userErrors,
          );
        } else {
          console.info(
            `[NearbyPulse Billing] Cancelled subscription ${subscription.id} on uninstall for ${shop}`,
          );
        }
      }
    } catch (error) {
      console.error(
        `[NearbyPulse Billing] Unable to cancel subscriptions on uninstall for ${shop}`,
        error,
      );
    }
  }

  if (session) {
    await db.session.deleteMany({
      where: { shop },
    });
  }

  return new Response(null, { status: 200 });
};
