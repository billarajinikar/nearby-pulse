import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <p className={styles.badge}>Shopify App</p>
        <h1 className={styles.heading}>Real social proof from real nearby customers.</h1>
        <p className={styles.text}>
          NearbyPulse shows shoppers genuine purchase activity from customers in their area —
          building trust and boosting conversions without fake urgency.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span className={styles.labelTitle}>Shop domain</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                autoComplete="on"
                required
              />
              <span className={styles.labelHint}>
                Use your <strong>.myshopify.com</strong> domain
              </span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Location-aware social proof</strong>. Show shoppers real purchase activity from nearby customers — powered by your actual Shopify orders.
          </li>
          <li>
            <strong>100% real data</strong>. Messages are backed by genuine orders, not fabricated urgency. Stay FTC-compliant and build lasting trust.
          </li>
          <li>
            <strong>Analytics & insights</strong>. Track widget impressions, top visitor cities, and most-influenced products from your dashboard.
          </li>
        </ul>
        <section className={styles.trustSection} aria-label="Trust and compliance highlights">
          <h2 className={styles.trustHeading}>Why merchants trust NearbyPulse</h2>
          <div className={styles.trustGrid}>
            <article className={styles.trustCard}>
              <h3>Transparent messaging</h3>
              <p>
                NearbyPulse prioritizes genuine activity signals and merchant-owned announcements.
              </p>
            </article>
            <article className={styles.trustCard}>
              <h3>Privacy-conscious design</h3>
              <p>
                We use coarse location context for relevance and avoid exposing personal customer identity.
              </p>
            </article>
            <article className={styles.trustCard}>
              <h3>Simple billing & support</h3>
              <p>
                Clear plan terms, responsive support, and quick setup help you launch with confidence.
              </p>
            </article>
          </div>
          <nav className={styles.trustLinks} aria-label="Policy and support links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/support">Support</a>
          </nav>
        </section>
        <p className={styles.footnote}>
          By logging in, you agree to the NearbyPulse terms and privacy policy.
        </p>
      </div>
    </div>
  );
}
