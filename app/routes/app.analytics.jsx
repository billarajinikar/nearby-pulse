import { Link, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";
import PropTypes from "prop-types";
function countBy(items, key) {
  const counts = {};

  for (const item of items || []) {
    const value = item[key];
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
const pageSize = 20;
const from = (page - 1) * pageSize;
const to = from + pageSize - 1;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const baseQuery = supabase
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .eq("shop", shop)
    .eq("event_type", "widget_shown");

  const { count: totalShown } = await baseQuery;

  const { count: todayShown } = await supabase
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .eq("shop", shop)
    .eq("event_type", "widget_shown")
    .gte("created_at", today.toISOString());

  const { count: last7DaysShown } = await supabase
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .eq("shop", shop)
    .eq("event_type", "widget_shown")
    .gte("created_at", sevenDaysAgo.toISOString());

  const { data: eventsForStats } = await supabase
  .from("analytics_events")
  .select(
    "product_id, product_title, visitor_city, visitor_country, displayed_city, message_text, created_at"
  )
  .eq("shop", shop)
  .eq("event_type", "widget_shown")
  .order("created_at", { ascending: false })
  .limit(500);

const { data: recentEvents, count: recentEventsCount } = await supabase
  .from("analytics_events")
  .select(
    "product_id, product_title, visitor_city, visitor_country, displayed_city, message_text, created_at",
    { count: "exact" }
  )
  .eq("shop", shop)
  .eq("event_type", "widget_shown")
  .order("created_at", { ascending: false })
  .range(from, to);

  const productIds = new Set(
  (eventsForStats || []).map((e) => e.product_id).filter(Boolean)
);

  return {
    totalShown: totalShown || 0,
    todayShown: todayShown || 0,
    last7DaysShown: last7DaysShown || 0,
    productsCovered: productIds.size,
    topVisitorCities: countBy(eventsForStats, "visitor_city"),
topDisplayedCities: countBy(eventsForStats, "displayed_city"),
topProducts: countBy(eventsForStats, "product_title"),
recentEvents: recentEvents || [],
recentEventsCount: recentEventsCount || 0,
page,
pageSize,
totalPages: Math.max(Math.ceil((recentEventsCount || 0) / pageSize), 1),
  };
};

export default function AnalyticsPage() {
  const {
    totalShown,
    todayShown,
    last7DaysShown,
    productsCovered,
    topVisitorCities,
    topDisplayedCities,
    topProducts,
    recentEvents,
recentEventsCount,
page,
totalPages,
  } = useLoaderData();

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>NearbyPulse Analytics</h1>
          <p style={styles.subtitle}>
            Understand where visitors come from, which local cities are shown,
            and which products receive the most social proof.
          </p>
        </div>
      </div>

      <div style={styles.kpiGrid}>
        <Kpi label="Shown today" value={todayShown} />
        <Kpi label="Last 7 days" value={last7DaysShown} />
        <Kpi label="Total shown" value={totalShown} />
        <Kpi label="Products covered" value={productsCovered} />
      </div>

      <div style={styles.grid}>
        <ListCard
          title="Top Visitor Cities"
          subtitle="Where visitors are coming from"
          items={topVisitorCities}
          empty="No visitor city data yet."
        />

        <ListCard
          title="Top Displayed Cities"
          subtitle="Cities shown inside NearbyPulse messages"
          items={topDisplayedCities}
          empty="No displayed city data yet."
        />
      </div>

      <div style={styles.grid}>
        <ListCard
          title="Top Products"
          subtitle="Products where messages appeared most"
          items={topProducts}
          empty="No product data yet."
        />

        <section style={styles.card}>
  <h2 style={styles.cardTitle}>Actionable Insight</h2>

  {topVisitorCities[0] && topDisplayedCities[0] ? (
    <>
      <p style={styles.insight}>
        Most visitors are coming from <strong>{topVisitorCities[0].name}</strong>.
        NearbyPulse most often showed <strong>{topDisplayedCities[0].name}</strong>.
      </p>

      <div style={styles.recommendationBox}>
        <strong>Recommended action</strong>
        <p style={styles.helpText}>
          If {topVisitorCities[0].name} is an important market for this store,
          consider using message templates that mention local popularity, such as:
        </p>

        <p style={styles.exampleMessage}>
          “Popular with shoppers near {"{city}"}”
        </p>
      </div>
    </>
  ) : (
    <p style={styles.insight}>
      Once messages start appearing, NearbyPulse will show which cities and
      products are getting the most activity.
    </p>
  )}
</section>
      </div>

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>Recent Activity</h2>

        {recentEvents.length === 0 ? (
  <EmptyState
  title="No NearbyPulse activity yet"
  text="Analytics will appear here after your widget is shown on a product page."
  actionText="Open Settings"
  actionHref="/app/settings"
/>
) : (
  <>
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Time</th>
          <th style={styles.th}>Product</th>
          <th style={styles.th}>Visitor City</th>
          <th style={styles.th}>Displayed City</th>
          <th style={styles.th}>Message</th>
        </tr>
      </thead>
      <tbody>
        {recentEvents.map((event, index) => (
          <tr key={index}>
            <td style={styles.td}>
              {new Date(event.created_at).toLocaleString()}
            </td>
            <td style={styles.td}>{event.product_title || "-"}</td>
            <td style={styles.td}>{event.visitor_city || "-"}</td>
            <td style={styles.td}>{event.displayed_city || "-"}</td>
            <td style={styles.td}>{event.message_text || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <div style={styles.pagination}>
      <span style={styles.paginationText}>
        Page {page} of {totalPages} · {recentEventsCount} events
      </span>

      <div style={styles.paginationActions}>
        {page > 1 && (
          <Link to={`/app/analytics?page=${page - 1}`} style={styles.pageButton}>
            Previous
          </Link>
        )}

        {page < totalPages && (
          <Link to={`/app/analytics?page=${page + 1}`} style={styles.pageButton}>
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

function EmptyState({ title, text, actionText, actionHref }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>📍</div>
      <h3 style={styles.emptyTitle}>{title}</h3>
      <p style={styles.emptyText}>{text}</p>

      {actionHref && (
        <Link to={actionHref} style={styles.emptyButton}>
          {actionText}
        </Link>
      )}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div style={styles.card}>
      <p style={styles.kpiLabel}>{label}</p>
      <h2 style={styles.kpiValue}>{value || 0}</h2>
    </div>
  );
}

function ListCard({ title, subtitle, items, empty }) {
  return (
    <section style={styles.card}>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={styles.helpText}>{subtitle}</p>

      {items.length === 0 ? (
        <EmptyState
  title={empty}
  text="Once NearbyPulse starts showing messages, this section will update automatically."
/>
      ) : (
        items.map((item) => (
          <div key={item.name} style={styles.row}>
            <span>{item.name}</span>
            <strong>{item.count}</strong>
          </div>
        ))
      )}
    </section>
  );
}

Kpi.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
};

ListCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      count: PropTypes.number.isRequired,
    })
  ).isRequired,
  empty: PropTypes.string,
};

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  actionText: PropTypes.string,
  actionHref: PropTypes.string,
};




const styles = {
  pagination: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
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
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "32px",
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
    color: "#6d7175",
    fontSize: 15,
    maxWidth: 720,
    lineHeight: 1.5,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
    marginBottom: 24,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginBottom: 24,
  },
  card: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 12,
    padding: 22,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  kpiLabel: {
    color: "#6d7175",
    fontSize: 13,
    margin: 0,
  },
  kpiValue: {
    fontSize: 30,
    margin: "8px 0 0 0",
    color: "#202223",
  },
  cardTitle: {
    margin: "0 0 8px 0",
    fontSize: 18,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #eee",
  },
  empty: {
    color: "#6d7175",
  },
  helpText: {
    marginTop: 0,
    marginBottom: 16,
    color: "#6d7175",
    fontSize: 13,
    lineHeight: 1.5,
  },
  insight: {
    fontSize: 16,
    lineHeight: 1.6,
    color: "#202223",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "1px solid #ddd",
    fontSize: 13,
  },
  td: {
    padding: "10px",
    borderBottom: "1px solid #eee",
    fontSize: 13,
    verticalAlign: "top",
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
  padding: 12,
  background: "#ffffff",
  border: "1px solid #dfe3e8",
  borderRadius: 8,
  fontSize: 14,
  color: "#202223",
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
  maxWidth: 360,
  color: "#6d7175",
  fontSize: 14,
  lineHeight: 1.5,
},

emptyButton: {
  display: "inline-block",
  marginTop: 16,
  background: "#008060",
  color: "#fff",
  textDecoration: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
},
};
