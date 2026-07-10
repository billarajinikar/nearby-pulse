import { authenticate } from "../shopify.server";

export const loader = async () => {
  return new Response("Webhook endpoint accepts POST requests only.", {
    status: 405,
    headers: {
      Allow: "POST",
      "Content-Type": "text/plain",
    },
  });
};

export const action = async ({ request }) => {
  try {
    const { topic, shop, payload } =
      await authenticate.webhook(request);

    console.log(`Received ${topic} compliance webhook for ${shop}`);

    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
        console.log("Customer data request", payload);
        break;

      case "CUSTOMERS_REDACT":
        console.log("Customer redact request", payload);
        break;

      case "SHOP_REDACT":
        console.log("Shop redact request", payload);
        break;

      default:
        console.warn(`Unhandled compliance topic: ${topic}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Webhook authentication failed:", error);

    return new Response("Unauthorized", {
      status: 401,
    });
  }
};
