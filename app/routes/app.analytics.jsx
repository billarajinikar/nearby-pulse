import {
  Link,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";

import PropTypes from "prop-types";

import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";

const PAGE_SIZE = 20;
const STATS_LIMIT = 500;

function countBy(items, key) {
  const counts = {};

  for (const item of items || []) {
    const value = item?.[key];

    if (!value) {
      continue;
    }

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function parsePage(value) {
  const parsedPage = Number.parseInt(value || "1", 10);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    return 1;
  }

  return parsedPage;
}

function getTodayUtc() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );
}

function getSevenDaysAgoUtc() {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() - 7);

  return date;
}

function formatEventDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMessageType(messageType) {
  switch (messageType) {
    case "announcement":
      return "Store Message";

    case "activity":
      return "Activity Message";

    default:
      return "Message";
  }
}

function throwAnalyticsError(error) {
  console.error(
    "[NearbyPulse Analytics] Analytics query failed:",
    error,
  );

  throw new Response(
    "Unable to load NearbyPulse analytics right now.",
    {
      status: 500,
      statusText: "Analytics unavailable",
    },
  );
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const requestedPage = parsePage(
    url.searchParams.get("page"),
  );

  const todayUtc = getTodayUtc();
  const sevenDaysAgoUtc = getSevenDaysAgoUtc();

  const initialFrom =
    (requestedPage - 1) * PAGE_SIZE;

  const initialTo =
    initialFrom + PAGE_SIZE - 1;

  const [
    totalResult,
    todayResult,
    sevenDayResult,
    statsResult,
    recentResult,
  ] = await Promise.all([
    supabase
      .from("analytics_events")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("shop", shop)
      .eq("event_type", "widget_shown"),

    supabase
      .from("analytics_events")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("shop", shop)
      .eq("event_type", "widget_shown")
      .gte(
        "created_at",
        todayUtc.toISOString(),
      ),

    supabase
      .from("analytics_events")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("shop", shop)
      .eq("event_type", "widget_shown")
      .gte(
        "created_at",
        sevenDaysAgoUtc.toISOString(),
      ),

    supabase
      .from("analytics_events")
      .select(
        `
          id,
          product_id,
          product_title,
          visitor_city,
          visitor_country,
          displayed_city,
          message_text,
          message_type,
          source_activity_type,
          created_at
        `,
      )
      .eq("shop", shop)
      .eq("event_type", "widget_shown")
      .order("created_at", {
        ascending: false,
      })
      .limit(STATS_LIMIT),

    supabase
      .from("analytics_events")
      .select(
        `
          id,
          product_id,
          product_title,
          displayed_city,
          message_text,
          message_type,
          source_activity_type,
          created_at
        `,
        {
          count: "exact",
        },
      )
      .eq("shop", shop)
      .eq("event_type", "widget_shown")
      .order("created_at", {
        ascending: false,
      })
      .range(initialFrom, initialTo),
  ]);

  const firstError = [
    totalResult.error,
    todayResult.error,
    sevenDayResult.error,
    statsResult.error,
    recentResult.error,
  ].find(Boolean);

  if (firstError) {
    throwAnalyticsError(firstError);
  }

  const totalShown = totalResult.count || 0;
  const todayShown = todayResult.count || 0;
  const last7DaysShown =
    sevenDayResult.count || 0;

  const eventsForStats =
    statsResult.data || [];

  let recentEvents =
    recentResult.data || [];

  const recentEventsCount =
    recentResult.count || 0;

  const totalPages = Math.max(
    Math.ceil(
      recentEventsCount / PAGE_SIZE,
    ),
    1,
  );

  const page = Math.min(
    requestedPage,
    totalPages,
  );

  /*
   * When a merchant opens an invalid page such as
   * ?page=999, load the final valid page instead.
   */
  if (
    page !== requestedPage &&
    recentEventsCount > 0
  ) {
    const correctedFrom =
      (page - 1) * PAGE_SIZE;

    const correctedTo =
      correctedFrom + PAGE_SIZE - 1;

    const correctedResult = await supabase
      .from("analytics_events")
      .select(
        `
          id,
          product_id,
          product_title,
          displayed_city,
          message_text,
          message_type,
          source_activity_type,
          created_at
        `,
      )
      .eq("shop", shop)
      .eq("event_type", "widget_shown")
      .order("created_at", {
        ascending: false,
      })
      .range(
        correctedFrom,
        correctedTo,
      );

    if (correctedResult.error) {
      throwAnalyticsError(
        correctedResult.error,
      );
    }

    recentEvents =
      correctedResult.data || [];
  }

  const productIds = new Set(
    eventsForStats
      .map((event) => event.product_id)
      .filter(Boolean),
  );

  const activityMessagesShown =
    eventsForStats.filter(
      (event) =>
        event.message_type === "activity",
    ).length;

  const storeMessagesShown =
    eventsForStats.filter(
      (event) =>
        event.message_type ===
        "announcement",
    ).length;

  return {
    totalShown,
    todayShown,
    last7DaysShown,

    recentProductsCovered:
      productIds.size,

    activityMessagesShown,
    storeMessagesShown,

    topVisitorCities: countBy(
      eventsForStats,
      "visitor_city",
    ),

    topDisplayedCities: countBy(
      eventsForStats,
      "displayed_city",
    ),

    topProducts: countBy(
      eventsForStats,
      "product_title",
    ),

    recentEvents,
    recentEventsCount,

    page,
    pageSize: PAGE_SIZE,
    totalPages,

    statsLimit: STATS_LIMIT,
  };
};

export default function AnalyticsPage() {
  const {
    totalShown,
    todayShown,
    last7DaysShown,

    recentProductsCovered,
    activityMessagesShown,
    storeMessagesShown,

    topVisitorCities,
    topDisplayedCities,
    topProducts,

    recentEvents,
    recentEventsCount,

    page,
    totalPages,
    statsLimit,
  } = useLoaderData();

  const topVisitorCity =
    topVisitorCities[0];

  const topDisplayedCity =
    topDisplayedCities[0];

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>
            NearbyPulse Analytics
          </h1>

          <p style={styles.subtitle}>
            See how often NearbyPulse messages
            appear, which products receive the
            most displays, and which locations
            are most common in recent activity.
          </p>
        </div>
      </header>

      <section style={styles.kpiGrid}>
        <Kpi
          label="Shown today (UTC)"
          value={todayShown}
          helpText="Widget displays since midnight UTC."
        />

        <Kpi
          label="Last 7 days"
          value={last7DaysShown}
          helpText="Widget displays during the previous seven days."
        />

        <Kpi
          label="Total shown"
          value={totalShown}
          helpText="All recorded widget displays."
        />

        <Kpi
          label="Recent products covered"
          value={recentProductsCovered}
          helpText={`Unique products in the latest ${statsLimit} displays.`}
        />
      </section>

      <section style={styles.kpiGridSmall}>
        <Kpi
          label="Recent Activity Messages"
          value={activityMessagesShown}
          helpText={`Verified activity messages within the latest ${statsLimit} displays.`}
        />

        <Kpi
          label="Recent Store Messages"
          value={storeMessagesShown}
          helpText={`Merchant-created store messages within the latest ${statsLimit} displays.`}
        />
      </section>

      <div style={styles.grid}>
        <ListCard
          title="Top Visitor Cities"
          subtitle={`Aggregated from the latest ${statsLimit} widget displays.`}
          items={topVisitorCities}
          empty="No visitor-city data yet."
        />

        <ListCard
          title="Top Displayed Cities"
          subtitle={`Cities displayed inside the latest ${statsLimit} NearbyPulse messages.`}
          items={topDisplayedCities}
          empty="No displayed-city data yet."
        />
      </div>

      <div style={styles.grid}>
        <ListCard
          title="Top Products"
          subtitle={`Products with the most messages among the latest ${statsLimit} displays.`}
          items={topProducts}
          empty="No product data yet."
        />

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>
            Actionable Insight
          </h2>

          {topVisitorCity &&
          topDisplayedCity ? (
            <>
              <p style={styles.insight}>
                Most recent visitors are coming
                from{" "}
                <strong>
                  {topVisitorCity.name}
                </strong>
                . NearbyPulse most often displayed{" "}
                <strong>
                  {topDisplayedCity.name}
                </strong>
                .
              </p>

              <div
                style={
                  styles.recommendationBox
                }
              >
                <strong>
                  Recommended action
                </strong>

                <p style={styles.helpText}>
                  If{" "}
                  {topVisitorCity.name} is an
                  important market, consider
                  adding a verified Activity
                  Message template such as:
                </p>

                <p
                  style={
                    styles.exampleMessage
                  }
                >
                  “Popular with shoppers near{" "}
                  {"{city}"}”
                </p>
              </div>
            </>
          ) : (
            <p style={styles.insight}>
              Once NearbyPulse starts displaying
              messages, this section will
              highlight useful location and
              product trends.
            </p>
          )}
        </section>
      </div>

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.cardTitle}>
              Recent Activity
            </h2>

            <p style={styles.helpText}>
              Individual visitor locations are
              not shown here. City information is
              available only in aggregated
              statistics above.
            </p>
          </div>
        </div>

        {recentEvents.length === 0 ? (
          <EmptyState
            title="No NearbyPulse activity yet"
            text="Analytics will appear here after the widget is displayed on a product page."
            actionText="Open Settings"
            actionHref="/app/settings"
          />
        ) : (
          <>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>
                      Time
                    </th>

                    <th style={styles.th}>
                      Product
                    </th>

                    <th style={styles.th}>
                      Message Type
                    </th>

                    <th style={styles.th}>
                      Activity Source
                    </th>

                    <th style={styles.th}>
                      Displayed City
                    </th>

                    <th style={styles.th}>
                      Message
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {recentEvents.map(
                    (event) => (
                      <tr key={event.id}>
                        <td style={styles.td}>
                          {formatEventDate(
                            event.created_at,
                          )}
                        </td>

                        <td style={styles.td}>
                          {event.product_title ||
                            "Unknown product"}
                        </td>

                        <td style={styles.td}>
                          <MessageBadge
                            messageType={
                              event.message_type
                            }
                          />
                        </td>

                        <td style={styles.td}>
                          {formatActivitySource(
                            event.source_activity_type,
                            event.message_type,
                          )}
                        </td>

                        <td style={styles.td}>
                          {event.displayed_city ||
                            "—"}
                        </td>

                        <td
                          style={
                            styles.messageCell
                          }
                        >
                          {event.message_text ||
                            "—"}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            <div style={styles.pagination}>
              <span
                style={
                  styles.paginationText
                }
              >
                Page {page} of {totalPages} ·{" "}
                {recentEventsCount} events
              </span>

              <div
                style={
                  styles.paginationActions
                }
              >
                {page > 1 && (
                  <Link
                    to={`/app/analytics?page=${page - 1}`}
                    style={styles.pageButton}
                  >
                    Previous
                  </Link>
                )}

                {page < totalPages && (
                  <Link
                    to={`/app/analytics?page=${page + 1}`}
                    style={styles.pageButton}
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function formatActivitySource(
  activityType,
  messageType,
) {
  if (messageType === "announcement") {
    return "Store Message";
  }

  switch (activityType) {
    case "order_completed":
      return "Purchase";

    case "checkout_started":
      return "Checkout";

    case "add_to_cart":
      return "Add to Cart";

    case "product_viewed":
      return "Product View";

    default:
      return "Verified Activity";
  }
}

function MessageBadge({ messageType }) {
  const isAnnouncement =
    messageType === "announcement";

  return (
    <span
      style={{
        ...styles.badge,
        ...(isAnnouncement
          ? styles.storeBadge
          : styles.activityBadge),
      }}
    >
      {formatMessageType(messageType)}
    </span>
  );
}

function EmptyState({
  title,
  text,
  actionText,
  actionHref,
}) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>📍</div>

      <h3 style={styles.emptyTitle}>
        {title}
      </h3>

      <p style={styles.emptyText}>
        {text}
      </p>

      {actionHref && actionText && (
        <Link
          to={actionHref}
          style={styles.emptyButton}
        >
          {actionText}
        </Link>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  helpText,
}) {
  return (
    <div style={styles.card}>
      <p style={styles.kpiLabel}>
        {label}
      </p>

      <h2 style={styles.kpiValue}>
        {Number(value || 0).toLocaleString(
          "en-GB",
        )}
      </h2>

      {helpText && (
        <p style={styles.kpiHelp}>
          {helpText}
        </p>
      )}
    </div>
  );
}

function ListCard({
  title,
  subtitle,
  items,
  empty,
}) {
  return (
    <section style={styles.card}>
      <h2 style={styles.cardTitle}>
        {title}
      </h2>

      <p style={styles.helpText}>
        {subtitle}
      </p>

      {items.length === 0 ? (
        <EmptyState
          title={empty}
          text="This section will update automatically after NearbyPulse messages start appearing."
        />
      ) : (
        <div>
          {items.map((item) => (
            <div
              key={item.name}
              style={styles.row}
            >
              <span
                style={styles.rowLabel}
                title={item.name}
              >
                {item.name}
              </span>

              <strong>
                {item.count.toLocaleString(
                  "en-GB",
                )}
              </strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title =
    "Unable to load analytics";

  let message =
    "NearbyPulse could not load analytics right now. Please refresh the page and try again.";

  if (isRouteErrorResponse(error)) {
    title =
      error.status === 401
        ? "Authentication required"
        : "Unable to load analytics";

    message =
      typeof error.data === "string"
        ? error.data
        : error.statusText || message;
  } else if (error instanceof Error) {
    console.error(
      "[NearbyPulse Analytics] Route error:",
      error,
    );
  }

  return (
    <div style={styles.page}>
      <section style={styles.card}>
        <EmptyState
          title={title}
          text={message}
          actionText="Open Settings"
          actionHref="/app/settings"
        />
      </section>
    </div>
  );
}

MessageBadge.propTypes = {
  messageType: PropTypes.string,
};

Kpi.propTypes = {
  label: PropTypes.string.isRequired,

  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),

  helpText: PropTypes.string,
};

ListCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,

  items: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      count: PropTypes.number.isRequired,
    }),
  ).isRequired,

  empty: PropTypes.string.isRequired,
};

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  actionText: PropTypes.string,
  actionHref: PropTypes.string,
};

const styles = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "clamp(16px, 4vw, 32px)",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: "#f6f6f7",
    minHeight: "100vh",
  },

  header: {
    marginBottom: 24,
  },

  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: "#202223",
  },

  subtitle: {
    marginTop: 6,
    marginBottom: 0,
    color: "#6d7175",
    fontSize: 15,
    maxWidth: 760,
    lineHeight: 1.5,
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },

  kpiGridSmall: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },

  grid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 20,
    marginBottom: 24,
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: 12,
    padding: "clamp(16px, 3vw, 22px)",
    boxShadow:
      "0 1px 2px rgba(0, 0, 0, 0.04)",
    minWidth: 0,
  },

  kpiLabel: {
    color: "#6d7175",
    fontSize: 13,
    margin: 0,
  },

  kpiValue: {
    fontSize: 30,
    margin: "8px 0 0",
    color: "#202223",
    lineHeight: 1.2,
  },

  kpiHelp: {
    color: "#6d7175",
    fontSize: 12,
    lineHeight: 1.45,
    margin: "8px 0 0",
  },

  cardTitle: {
    margin: "0 0 8px",
    fontSize: 18,
    color: "#202223",
  },

  helpText: {
    marginTop: 0,
    marginBottom: 16,
    color: "#6d7175",
    fontSize: 13,
    lineHeight: 1.5,
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "10px 0",
    borderBottom: "1px solid #eeeeee",
  },

  rowLabel: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  insight: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "#202223",
  },

  recommendationBox: {
    marginTop: 16,
    padding: 14,
    background: "#f1f8f5",
    border: "1px solid #b7e4cf",
    borderRadius: 10,
  },

  exampleMessage: {
    marginTop: 10,
    marginBottom: 0,
    padding: 12,
    background: "#ffffff",
    border: "1px solid #dfe3e8",
    borderRadius: 8,
    fontSize: 14,
    color: "#202223",
  },

  tableWrapper: {
    width: "100%",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
  },

  table: {
    width: "100%",
    minWidth: 900,
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    padding: "10px",
    borderBottom:
      "1px solid #dfe3e8",
    fontSize: 13,
    color: "#5c5f62",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "10px",
    borderBottom:
      "1px solid #eeeeee",
    fontSize: 13,
    verticalAlign: "top",
    color: "#202223",
  },

  messageCell: {
    padding: "10px",
    borderBottom:
      "1px solid #eeeeee",
    fontSize: 13,
    verticalAlign: "top",
    color: "#202223",
    minWidth: 240,
    lineHeight: 1.45,
  },

  badge: {
    display: "inline-block",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  activityBadge: {
    background: "#dcfce7",
    color: "#166534",
  },

  storeBadge: {
    background: "#dbeafe",
    color: "#1e40af",
  },

  pagination: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 16,
    gap: 12,
  },

  paginationText: {
    color: "#6d7175",
    fontSize: 13,
  },

  paginationActions: {
    display: "flex",
    gap: 10,
  },

  pageButton: {
    background: "#f6f6f7",
    color: "#202223",
    textDecoration: "none",
    border: "1px solid #c9cccf",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
  },

  emptyState: {
    textAlign: "center",
    padding: "32px 18px",
    background: "#fafafa",
    border: "1px dashed #c9cccf",
    borderRadius: 12,
  },

  emptyIcon: {
    fontSize: 28,
    marginBottom: 10,
  },

  emptyTitle: {
    margin: "0 0 8px",
    fontSize: 16,
    color: "#202223",
  },

  emptyText: {
    margin: "0 auto",
    maxWidth: 420,
    color: "#6d7175",
    fontSize: 14,
    lineHeight: 1.5,
  },

  emptyButton: {
    display: "inline-block",
    marginTop: 16,
    background: "#008060",
    color: "#ffffff",
    textDecoration: "none",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
  },
};
