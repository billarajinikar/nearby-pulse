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
        <h1 className={styles.heading}>Real social proof from real nearby customers.</h1>
        <p className={styles.text}>
          NearbyPulse shows shoppers genuine purchase activity from customers in their area —
          building trust and boosting conversions without fake urgency.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
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
      </div>
    </div>
  );
}
