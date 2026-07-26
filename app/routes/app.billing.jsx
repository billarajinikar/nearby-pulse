import {
  useFetcher,
  useLoaderData,
  useRouteError,
} from "react-router";

import { authenticate } from "../shopify.server";

const PLANS = [
  {
    key: "growth",
    name: "Growth",
    price: "$4.99",
    period: "/ month",
    features: [
      "Unlimited widget displays",
      "Location-aware social proof",
      "Custom message templates",
      "Analytics dashboard",
      "Visitor and displayed city insights",
      "Product performance insights",
      "7-day free trial",
    ],
  },
];

const styles = {
  page: {
    maxWidth: 620,
    margin: "0 auto",
    padding: "32px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },

  headingSection: {
    marginBottom: 24,
  },

  title: {
    margin: "0 0 8px 0",
    color: "#202223",
    fontSize: 26,
    lineHeight: 1.3,
  },

  subtitle: {
    margin: 0,
    color: "#6d7175",
    fontSize: 15,
    lineHeight: 1.5,
  },

  errorBanner: {
    marginBottom: 20,
    padding: "14px 18px",
    color: "#b91c1c",
    background: "#fff4f4",
    border: "1px solid #fca5a5",
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 1.5,
  },

  activeBanner: {
    marginBottom: 24,
    padding: "14px 18px",
    color: "#1a6b3c",
    background: "#e3f1df",
    border: "1px solid #bbe5b3",
    borderRadius: 8,
    fontSize: 14,
  },

  testBanner: {
    marginBottom: 20,
    padding: "12px 16px",
    color: "#5c3b00",
    background: "#fff8db",
    border: "1px solid #f1c21b",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 20,
  },

  card: {
    position: "relative",
    padding: 28,
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: 14,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.06)",
  },

  activeCard: {
    border: "2px solid #008060",
  },

  badge: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: "4px 10px",
    color: "#ffffff",
    background: "#008060",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },

  planName: {
    margin: "0 0 6px 0",
    color: "#202223",
    fontSize: 21,
  },

  price: {
    margin: "0 0 4px 0",
    color: "#202223",
    fontSize: 32,
    fontWeight: 700,
  },

  period: {
    marginLeft: 4,
    color: "#6d7175",
    fontSize: 15,
    fontWeight: 400,
  },

  trial: {
    margin: "5px 0 18px 0",
    color: "#008060",
    fontSize: 14,
    fontWeight: 600,
  },

  features: {
    margin: "0 0 24px 0",
    padding: 0,
    listStyle: "none",
  },

  feature: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    padding: "9px 0",
    color: "#3d4151",
    borderBottom: "1px solid #f1f1f1",
    fontSize: 14,
    lineHeight: 1.4,
  },

  check: {
    minWidth: 16,
    color: "#008060",
    fontWeight: 700,
  },

  currentPill: {
    padding: "11px 0",
    color: "#1a6b3c",
    background: "#e3f1df",
    borderRadius: 8,
    textAlign: "center",
    fontSize: 14,
    fontWeight: 700,
  },

  subscribeButton: {
    width: "100%",
    padding: "12px 16px",
    color: "#ffffff",
    background: "#202223",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },

  subscribeButtonDisabled: {
    cursor: "not-allowed",
    opacity: 0.65,
  },

  footerNote: {
    marginTop: 18,
    color: "#6d7175",
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: "center",
  },
};

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);

  /*
   * Development and preview deployments create test subscriptions.
   * Production creates real subscriptions.
   */
  const isTest = process.env.NODE_ENV !== "production";

  try {
    const { hasActivePayment, appSubscriptions } =
      await billing.check({
        plans: ["growth"],
        isTest,
      });

    const subscriptionName =
      appSubscriptions?.[0]?.name?.toLowerCase() || "";

    let activePlan = null;

    if (hasActivePayment) {
      if (subscriptionName.includes("growth")) {
        activePlan = "growth";
      } else {
        /*
         * There is only one available plan, so an active payment
         * belongs to the Growth plan even if Shopify returns a
         * slightly different subscription name.
         */
        activePlan = "growth";
      }
    }

    if (isTest) {
      console.log("NearbyPulse billing status", {
        shop: session.shop,
        hasActivePayment,
        activePlan,
        appSubscriptions,
      });
    }

    return {
      shop: session.shop,
      activePlan,
      hasActivePayment,
      billingError: false,
      isTest,
    };
  } catch (error) {
    console.error("Billing check failed:", error);

    return {
      shop: session.shop,
      activePlan: null,
      hasActivePayment: false,
      billingError: true,
      isTest,
    };
  }
};

export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);

  const formData = await request.formData();
  const selectedPlan = formData.get("plan");

  if (selectedPlan !== "growth") {
    return Response.json(
      {
        error: "Invalid billing plan.",
      },
      {
        status: 400,
      },
    );
  }

  const isTest = process.env.NODE_ENV !== "production";
  const requestUrl = new URL(request.url);

  const returnUrl = `${requestUrl.origin}/app/billing`;

  return billing.request({
    plan: "growth",
    isTest,
    returnUrl,
  });
};

function PlanCard({ plan, isActive }) {
  const fetcher = useFetcher();

  const isSubmitting = fetcher.state !== "idle";

  const buttonStyle = {
    ...styles.subscribeButton,
    ...(isSubmitting
      ? styles.subscribeButtonDisabled
      : {}),
  };

  return (
    <div
      style={{
        ...styles.card,
        ...(isActive ? styles.activeCard : {}),
      }}
    >
      {isActive && (
        <div style={styles.badge}>Active</div>
      )}

      <h2 style={styles.planName}>{plan.name}</h2>

      <div style={styles.price}>
        {plan.price}
        <span style={styles.period}>{plan.period}</span>
      </div>

      <p style={styles.trial}>7-day free trial</p>

      <ul style={styles.features}>
        {plan.features.map((feature) => (
          <li key={feature} style={styles.feature}>
            <span style={styles.check}>✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isActive ? (
        <div style={styles.currentPill}>
          Current plan
        </div>
      ) : (
        <fetcher.Form method="post">
          <input
            type="hidden"
            name="plan"
            value={plan.key}
          />

          <button
            type="submit"
            style={buttonStyle}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Opening Shopify billing..."
              : "Start 7-day free trial"}
          </button>
        </fetcher.Form>
      )}
    </div>
  );
}

export default function BillingPage() {
  const {
    activePlan,
    hasActivePayment,
    billingError,
    isTest,
  } = useLoaderData();

  return (
    <div style={styles.page}>
      <div style={styles.headingSection}>
        <h1 style={styles.title}>Billing</h1>

        <p style={styles.subtitle}>
          Choose the NearbyPulse Growth plan and start
          with a 7-day free trial.
        </p>
      </div>

      {isTest && (
        <div style={styles.testBanner}>
          <strong>Test billing mode:</strong> This
          installation creates a Shopify test
          subscription and will not charge the store.
        </div>
      )}

      {billingError && (
        <div style={styles.errorBanner}>
          Unable to load your billing status. Refresh
          this page and try again. Check the application
          logs if the problem continues.
        </div>
      )}

      {hasActivePayment && (
        <div style={styles.activeBanner}>
          <strong>Active subscription:</strong>{" "}
          NearbyPulse Growth — $9.99 per month
        </div>
      )}

      <div style={styles.grid}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            isActive={activePlan === plan.key}
          />
        ))}
      </div>

      <p style={styles.footerNote}>
        Your subscription is managed securely through
        Shopify. You can review or cancel app charges
        from your Shopify admin.
      </p>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error, null, 2);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 32,
      }}
    >
      <h1
        style={{
          marginBottom: 12,
          color: "#202223",
          fontSize: 22,
        }}
      >
        Billing page error
      </h1>

      <pre
        style={{
          padding: 16,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          background: "#f6f6f7",
          border: "1px solid #e1e3e5",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        {message}
      </pre>
    </div>
  );
}
