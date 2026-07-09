import { Link, useLoaderData } from "react-router";
import PropTypes from "prop-types";
import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const { count: analyticsCount } = await supabase
    .from("analytics_events")
    .select("*", { count: "exact", head: true })
    .eq("shop", shop)
    .eq("event_type", "widget_shown");

  return {
    analyticsCount: analyticsCount || 0,
  };
};

export default function Index() {
  const { analyticsCount } = useLoaderData();

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <h1 style={styles.title}>Welcome to NearbyPulse 👋</h1>
        <p style={styles.subtitle}>
          NearbyPulse is ready. Add the theme block to your product page to start showing location-aware social proof.
        </p>
      </section>

      <div style={styles.kpiGrid}>
        <StatusCard title="App installed" status="Connected" tone="success" />
        <StatusCard title="Settings" status="Configured" tone="success" />
        <StatusCard
  title="Theme block"
  status={
    analyticsCount > 0
      ? "Installed and active"
      : "Waiting for first display"
  }
  tone={analyticsCount > 0 ? "success" : "warning"}
/>
        <StatusCard
          title="Analytics"
          status={analyticsCount > 0 ? `${analyticsCount} events recorded` : "Waiting for first event"}
          tone={analyticsCount > 0 ? "success" : "warning"}
        />
      </div>

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>Setup checklist</h2>
        <ChecklistItem done text="App installed" />
        <ChecklistItem done text="Shopify connected" />
        <ChecklistItem
  done={analyticsCount > 0}
  text="Add NearbyPulse block to your product page"
/>

<ChecklistItem
  done={analyticsCount > 0}
  text="Visit a product page and confirm the message appears"
/>
        <ChecklistItem done={analyticsCount > 0} text="First analytics event recorded" />
      </section>

      <div style={styles.grid}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Quick actions</h2>
          <div style={styles.actions}>
            <Link to="/app/settings" style={styles.primaryButton}>Open Settings</Link>
            <Link to="/app/analytics" style={styles.secondaryButton}>View Analytics</Link>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Best placement</h2>
          <p style={styles.text}>
            Place NearbyPulse close to the Add to Cart or Buy button.
          </p>
        </section>
        <div style={styles.footer}>
  <Link to="/app/support">Support</Link>

  <span>•</span>

  <Link to="/app/privacy">Privacy Policy</Link>

  <span>•</span>

  <Link to="/app/terms">Terms of Service</Link>
</div>
      </div>
    </div>
  );
}

function StatusCard({ title, status, tone }) {
  const color = tone === "success" ? "#008060" : "#b7791f";
  const bg = tone === "success" ? "#e3f1df" : "#fff4d6";

  return (
    <div style={styles.card}>
      <p style={styles.kpiLabel}>{title}</p>
      <div style={{ ...styles.statusPill, color, background: bg }}>{status}</div>
    </div>
  );
}

function ChecklistItem({ done = false, text }) {
  return (
    <div style={styles.checklistItem}>
      <span style={done ? styles.checkDone : styles.checkTodo}>{done ? "✓" : "○"}</span>
      <span>{text}</span>
    </div>
  );
}

StatusCard.propTypes = {
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(["success", "warning"]).isRequired,
};

ChecklistItem.propTypes = {
  done: PropTypes.bool,
  text: PropTypes.string.isRequired,
};

const styles = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "32px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#f6f6f7", minHeight: "100vh" },
  hero: { background: "linear-gradient(135deg, #e3f1df, #ffffff)", border: "1px solid #bbe5b3", borderRadius: 14, padding: 28, marginBottom: 24 },
  title: { margin: 0, fontSize: 30, color: "#202223" },
  subtitle: { marginTop: 10, maxWidth: 720, color: "#5c5f62", fontSize: 16, lineHeight: 1.5 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 24 },
  card: { background: "#fff", border: "1px solid #e1e3e5", borderRadius: 12, padding: 22, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  cardTitle: { margin: "0 0 16px 0", fontSize: 18, color: "#202223" },
  kpiLabel: { color: "#6d7175", fontSize: 13, margin: "0 0 10px 0" },
  statusPill: { display: "inline-block", padding: "6px 10px", borderRadius: 999, fontSize: 13, fontWeight: 700 },
  checklistItem: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #eee", color: "#202223" },
  checkDone: { color: "#008060", fontWeight: 700 },
  checkTodo: { color: "#b7791f", fontWeight: 700 },
  actions: { display: "flex", gap: 12, flexWrap: "wrap" },
  primaryButton: { background: "#008060", color: "#fff", textDecoration: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700 },
  secondaryButton: { background: "#f6f6f7", color: "#202223", textDecoration: "none", border: "1px solid #c9cccf", borderRadius: 8, padding: "10px 16px", fontWeight: 700 },
  text: { color: "#5c5f62", lineHeight: 1.6, margin: 0 },
  footer: {
  marginTop: 40,
  display: "flex",
  justifyContent: "center",
  gap: 14,
  fontSize: 13,
  color: "#6d7175",
},
};
