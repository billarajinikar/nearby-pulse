import React from "react";

export default function PrivacyPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1>Privacy Policy</h1>

        <p>
          Effective Date: July 2026
        </p>

        <p>
          NearbyPulse respects the privacy of merchants and their customers.
        </p>

        <h2>Information We Collect</h2>

        <ul>
          <li>Shopify shop domain</li>
          <li>NearbyPulse settings</li>
          <li>Anonymous visitor city</li>
          <li>Anonymous analytics</li>
          <li>Widget performance data</li>
        </ul>

        <h2>We Never Collect</h2>

        <ul>
          <li>Customer names</li>
          <li>Email addresses</li>
          <li>Passwords</li>
          <li>Payment information</li>
          <li>Customer accounts</li>
        </ul>

        <h2>How We Use Information</h2>

        <ul>
          <li>Display location-aware social proof.</li>
          <li>Improve NearbyPulse.</li>
          <li>Generate analytics.</li>
          <li>Provide customer support.</li>
        </ul>

        <h2>Location Data</h2>

        <p>
          NearbyPulse estimates visitor location using IP geolocation services.
          Only city-level information is used.
        </p>

        <h2>Data Security</h2>

        <p>
          We use industry-standard security practices to protect merchant
          information.
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
