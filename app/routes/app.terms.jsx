import React from "react";

export default function TermsPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Terms of Service</h1>

        <p>Effective Date: July 2026</p>

        <h2>Acceptance</h2>

        <p>
          By installing and using NearbyPulse, you agree to these Terms of
          Service.
        </p>

        <h2>Service</h2>

        <p>
          NearbyPulse provides location-aware social proof messages for Shopify
          stores.
        </p>

        <h2>Merchant Responsibilities</h2>

        <ul>
          <li>Use NearbyPulse responsibly.</li>
          <li>Comply with Shopify policies.</li>
          <li>Maintain accurate store information.</li>
        </ul>

        <h2>Billing</h2>

        <p>
          Subscription charges are processed through Shopify Billing.
        </p>

        <h2>Availability</h2>

        <p>
          We aim for high availability but cannot guarantee uninterrupted
          service.
        </p>

        <h2>Limitation of Liability</h2>

        <p>
          NearbyPulse is provided "as is" without warranties of any kind.
        </p>

        <h2>Changes</h2>

        <p>
          We may update these Terms periodically. Continued use of NearbyPulse
          constitutes acceptance of any updates.
        </p>

        <h2>Contact</h2>

        <p>support@nearbypulse.app</p>
      </div>
    </div>
  );
}

const styles={
page:{maxWidth:900,margin:"0 auto",padding:32,background:"#f6f6f7",minHeight:"100vh"},
card:{background:"#fff",padding:30,borderRadius:12,border:"1px solid #e1e3e5",lineHeight:1.8}
};
