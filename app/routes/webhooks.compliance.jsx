import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // Nearby Pulse currently doesn't store customer personal data.
      // If that changes, locate the requested customer's data
      // and provide it to the merchant.
      console.log("Customer data request received", payload);
      break;

    case "CUSTOMERS_REDACT":
      // Delete any stored personal data associated with this customer.
      console.log("Customer redaction request received", payload);
      break;

    case "SHOP_REDACT":
      // Delete data stored for the shop after uninstall.
      console.log("Shop redaction request received", payload);
      break;

    default:
      console.warn(`Unhandled compliance webhook topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
