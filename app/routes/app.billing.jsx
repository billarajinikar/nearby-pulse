import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const returnUrl = `${url.origin}/app/billing`;

  await billing.require({
    plans: ["growth"],
    isTest: true,
    onFailure: async () =>
      billing.request({
        plan: "growth",
        isTest: true,
        returnUrl,
      }),
  });

  return {
    shop: session.shop,
  };
};

export default function BillingPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Billing</h1>
      <p>Your Growth plan is active.</p>
    </div>
  );
}
