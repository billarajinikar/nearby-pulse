export const BILLING_PLANS = {
  GROWTH: "growth",
};

export const BILLING_PLAN_DETAILS = {
  [BILLING_PLANS.GROWTH]: {
    key: BILLING_PLANS.GROWTH,
    name: "Growth",
    price: "$4.99",
    period: "per month",
    trialDays: 7,

    features: [
      "Unlimited widget displays",
      "Location-aware activity messages",
      "Merchant-created store messages",
      "Custom activity message templates",
      "Analytics dashboard",
      "Displayed city insights",
      "Product performance insights",
      "7-day free trial",
    ],
  },
};
