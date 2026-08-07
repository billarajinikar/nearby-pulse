import {
  Link,
  useLoaderData,
} from "react-router";

import PropTypes from "prop-types";

import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";


const PERIOD_DAYS = 30;


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getPeriodStart(days = 30) {
  const date = new Date();

  date.setUTCDate(
    date.getUTCDate() - days,
  );

  return date.toISOString();
}


function percent(
  numerator,
  denominator,
) {
  if (
    !denominator ||
    denominator <= 0
  ) {
    return 0;
  }

  return Math.round(
    (numerator / denominator) *
      1000,
  ) / 10;
}


function formatNumber(value) {
  return Number(
    value || 0,
  ).toLocaleString("en-GB");
}


function buildProductStats(
  activities,
) {
  const products = new Map();

  for (
    const activity of
    activities || []
  ) {
    const productId =
      activity.product_id;

    if (!productId) {
      continue;
    }

    if (
      !products.has(productId)
    ) {
      products.set(
        productId,
        {
          productId,

          productTitle:
            activity.product_title ||
            "Unknown product",

          views: 0,

          carts: 0,

          checkouts: 0,

          purchases: 0,
        },
      );
    }

    const product =
      products.get(productId);

    switch (
      activity.event_type
    ) {
      case "product_viewed":
        product.views += 1;
        break;

      case "add_to_cart":
        product.carts += 1;
        break;

      case "checkout_started":
        product.checkouts += 1;
        break;

      case "order_completed":

        /*
         * Purchase social proof is only
         * considered trusted when the
         * activity has been verified.
         */
        if (
          activity.verified === true
        ) {
          product.purchases += 1;
        }

        break;

      default:
        break;
    }
  }

  return Array.from(
    products.values(),
  );
}


/*
|--------------------------------------------------------------------------
| Opportunity engine — deliberately simple for v1
|--------------------------------------------------------------------------
|
| This is not AI.
|
| It turns observable activity into a factual
| suggestion without claiming causation.
|--------------------------------------------------------------------------
*/

function findOpportunity(
  productStats,
) {
  const candidates =
    productStats
      .filter(
        (product) =>
          product.views >= 5,
      )
      .map(
        (product) => ({
          ...product,

          cartRate:
            percent(
              product.carts,
              product.views,
            ),
        }),
      )
      .sort(
        (first, second) => {

          /*
           * Prioritise products receiving
           * more attention but weaker
           * add-to-cart behaviour.
           */
          const firstScore =
            first.views *
            (1 -
              Math.min(
                first.cartRate /
                  100,
                1,
              ));

          const secondScore =
            second.views *
            (1 -
              Math.min(
                second.cartRate /
                  100,
                1,
              ));

          return (
            secondScore -
            firstScore
          );
        },
      );


  const opportunity =
    candidates[0];

  if (!opportunity) {
    return null;
  }


  if (
    opportunity.carts === 0
  ) {
    return {
      productTitle:
        opportunity.productTitle,

      headline:
        "High interest, no cart activity yet",

      text:
        `${formatNumber(
          opportunity.views,
        )} product views were recorded, but no add-to-cart activity was recorded during this period.`,

      recommendation:
        "Review the product page's trust signals, product information, shipping details and call-to-action.",
    };
  }


  if (
    opportunity.cartRate < 5
  ) {
    return {
      productTitle:
        opportunity.productTitle,

      headline:
        "Interest is stronger than buying intent",

      text:
        `${formatNumber(
          opportunity.views,
        )} views generated ${formatNumber(
          opportunity.carts,
        )} add-to-cart events (${opportunity.cartRate}%).`,

      recommendation:
        "Consider strengthening product-page trust signals and monitor whether add-to-cart activity improves.",
    };
  }


  return {
    productTitle:
      opportunity.productTitle,

    headline:
      "Product worth watching",

    text:
      `${formatNumber(
        opportunity.views,
      )} views and ${formatNumber(
        opportunity.carts,
      )} add-to-cart events were recorded.`,

    recommendation:
      "Keep monitoring this product as more customer activity is collected.",
  };
}


/*
|--------------------------------------------------------------------------
| Loader
|--------------------------------------------------------------------------
*/

export const loader =
  async ({ request }) => {

    const { session } =
      await authenticate.admin(
        request,
      );

    const shop =
      session.shop;

    const periodStart =
      getPeriodStart(
        PERIOD_DAYS,
      );


    const [
      totalDisplaysResult,

      periodDisplaysResult,

      activityResult,

      messageResult,
    ] = await Promise.all([

      /*
       * Used to decide whether merchant
       * should see Setup or Intelligence.
       */
      supabase
        .from(
          "analytics_events",
        )
        .select(
          "*",
          {
            count: "exact",
            head: true,
          },
        )
        .eq(
          "shop",
          shop,
        )
        .eq(
          "event_type",
          "widget_shown",
        ),


      /*
       * NearbyPulse displays during
       * the Intelligence period.
       */
      supabase
        .from(
          "analytics_events",
        )
        .select(
          "*",
          {
            count: "exact",
            head: true,
          },
        )
        .eq(
          "shop",
          shop,
        )
        .eq(
          "event_type",
          "widget_shown",
        )
        .gte(
          "created_at",
          periodStart,
        ),


      /*
       * Genuine storefront activity.
       */
      supabase
        .from(
          "storefront_activities",
        )
        .select(
          `
            id,
            event_type,
            product_id,
            product_title,
            verified,
            created_at
          `,
        )
        .eq(
          "shop",
          shop,
        )
        .gte(
          "created_at",
          periodStart,
        )
        .order(
          "created_at",
          {
            ascending: false,
          },
        )
        .limit(5000),


      /*
       * NearbyPulse messages shown.
       *
       * Used for Activity vs Store
       * Message breakdown.
       */
      supabase
        .from(
          "analytics_events",
        )
        .select(
          `
            message_type,
            product_id,
            product_title,
            source_activity_type,
            created_at
          `,
        )
        .eq(
          "shop",
          shop,
        )
        .eq(
          "event_type",
          "widget_shown",
        )
        .gte(
          "created_at",
          periodStart,
        )
        .order(
          "created_at",
          {
            ascending: false,
          },
        )
        .limit(2000),
    ]);


    const errors = [
      totalDisplaysResult.error,
      periodDisplaysResult.error,
      activityResult.error,
      messageResult.error,
    ].filter(Boolean);


    if (errors.length > 0) {
      console.error(
        "[NearbyPulse Intelligence] Loader error:",
        errors[0],
      );
    }


    const totalDisplays =
      totalDisplaysResult.count ||
      0;


    const periodDisplays =
      periodDisplaysResult.count ||
      0;


    const activities =
      activityResult.data ||
      [];


    const messageEvents =
      messageResult.data ||
      [];


    /*
    |--------------------------------------------------------------------------
    | Funnel counts
    |--------------------------------------------------------------------------
    */

    const productViews =
      activities.filter(
        (activity) =>
          activity.event_type ===
          "product_viewed",
      ).length;


    const addToCarts =
      activities.filter(
        (activity) =>
          activity.event_type ===
          "add_to_cart",
      ).length;


    const checkouts =
      activities.filter(
        (activity) =>
          activity.event_type ===
          "checkout_started",
      ).length;


    const verifiedPurchases =
      activities.filter(
        (activity) =>
          activity.event_type ===
            "order_completed" &&
          activity.verified === true,
      ).length;


    /*
    |--------------------------------------------------------------------------
    | Message mix
    |--------------------------------------------------------------------------
    */

    const activityMessages =
      messageEvents.filter(
        (event) =>
          event.message_type ===
          "activity",
      ).length;


    const storeMessages =
      messageEvents.filter(
        (event) =>
          event.message_type ===
          "announcement",
      ).length;


    /*
    |--------------------------------------------------------------------------
    | Product opportunity
    |--------------------------------------------------------------------------
    */

    const productStats =
      buildProductStats(
        activities,
      );


    const opportunity =
      findOpportunity(
        productStats,
      );


    return {
      setupComplete:
        totalDisplays > 0,

      totalDisplays,

      periodDays:
        PERIOD_DAYS,

      funnel: {
        productViews,
        nearbyPulseDisplays:
          periodDisplays,
        addToCarts,
        checkouts,
        verifiedPurchases,
      },

      messageMix: {
        activityMessages,
        storeMessages,
      },

      opportunity,
    };
  };


/*
|--------------------------------------------------------------------------
| Page
|--------------------------------------------------------------------------
*/

export default function Index() {

  const data =
    useLoaderData();


  /*
  |--------------------------------------------------------------------------
  | New merchant onboarding
  |--------------------------------------------------------------------------
  */

  if (!data.setupComplete) {
    return (
      <SetupPage />
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Returning merchant
  |--------------------------------------------------------------------------
  */

  return (
    <div style={styles.page}>

      <header style={styles.header}>

        <div>

          <p style={styles.eyebrow}>
            NearbyPulse Intelligence
          </p>

          <h1 style={styles.title}>
            Here's what's happening in your store.
          </h1>

          <p style={styles.subtitle}>
            A simple view of customer activity and
            where NearbyPulse is appearing during
            the last {data.periodDays} days.
          </p>

        </div>


        <div style={styles.headerActions}>

          <Link
            to="/app/settings"
            style={
              styles.secondaryButton
            }
          >
            Settings
          </Link>

          <Link
            to="/app/analytics"
            style={
              styles.primaryButton
            }
          >
            View details
          </Link>

        </div>

      </header>



      <section style={styles.funnelCard}>

        <div style={styles.cardHeader}>

          <div>

            <p style={styles.eyebrow}>
              Last {data.periodDays} days
            </p>

            <h2 style={styles.cardTitle}>
              Customer Funnel
            </h2>

            <p style={styles.helpText}>
              Activity recorded across product
              pages where NearbyPulse is installed.
            </p>

          </div>

        </div>


        <div style={styles.funnel}>

          <FunnelStep
            label="Product Views"
            value={
              data.funnel.productViews
            }
          />

          <FunnelArrow />

          <FunnelStep
            label="NearbyPulse Displays"
            value={
              data.funnel
                .nearbyPulseDisplays
            }
            highlight
          />

          <FunnelArrow />

          <FunnelStep
            label="Added to Cart"
            value={
              data.funnel.addToCarts
            }
          />

          <FunnelArrow />

          <FunnelStep
            label="Checkout Started"
            value={
              data.funnel.checkouts
            }
          />

          <FunnelArrow />

          <FunnelStep
            label="Verified Purchases"
            value={
              data.funnel
                .verifiedPurchases
            }
          />

        </div>


        <p style={styles.disclaimer}>
          These counts describe activity observed
          during the period. They do not yet claim
          that a NearbyPulse display caused a later
          cart, checkout or purchase.
        </p>

      </section>



      <div style={styles.grid}>


        <section style={styles.card}>

          <p style={styles.eyebrow}>
            Opportunity
          </p>

          {data.opportunity ? (
            <>

              <h2 style={styles.cardTitle}>
                {
                  data.opportunity
                    .productTitle
                }
              </h2>

              <h3
                style={
                  styles.opportunityHeadline
                }
              >
                {
                  data.opportunity
                    .headline
                }
              </h3>

              <p style={styles.text}>
                {
                  data.opportunity
                    .text
                }
              </p>

              <div
                style={
                  styles.recommendation
                }
              >

                <strong>
                  Recommended action
                </strong>

                <p
                  style={
                    styles.recommendationText
                  }
                >
                  {
                    data.opportunity
                      .recommendation
                  }
                </p>

              </div>

            </>
          ) : (
            <>

              <h2 style={styles.cardTitle}>
                Collecting activity
              </h2>

              <p style={styles.text}>
                NearbyPulse needs a little more
                product activity before it can
                surface a useful opportunity.
              </p>

            </>
          )}

        </section>



        <section style={styles.card}>

          <p style={styles.eyebrow}>
            Message mix
          </p>

          <h2 style={styles.cardTitle}>
            What shoppers are seeing
          </h2>


          <MetricRow
            label="Activity Messages"
            value={
              data.messageMix
                .activityMessages
            }
          />


          <MetricRow
            label="Store Messages"
            value={
              data.messageMix
                .storeMessages
            }
          />


          <div style={styles.messageInsight}>

            {data.messageMix
              .activityMessages >
            data.messageMix
              .storeMessages ? (

              <p style={styles.text}>
                NearbyPulse is currently showing
                more real activity-backed messages
                than merchant announcements.
              </p>

            ) : (

              <p style={styles.text}>
                Store Messages currently make up a
                larger share of displays. As more
                eligible nearby activity is
                collected, Activity Messages may
                appear more often.
              </p>

            )}

          </div>


          <Link
            to="/app/analytics"
            style={
              styles.textLink
            }
          >
            Explore message activity →
          </Link>

        </section>

      </div>



      <section style={styles.statusCard}>

        <div>

          <div style={styles.statusLine}>

            <span style={styles.liveDot}>
            </span>

            <strong>
              NearbyPulse is active
            </strong>

          </div>

          <p style={styles.statusText}>
            {formatNumber(
              data.totalDisplays,
            )} widget displays have been recorded
            since installation.
          </p>

        </div>


        <div style={styles.quickLinks}>

          <Link
            to="/app/settings"
            style={styles.textLink}
          >
            Settings
          </Link>

          <Link
            to="/app/support"
            style={styles.textLink}
          >
            Support
          </Link>

        </div>

      </section>

    </div>
  );
}


/*
|--------------------------------------------------------------------------
| Setup experience
|--------------------------------------------------------------------------
*/

function SetupPage() {

  return (
    <div style={styles.page}>

      <section style={styles.setupHero}>

        <p style={styles.eyebrow}>
          Welcome to NearbyPulse
        </p>

        <h1 style={styles.title}>
          Let's get NearbyPulse live.
        </h1>

        <p style={styles.subtitle}>
          Add the NearbyPulse theme block to a
          product page. Once the first message is
          displayed, this page automatically
          becomes your Intelligence dashboard.
        </p>

      </section>


      <section style={styles.card}>

        <h2 style={styles.cardTitle}>
          Setup checklist
        </h2>

        <ChecklistItem
          done
          text="App installed"
        />

        <ChecklistItem
          done
          text="Shopify connected"
        />

        <ChecklistItem
          text="Add NearbyPulse block to your product page"
        />

        <ChecklistItem
          text="Visit a product page and confirm the message appears"
        />

        <ChecklistItem
          text="First NearbyPulse display recorded"
        />

      </section>


      <div style={styles.grid}>

        <section style={styles.card}>

          <h2 style={styles.cardTitle}>
            Next step
          </h2>

          <p style={styles.text}>
            Configure NearbyPulse, add the theme
            block near your product's Add to Cart
            button, then visit a product page.
          </p>

          <div style={styles.actions}>

            <Link
              to="/app/settings"
              style={
                styles.primaryButton
              }
            >
              Open Settings
            </Link>

          </div>

        </section>


        <section style={styles.card}>

          <h2 style={styles.cardTitle}>
            Best placement
          </h2>

          <p style={styles.text}>
            Place NearbyPulse close to the Add to
            Cart or Buy button, where social proof
            can support the shopper's purchase
            decision.
          </p>

        </section>

      </div>

    </div>
  );
}


/*
|--------------------------------------------------------------------------
| Components
|--------------------------------------------------------------------------
*/

function FunnelStep({
  label,
  value,
  highlight = false,
}) {

  return (
    <div
      style={{
        ...styles.funnelStep,

        ...(highlight
          ? styles.funnelStepHighlight
          : {}),
      }}
    >

      <strong
        style={
          styles.funnelValue
        }
      >
        {formatNumber(value)}
      </strong>

      <span
        style={
          styles.funnelLabel
        }
      >
        {label}
      </span>

    </div>
  );
}


function FunnelArrow() {
  return (
    <div style={styles.arrow}>
      →
    </div>
  );
}


function MetricRow({
  label,
  value,
}) {

  return (
    <div style={styles.metricRow}>

      <span>
        {label}
      </span>

      <strong>
        {formatNumber(value)}
      </strong>

    </div>
  );
}


function ChecklistItem({
  done = false,
  text,
}) {

  return (
    <div style={styles.checklistItem}>

      <span
        style={
          done
            ? styles.checkDone
            : styles.checkTodo
        }
      >
        {done ? "✓" : "○"}
      </span>

      <span>
        {text}
      </span>

    </div>
  );
}


FunnelStep.propTypes = {
  label:
    PropTypes.string.isRequired,

  value:
    PropTypes.number,

  highlight:
    PropTypes.bool,
};


MetricRow.propTypes = {
  label:
    PropTypes.string.isRequired,

  value:
    PropTypes.number,
};


ChecklistItem.propTypes = {
  done:
    PropTypes.bool,

  text:
    PropTypes.string.isRequired,
};


/*
|--------------------------------------------------------------------------
| Styles
|--------------------------------------------------------------------------
*/

const styles = {

  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding:
      "clamp(18px, 4vw, 32px)",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: "#f6f6f7",
    minHeight: "100vh",
  },


  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems:
      "flex-start",
    gap: 24,
    marginBottom: 24,
  },


  headerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },


  eyebrow: {
    margin:
      "0 0 7px",
    color: "#008060",
    fontSize: 12,
    fontWeight: 700,
    textTransform:
      "uppercase",
    letterSpacing:
      "0.07em",
  },


  title: {
    margin: 0,
    fontSize:
      "clamp(26px, 4vw, 34px)",
    lineHeight: 1.15,
    color: "#202223",
  },


  subtitle: {
    margin:
      "10px 0 0",
    maxWidth: 720,
    color: "#6d7175",
    fontSize: 15,
    lineHeight: 1.6,
  },


  funnelCard: {
    background: "#ffffff",
    border:
      "1px solid #dfe3e8",
    borderRadius: 14,
    padding:
      "clamp(18px, 3vw, 26px)",
    boxShadow:
      "0 1px 2px rgba(0,0,0,.04)",
    marginBottom: 22,
  },


  card: {
    background: "#ffffff",
    border:
      "1px solid #dfe3e8",
    borderRadius: 12,
    padding:
      "clamp(18px, 3vw, 22px)",
    boxShadow:
      "0 1px 2px rgba(0,0,0,.04)",
    minWidth: 0,
  },


  cardHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: 20,
    marginBottom: 22,
  },


  cardTitle: {
    margin:
      "0 0 8px",
    color: "#202223",
    fontSize: 20,
  },


  helpText: {
    margin: 0,
    color: "#6d7175",
    fontSize: 13,
    lineHeight: 1.5,
  },


  funnel: {
    display: "flex",
    alignItems: "stretch",
    justifyContent:
      "space-between",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
  },


  funnelStep: {
    minWidth: 145,
    flex: 1,
    padding: "18px 14px",
    background: "#fafbfb",
    border:
      "1px solid #e5e7e9",
    borderRadius: 10,
    textAlign: "center",
  },


  funnelStepHighlight: {
    background: "#f1f8f5",
    border:
      "1px solid #aee0c7",
  },


  funnelValue: {
    display: "block",
    color: "#202223",
    fontSize: 26,
    lineHeight: 1.1,
  },


  funnelLabel: {
    display: "block",
    marginTop: 7,
    color: "#6d7175",
    fontSize: 12,
    fontWeight: 600,
  },


  arrow: {
    alignSelf: "center",
    color: "#8c9196",
    fontSize: 22,
    flexShrink: 0,
  },


  disclaimer: {
    margin:
      "18px 0 0",
    color: "#8c9196",
    fontSize: 11,
    lineHeight: 1.5,
  },


  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 20,
    marginBottom: 22,
  },


  opportunityHeadline: {
    margin:
      "16px 0 8px",
    color: "#202223",
    fontSize: 16,
  },


  text: {
    margin:
      "0 0 14px",
    color: "#5c5f62",
    fontSize: 14,
    lineHeight: 1.6,
  },


  recommendation: {
    marginTop: 18,
    padding: 14,
    background: "#f1f8f5",
    border:
      "1px solid #b7e4cf",
    borderRadius: 10,
    color: "#202223",
  },


  recommendationText: {
    margin:
      "6px 0 0",
    color: "#5c5f62",
    lineHeight: 1.5,
    fontSize: 13,
  },


  metricRow: {
    display: "flex",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: 20,
    padding: "13px 0",
    borderBottom:
      "1px solid #eeeeee",
    color: "#202223",
  },


  messageInsight: {
    marginTop: 16,
  },


  textLink: {
    display:
      "inline-block",
    marginTop: 8,
    color: "#008060",
    fontWeight: 700,
    fontSize: 13,
    textDecoration: "none",
  },


  statusCard: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: 20,
    background: "#ffffff",
    border:
      "1px solid #dfe3e8",
    borderRadius: 12,
    padding: "18px 22px",
  },


  statusLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#202223",
  },


  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    background: "#008060",
  },


  statusText: {
    margin:
      "6px 0 0",
    color: "#6d7175",
    fontSize: 13,
  },


  quickLinks: {
    display: "flex",
    gap: 16,
  },


  setupHero: {
    marginBottom: 24,
    padding:
      "clamp(22px, 4vw, 30px)",
    background:
      "linear-gradient(135deg, #e3f1df, #ffffff)",
    border:
      "1px solid #bbe5b3",
    borderRadius: 14,
  },


  checklistItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 0",
    borderBottom:
      "1px solid #eeeeee",
    color: "#202223",
  },


  checkDone: {
    color: "#008060",
    fontWeight: 700,
  },


  checkTodo: {
    color: "#b7791f",
    fontWeight: 700,
  },


  actions: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
  },


  primaryButton: {
    display:
      "inline-block",
    background: "#008060",
    color: "#ffffff",
    textDecoration: "none",
    borderRadius: 8,
    padding: "10px 15px",
    fontWeight: 700,
    fontSize: 13,
  },


  secondaryButton: {
    display:
      "inline-block",
    background: "#ffffff",
    color: "#202223",
    textDecoration: "none",
    border:
      "1px solid #c9cccf",
    borderRadius: 8,
    padding: "10px 15px",
    fontWeight: 700,
    fontSize: 13,
  },

};
