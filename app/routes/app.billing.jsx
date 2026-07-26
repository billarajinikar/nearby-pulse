import {
  useFetcher,
  useLoaderData,
  useRouteError,
} from "react-router";

import PropTypes from "prop-types";

import { authenticate } from "../shopify.server";

import {
  BILLING_PLANS,
  BILLING_PLAN_DETAILS,
} from "../constants/billing";

const PLANS = Object.values(
  BILLING_PLAN_DETAILS,
);

function isBillingTestMode() {
  return (
    process.env
      .SHOPIFY_BILLING_TEST_MODE ===
    "true"
  );
}

function resolveActivePlan(
  hasActivePayment,
  appSubscriptions,
) {
  if (!hasActivePayment) {
    return null;
  }

  const subscriptions =
    Array.isArray(appSubscriptions)
      ? appSubscriptions
      : [];

  const growthSubscription =
    subscriptions.find(
      (subscription) =>
        String(
          subscription?.name || "",
        )
          .toLowerCase()
          .includes(
            BILLING_PLANS.GROWTH,
          ),
    );

  if (growthSubscription) {
    return BILLING_PLANS.GROWTH;
  }

  return BILLING_PLANS.GROWTH;
}

const styles = {
  page: {
    width: "100%",
    maxWidth: 680,
    margin: "0 auto",
    padding: "32px 24px 48px",
    boxSizing: "border-box",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },

  headingSection: {
    marginBottom: 24,
  },

  title: {
    margin: "0 0 8px",
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
    color: "#8e1f0b",
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
    lineHeight: 1.5,
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
    boxShadow:
      "0 1px 3px rgba(0, 0, 0, 0.06)",
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
    margin: "0 0 6px",
    color: "#202223",
    fontSize: 21,
    lineHeight: 1.3,
  },

  price: {
    margin: "0 0 4px",
    color: "#202223",
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.25,
  },

  period: {
    marginLeft: 6,
    color: "#6d7175",
    fontSize: 15,
    fontWeight: 400,
  },

  trial: {
    margin: "5px 0 18px",
    color: "#008060",
    fontSize: 14,
    fontWeight: 600,
  },

  features: {
    margin: "0 0 24px",
    padding: 0,
    listStyle: "none",
  },

  feature: {
    display: "flex",
    alignItems: "flex-start",
    gap: 9,
    padding: "9px 0",
    color: "#3d4151",
    borderBottom:
      "1px solid #f1f1f1",
    fontSize: 14,
    lineHeight: 1.4,
  },

  check: {
    minWidth: 16,
    color: "#008060",
    fontWeight: 700,
  },

  currentPill: {
    padding: "12px 16px",
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

  inlineError: {
    marginTop: 12,
    marginBottom: 0,
    padding: "11px 14px",
    color: "#8e1f0b",
    background: "#fff4f4",
    border: "1px solid #fca5a5",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
  },

  footerNote: {
    marginTop: 18,
    color: "#6d7175",
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: "center",
  },
};

export const loader = async ({
  request,
}) => {
  const {
    billing,
    session,
  } = await authenticate.admin(
    request,
  );

  const isTest =
    isBillingTestMode();

  try {
    const {
      hasActivePayment,
      appSubscriptions,
    } = await billing.check({
      plans: [
        BILLING_PLANS.GROWTH,
      ],
      isTest,
    });

    const activePlan =
      resolveActivePlan(
        hasActivePayment,
        appSubscriptions,
      );

    if (isTest) {
      console.info(
        "[NearbyPulse Billing] Status",
        {
          shop: session.shop,
          hasActivePayment,
          activePlan,
          subscriptionCount:
            Array.isArray(
              appSubscriptions,
            )
              ? appSubscriptions.length
              : 0,
        },
      );
    }

    return {
      shop: session.shop,
      activePlan,
      hasActivePayment,
      billingError: false,
      isTest,
    };
  } catch (error) {
    console.error(
      "[NearbyPulse Billing] Check failed:",
      error,
    );

    return {
      shop: session.shop,
      activePlan: null,
      hasActivePayment: false,
      billingError: true,
      isTest,
    };
  }
};

export const action = async ({
  request,
}) => {
  const {
    billing,
    session,
  } = await authenticate.admin(
    request,
  );

  const formData =
    await request.formData();

  const selectedPlan =
    formData.get("plan");

  if (
    selectedPlan !==
    BILLING_PLANS.GROWTH
  ) {
    return Response.json(
      {
        error:
          "Invalid billing plan.",
      },
      {
        status: 400,
      },
    );
  }

  const isTest =
    isBillingTestMode();

  let hasActivePayment = false;

  try {
    const billingStatus =
      await billing.check({
        plans: [
          BILLING_PLANS.GROWTH,
        ],
        isTest,
      });

    hasActivePayment =
      billingStatus.hasActivePayment;
  } catch (error) {
    console.error(
      "[NearbyPulse Billing] Pre-request check failed:",
      error,
    );

    return Response.json(
      {
        error:
          "Unable to verify the current subscription. Please try again.",
      },
      {
        status: 500,
      },
    );
  }

  if (hasActivePayment) {
    return Response.json(
      {
        error:
          "The Growth plan is already active.",
      },
      {
        status: 409,
      },
    );
  }

  const requestUrl =
    new URL(request.url);

  const returnUrl =
    `${requestUrl.origin}/app/billing`;

  console.info(
    "[NearbyPulse Billing] Starting subscription",
    {
      shop: session.shop,
      plan:
        BILLING_PLANS.GROWTH,
      isTest,
    },
  );

  return billing.request({
    plan:
      BILLING_PLANS.GROWTH,
    isTest,
    returnUrl,
  });
};

function PlanCard({
  plan,
  isActive,
  billingUnavailable,
}) {
  const fetcher =
    useFetcher();

  const isSubmitting =
    fetcher.state !== "idle";

  const actionError =
    fetcher.data?.error || null;

  const isButtonDisabled =
    isSubmitting ||
    billingUnavailable;

  const buttonStyle = {
    ...styles.subscribeButton,
    ...(isButtonDisabled
      ? styles.subscribeButtonDisabled
      : {}),
  };

  return (
    <div
      style={{
        ...styles.card,
        ...(isActive
          ? styles.activeCard
          : {}),
      }}
    >
      {isActive && (
        <div style={styles.badge}>
          Active
        </div>
      )}

      <h2 style={styles.planName}>
        {plan.name}
      </h2>

      <div style={styles.price}>
        {plan.price}

        <span style={styles.period}>
          {plan.period}
        </span>
      </div>

      <p style={styles.trial}>
        {plan.trialDays}-day free trial
      </p>

      <ul style={styles.features}>
        {plan.features.map(
          (feature) => (
            <li
              key={feature}
              style={styles.feature}
            >
              <span
                aria-hidden="true"
                style={styles.check}
              >
                ✓
              </span>

              <span>{feature}</span>
            </li>
          ),
        )}
      </ul>

      {isActive ? (
        <div style={styles.currentPill}>
          Current plan
        </div>
      ) : (
        <>
          <fetcher.Form method="post">
            <input
              type="hidden"
              name="plan"
              value={plan.key}
            />

            <button
              type="submit"
              style={buttonStyle}
              disabled={
                isButtonDisabled
              }
            >
              {isSubmitting
                ? "Opening Shopify billing..."
                : `Start ${plan.trialDays}-day free trial`}
            </button>
          </fetcher.Form>

          {actionError && (
            <div
              role="alert"
              style={
                styles.inlineError
              }
            >
              {actionError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

PlanCard.propTypes = {
  plan: PropTypes.shape({
    key:
      PropTypes.string.isRequired,

    name:
      PropTypes.string.isRequired,

    price:
      PropTypes.string.isRequired,

    period:
      PropTypes.string.isRequired,

    trialDays:
      PropTypes.number.isRequired,

    features:
      PropTypes.arrayOf(
        PropTypes.string,
      ).isRequired,
  }).isRequired,

  isActive:
    PropTypes.bool.isRequired,

  billingUnavailable:
    PropTypes.bool.isRequired,
};

export default function BillingPage() {
  const {
    activePlan,
    hasActivePayment,
    billingError,
    isTest,
  } = useLoaderData();

  const growthPlan =
    BILLING_PLAN_DETAILS[
      BILLING_PLANS.GROWTH
    ];

  return (
    <div style={styles.page}>
      <div
        style={
          styles.headingSection
        }
      >
        <h1 style={styles.title}>
          Billing
        </h1>

        <p style={styles.subtitle}>
          Start using NearbyPulse
          Growth with a 7-day free
          trial.
        </p>
      </div>

      {isTest && (
        <div
          role="status"
          style={styles.testBanner}
        >
          <strong>
            Test billing mode:
          </strong>{" "}
          This installation creates
          a Shopify test subscription
          and will not charge the
          store.
        </div>
      )}

      {billingError && (
        <div
          role="alert"
          style={styles.errorBanner}
        >
          Unable to load your billing
          status. Refresh this page
          and try again.
        </div>
      )}

      {hasActivePayment &&
        growthPlan && (
          <div
            role="status"
            style={
              styles.activeBanner
            }
          >
            <strong>
              Active subscription:
            </strong>{" "}
            NearbyPulse{" "}
            {growthPlan.name} —{" "}
            {growthPlan.price}{" "}
            {growthPlan.period}
          </div>
        )}

      <div style={styles.grid}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.key}
            plan={plan}
            isActive={
              activePlan ===
              plan.key
            }
            billingUnavailable={
              billingError
            }
          />
        ))}
      </div>

      <p style={styles.footerNote}>
        Your subscription is securely
        approved and managed through
        Shopify. You can review or
        cancel app charges from your
        Shopify admin.
      </p>
    </div>
  );
}

export function ErrorBoundary() {
  const error =
    useRouteError();

  console.error(
    "[NearbyPulse Billing] Route error:",
    error,
  );

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 32,
      }}
    >
      <div
        role="alert"
        style={
          styles.errorBanner
        }
      >
        <strong>
          Unable to load billing
        </strong>

        <p
          style={{
            margin: "6px 0 0",
          }}
        >
          NearbyPulse could not load
          the billing page. Refresh
          the page and try again.
        </p>
      </div>
    </div>
  );
}
