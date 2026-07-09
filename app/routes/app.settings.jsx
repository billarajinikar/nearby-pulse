import { Form, useLoaderData, useActionData, useNavigation } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";

const defaultTemplate =
  "Someone from {city} purchased this item {minutes} minutes ago.";

const demoCities = [
  "Stockholm",
  "Gothenburg",
  "Malmö",
  "Uppsala",
  "Västerås",
  "Berlin",
  "Amsterdam",
  "Paris",
  "London",
];

const demoMinutes = [3, 5, 7, 9, 12, 18, 24, 31];

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let { data: settings } = await supabase
    .from("shop_settings")
    .select("*")
    .eq("shop", shop)
    .single();

  if (!settings) {
    const { data } = await supabase
      .from("shop_settings")
      .insert({
        shop,
        is_enabled: true,
        radius_km: 100,
        city_mode: "random",
        message_mode: "random",
        fixed_message: "Someone near {city} recently bought this item.",
        max_per_product_per_hour: 2,
        cooldown_minutes: 4,
        display_seconds: 10,
      })
      .select()
      .single();

    settings = data;
  }

  const { data: templates } = await supabase
    .from("message_templates")
    .select("template")
    .eq("shop", shop)
    .order("sort_order");

  return {
    shop,
    settings,
    templates: templates?.map((t) => t.template).join("\n") || defaultTemplate,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();

  const settings = {
    shop,
    is_enabled: formData.get("is_enabled") === "on",
    radius_km: Number(formData.get("radius_km") || 100),
    city_mode: formData.get("city_mode") || "random",
    message_mode: formData.get("message_mode") || "random",
    fixed_message:
      formData.get("fixed_message") ||
      "Someone near {city} recently bought this item.",
    max_per_product_per_hour: Number(
      formData.get("max_per_product_per_hour") || 2
    ),
    cooldown_minutes: Number(formData.get("cooldown_minutes") || 4),
    display_seconds: Number(formData.get("display_seconds") || 10),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("shop_settings")
    .upsert(settings, { onConflict: "shop" });

  if (error) {
    return { success: false, error: error.message };
  }

  await supabase.from("message_templates").delete().eq("shop", shop);

  const templates = String(formData.get("templates") || "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const finalTemplates = templates.length ? templates : [defaultTemplate];

  await supabase.from("message_templates").insert(
    finalTemplates.map((template, index) => ({
      shop,
      template,
      sort_order: index + 1,
      is_enabled: true,
    }))
  );

  return { success: true };
};

export default function SettingsPage() {
  const { settings, templates } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const saving = navigation.state === "submitting";

  const initialTemplates = templates
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const [templateList, setTemplateList] = useState(initialTemplates);
  const [previewCity, setPreviewCity] = useState(getRandomItem(demoCities));
  const [previewMinutes, setPreviewMinutes] = useState(getRandomItem(demoMinutes));
  const [previewTemplate, setPreviewTemplate] = useState(
    getRandomItem(initialTemplates.length ? initialTemplates : [defaultTemplate])
  );

  const renderedPreview = previewTemplate
    .replaceAll("{city}", previewCity)
    .replaceAll("{minutes}", String(previewMinutes));

  function addTemplate() {
    setTemplateList([...templateList, defaultTemplate]);
  }

  function updateTemplate(index, value) {
    const updated = [...templateList];
    updated[index] = value;
    setTemplateList(updated);

    if (previewTemplate === templateList[index]) {
      setPreviewTemplate(value);
    }
  }

  function removeTemplate(index) {
    const updated = templateList.filter((_, i) => i !== index);
    setTemplateList(updated.length ? updated : [defaultTemplate]);
  }

  function randomizePreview() {
    const currentTemplates = templateList.map((t) => t.trim()).filter(Boolean);

    setPreviewCity(getRandomItem(demoCities));
    setPreviewMinutes(getRandomItem(demoMinutes));
    setPreviewTemplate(
      getRandomItem(currentTemplates.length ? currentTemplates : [defaultTemplate])
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Storefront widget</p>
          <h1 style={styles.title}>NearbyPulse Settings</h1>
          <p style={styles.subtitle}>
            Control how local social proof appears near your product page buy area.
          </p>
        </div>

        <button type="submit" form="settings-form" style={styles.primaryButton}>
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {actionData?.success && (
        <div style={styles.success}>✅ Settings saved successfully.</div>
      )}

      {actionData?.error && (
        <div style={styles.error}>❌ {actionData.error}</div>
      )}

      <Form method="post" id="settings-form">
        <div style={styles.layout}>
          <main style={styles.main}>
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>General</h2>
              <p style={styles.cardDescription}>
                Turn NearbyPulse on or off for this store.
              </p>

              <label style={styles.toggleRow}>
                <input
                  type="checkbox"
                  name="is_enabled"
                  defaultChecked={settings.is_enabled}
                  style={styles.checkbox}
                />
                <span>
                  <strong>Enable NearbyPulse</strong>
                  <small style={styles.helpText}>
                    Show location-aware social proof messages on product pages.
                  </small>
                </span>
              </label>
            </section>

            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Display Rules</h2>
              <p style={styles.cardDescription}>
                Choose how local cities and messages are selected.
              </p>

              <div style={styles.field}>
                <label style={styles.label}>Nearby city radius</label>
                <div style={styles.segmented}>
                  {[25, 50, 100, 200].map((value) => (
                    <label key={value} style={styles.segmentOption}>
                      <input
                        type="radio"
                        name="radius_km"
                        value={value}
                        defaultChecked={Number(settings.radius_km) === value}
                      />
                      <span>{value} km</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={styles.twoColumns}>
                <div style={styles.field}>
                  <label style={styles.label}>City selection</label>
                  <select
                    name="city_mode"
                    defaultValue={settings.city_mode}
                    style={styles.input}
                  >
                    <option value="random">Random nearby city</option>
                    <option value="nearest">Nearest city</option>
                  </select>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Message mode</label>
                  <select
                    name="message_mode"
                    defaultValue={settings.message_mode}
                    style={styles.input}
                  >
                    <option value="random">Random messages</option>
                    <option value="fixed">Fixed message</option>
                  </select>
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Fixed message</label>
                <textarea
                  name="fixed_message"
                  rows="3"
                  defaultValue={
                    settings.fixed_message ||
                    "Someone near {city} recently bought this item."
                  }
                  style={styles.textarea}
                />
                <p style={styles.helpText}>
                  Available variable: <strong>{"{city}"}</strong>
                </p>
              </div>
            </section>

            <section style={styles.card}>
              <div style={styles.templateTitleRow}>
                <div>
                  <h2 style={styles.cardTitle}>Message Templates</h2>
                  <p style={styles.cardDescription}>
                    Add one message per card. NearbyPulse rotates these messages randomly.
                  </p>
                </div>

                <span style={styles.templateCount}>{templateList.length} active</span>
              </div>

              <input type="hidden" name="templates" value={templateList.join("\n")} />

              <div style={styles.templateList}>
                {templateList.map((template, index) => (
                  <div key={index} style={styles.templateCard}>
                    <div style={styles.templateHeader}>
                      <strong>Template #{index + 1}</strong>

                      <button
                        type="button"
                        onClick={() => removeTemplate(index)}
                        style={styles.deleteButton}
                      >
                        Remove
                      </button>
                    </div>

                    <textarea
                      rows="3"
                      value={template}
                      onChange={(e) => updateTemplate(index, e.target.value)}
                      style={styles.textarea}
                    />

                    <div style={styles.variableRow}>
                      <span style={styles.variableBadge}>{"{city}"}</span>
                      <span style={styles.variableBadge}>{"{minutes}"}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addTemplate} style={styles.secondaryButton}>
                + Add template
              </button>
            </section>
          </main>

          <aside style={styles.side}>
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Timing</h2>
              <p style={styles.cardDescription}>
                Control how often shoppers see messages.
              </p>

              <div style={styles.field}>
                <label style={styles.label}>Messages / hour</label>
                <input
                  type="number"
                  name="max_per_product_per_hour"
                  min="1"
                  max="20"
                  defaultValue={settings.max_per_product_per_hour}
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Cooldown</label>
                <input
                  type="number"
                  name="cooldown_minutes"
                  min="0"
                  max="60"
                  defaultValue={settings.cooldown_minutes}
                  style={styles.input}
                />
                <p style={styles.helpText}>Minutes</p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Display time</label>
                <input
                  type="number"
                  name="display_seconds"
                  min="3"
                  max="60"
                  defaultValue={settings.display_seconds}
                  style={styles.input}
                />
                <p style={styles.helpText}>Seconds</p>
              </div>
            </section>

            <section style={styles.previewCard}>
              <p style={styles.eyebrow}>Live Preview</p>

              <div style={styles.widgetPreview}>
                <div style={styles.previewIcon}>📍</div>
                <p style={styles.previewText}>{renderedPreview}</p>
              </div>

              <button
                type="button"
                onClick={randomizePreview}
                style={styles.previewButton}
              >
                🎲 Random Preview
              </button>

              <p style={styles.helpText}>
                Preview rotates between your templates using sample cities and times.
              </p>
            </section>
          </aside>
        </div>
      </Form>
    </div>
  );
}

const styles = {
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
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 24,
  },
  eyebrow: {
    margin: "0 0 6px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#008060",
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 750,
    color: "#202223",
  },
  subtitle: {
    marginTop: 8,
    color: "#6d7175",
    fontSize: 15,
    lineHeight: 1.5,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 350px",
    gap: 24,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  side: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  card: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 14,
    padding: 22,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  previewCard: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 14,
    padding: 22,
    position: "sticky",
    top: 20,
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#202223",
  },
  cardDescription: {
    margin: "6px 0 18px",
    color: "#6d7175",
    fontSize: 13,
    lineHeight: 1.5,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    display: "block",
    marginBottom: 7,
    fontSize: 13,
    fontWeight: 700,
    color: "#202223",
  },
  input: {
    width: "100%",
    padding: "11px 12px",
    border: "1px solid #c9cccf",
    borderRadius: 10,
    fontSize: 14,
    background: "#fff",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "11px 12px",
    border: "1px solid #c9cccf",
    borderRadius: 10,
    fontSize: 14,
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  helpText: {
    display: "block",
    marginTop: 7,
    fontSize: 13,
    color: "#6d7175",
    lineHeight: 1.45,
  },
  toggleRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
    border: "1px solid #e1e3e5",
    borderRadius: 12,
    background: "#fafafa",
    fontSize: 15,
  },
  checkbox: {
    marginTop: 3,
    width: 18,
    height: 18,
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  segmented: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
  },
  segmentOption: {
    cursor: "pointer",
    fontSize: 14,
  },
  templateTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  templateCount: {
    background: "#e3f1df",
    color: "#008060",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  templateList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginBottom: 16,
  },
  templateCard: {
    border: "1px solid #e1e3e5",
    borderRadius: 12,
    padding: 14,
    background: "#fafafa",
  },
  templateHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  deleteButton: {
    background: "#fff4f4",
    color: "#8a1f11",
    border: "1px solid #fed3d1",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  },
  secondaryButton: {
    background: "#f6f6f7",
    color: "#202223",
    border: "1px solid #c9cccf",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  primaryButton: {
    background: "#008060",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  success: {
    background: "#e3f1df",
    border: "1px solid #bbe5b3",
    color: "#1f3520",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  error: {
    background: "#fff4f4",
    border: "1px solid #fed3d1",
    color: "#8a1f11",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  variableRow: {
    display: "flex",
    gap: 8,
    marginTop: 8,
  },
  variableBadge: {
    background: "#eef2ff",
    color: "#3730a3",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 700,
  },
  widgetPreview: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(34, 197, 94, 0.25)",
    background: "linear-gradient(135deg, #f0fdf4, #ffffff)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
  },
  previewIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    background: "#dcfce7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  previewText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: "#1f2937",
  },
  previewButton: {
    width: "100%",
    marginTop: 12,
    background: "#f6f6f7",
    color: "#202223",
    border: "1px solid #c9cccf",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
};
