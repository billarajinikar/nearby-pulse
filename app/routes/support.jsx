import React from "react";

export default function SupportPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Support</h1>

        <p style={styles.subtitle}>
          Need help with NearbyPulse? We're here to help you get the most out of
          the app.
        </p>

        <hr style={styles.hr} />

        <h2 style={styles.heading}>Contact</h2>

        <p style={styles.text}>
          Email: <strong>support@nearbypulse.app</strong>
        </p>

        <p style={styles.text}>
          We typically respond within one business day.
        </p>

        <hr style={styles.hr} />

        <h2 style={styles.heading}>Quick Start</h2>

        <ol style={styles.list}>
          <li>Install NearbyPulse.</li>
          <li>Open the Settings page.</li>
          <li>Enable the widget.</li>
          <li>Add the NearbyPulse block to your product page.</li>
          <li>Save your Shopify theme.</li>
          <li>Visit a product page.</li>
          <li>Check Analytics after the first visitor.</li>
        </ol>

        <hr style={styles.hr} />

        <h2 style={styles.heading}>Frequently Asked Questions</h2>

        <h3 style={styles.question}>Why isn't the widget showing?</h3>

        <ul style={styles.list}>
          <li>Verify NearbyPulse is enabled.</li>
          <li>Confirm the Theme Block has been added.</li>
          <li>Save your Shopify theme.</li>
          <li>Check cooldown settings.</li>
          <li>Verify analytics are being recorded.</li>
        </ul>

        <h3 style={styles.question}>Can I customize the messages?</h3>

        <p style={styles.text}>
          Yes. NearbyPulse supports multiple message templates using placeholders
          like <strong>{"{city}"}</strong> and{" "}
          <strong>{"{minutes}"}</strong>.
        </p>

        <h3 style={styles.question}>How is visitor location determined?</h3>

        <p style={styles.text}>
          NearbyPulse uses IP-based geolocation to estimate a visitor's city.
          Exact addresses and GPS coordinates are never stored.
        </p>

        <hr style={styles.hr} />

        <h2 style={styles.heading}>Still need help?</h2>

        <p style={styles.text}>
          Contact us anytime at{" "}
          <strong>support@nearbypulse.app</strong>.
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: 32,
    background: "#f6f6f7",
    minHeight: "100vh",
    fontFamily:
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  },
  card: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 12,
    padding: 30,
  },
  title: { margin: 0, fontSize: 30 },
  subtitle: { color: "#6d7175", lineHeight: 1.6 },
  heading: { marginTop: 30 },
  question: { marginTop: 22, fontSize: 17 },
  text: { lineHeight: 1.7 },
  list: { lineHeight: 2 },
  hr: { margin: "30px 0", border: 0, borderTop: "1px solid #eee" },
};
