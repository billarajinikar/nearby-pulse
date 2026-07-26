import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useMemo, useState } from "react";

import { authenticate } from "../shopify.server";
import { supabase } from "../services/supabase.server";

const ACTIVITY_TYPES = [
  {
    key: "order_completed",
    label: "Purchase Messages",
    shortLabel: "Purchases",
    description:
      "Shown only when NearbyPulse receives a verified completed-order event for this product.",
    defaultTemplate:
      "Someone from {city} purchased {product} {time} ago.",
    variables: ["{city}", "{time}", "{product}"],
  },
  {
    key: "checkout_started",
    label: "Checkout Messages",
    shortLabel: "Checkout",
    description:
      "Shown when a shopper recently started checkout with this product.",
    defaultTemplate:
      "A shopper near {city} started checkout with {product} {time} ago.",
    variables: ["{city}", "{time}", "{product}"],
  },
  {
    key: "add_to_cart",
    label: "Added-to-Cart Messages",
    shortLabel: "Added to cart",
    description:
      "Shown when a shopper recently added this product to their cart.",
    defaultTemplate:
      "A shopper near {city} added {product} to their cart {time} ago.",
    variables: ["{city}", "{time}", "{product}"],
  },
  {
    key: "product_viewed",
    label: "Recently Viewed Messages",
    shortLabel: "Product views",
    description:
      "Shown when a shopper recently viewed this product.",
    defaultTemplate:
      "Someone near {city} viewed {product} {time} ago.",
    variables: ["{city}", "{time}", "{product}"],
  },
];

const DEFAULT_STORE_MESSAGE =
  "Free delivery is available on qualifying orders.";

const SAMPLE_CITIES = [
  "Stockholm",
  "Västerås",
  "Gothenburg",
  "Malmö",
  "Uppsala",
];

const SAMPLE_TIMES = [
  "3 minutes",
  "7 minutes",
  "15 minutes",
  "1 hour",
  "3 hours",
];

const SAMPLE_PRODUCTS = [
  "this product",
  "Classic Cotton T-shirt",
  "Nordic Travel Backpack",
  "Minimal Desk Lamp",
];

function randomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  return items[Math.floor(Math.random() * items.length)];
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(parsed, maximum));
}

function cleanList(values, fallback) {
  if (!Array.isArray(values)) {
    return [fallback];
  }

  const cleaned = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : [fallback];
}

function applyActivityVariables(template, values) {
  return String(template || "")
    .replaceAll("{city}", values.city || "Stockholm")
    .replaceAll("{time}", values.time || "7 minutes")
    .replaceAll("{minutes}", values.time || "7 minutes")
    .replaceAll("{product}", values.product || "this product");
}

function containsStoreMessagePlaceholder(message) {
  return /{[^}]+}/.test(String(message || ""));
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let { data: settings, error: settingsError } = await supabase
    .from("shop_settings")
    .select("*")
    .eq("shop", shop)
    .maybeSingle();

  if (settingsError) {
    console.error("Unable to load NearbyPulse settings:", settingsError);
  }

  if (!settings) {
    const { data: createdSettings, error: createError } = await supabase
      .from("shop_settings")
      .insert({
        shop,
        is_enabled: true,
        radius_km: 100,
        city_mode: "activity",
        message_mode: "random",
        max_per_product_per_hour: 3,
        cooldown_minutes: 15,
        display_seconds: 10,
        announcement_percentage: 20,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(
        `Unable to create NearbyPulse settings: ${createError.message}`,
      );
    }

    settings = createdSettings;
  }

  const { data: rows, error: templateError } = await supabase
    .from("message_templates")
    .select(
      `
        id,
        template,
        event_type,
        is_announcement,
        is_enabled,
        sort_order
      `,
    )
    .eq("shop", shop)
    .eq("is_enabled", true)
    .order("sort_order", {
      ascending: true,
    });

  if (templateError) {
    console.error("Unable to load message templates:", templateError);
  }

  const activityTemplates = {};

  for (const type of ACTIVITY_TYPES) {
    const templates = (rows || [])
      .filter(
        (row) =>
          row.event_type === type.key &&
          row.is_announcement !== true,
      )
      .map((row) => row.template)
      .filter(Boolean);

    activityTemplates[type.key] =
      templates.length > 0
        ? templates
        : [type.defaultTemplate];
  }

  const storeMessages = (rows || [])
    .filter(
      (row) =>
        row.event_type === "announcement" ||
        row.is_announcement === true,
    )
    .map((row) => row.template)
    .filter(Boolean)
    .filter((message) => !containsStoreMessagePlaceholder(message));

  return {
    settings,
    activityTemplates,
    storeMessages:
      storeMessages.length > 0
        ? storeMessages
        : [DEFAULT_STORE_MESSAGE],
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();

  let submittedActivityTemplates;
  let submittedStoreMessages;

  try {
    submittedActivityTemplates = JSON.parse(
      String(formData.get("activity_templates") || "{}"),
    );

    submittedStoreMessages = JSON.parse(
      String(formData.get("store_messages") || "[]"),
    );
  } catch {
    return Response.json(
      {
        success: false,
        error: "Invalid template data.",
      },
      {
        status: 400,
      },
    );
  }

  const cityMode = String(
    formData.get("city_mode") || "activity",
  );

  const messageMode = String(
    formData.get("message_mode") || "random",
  );

  const settings = {
    shop,
    is_enabled: formData.get("is_enabled") === "on",

    radius_km: clampNumber(
      formData.get("radius_km"),
      1,
      1000,
      100,
    ),

    city_mode: ["activity", "nearest"].includes(cityMode)
      ? cityMode
      : "activity",

    message_mode: ["random", "first"].includes(messageMode)
      ? messageMode
      : "random",

    max_per_product_per_hour: clampNumber(
      formData.get("max_per_product_per_hour"),
      1,
      20,
      3,
    ),

    cooldown_minutes: clampNumber(
      formData.get("cooldown_minutes"),
      0,
      180,
      15,
    ),

    display_seconds: clampNumber(
      formData.get("display_seconds"),
      3,
      30,
      10,
    ),

    announcement_percentage: clampNumber(
      formData.get("announcement_percentage"),
      0,
      100,
      20,
    ),

    updated_at: new Date().toISOString(),
  };

  const templateRows = [];
  let sortOrder = 1;

  for (const type of ACTIVITY_TYPES) {
    const templates = cleanList(
      submittedActivityTemplates?.[type.key],
      type.defaultTemplate,
    );

    for (const template of templates) {
      templateRows.push({
        shop,
        template,
        event_type: type.key,
        is_announcement: false,
        is_enabled: true,
        sort_order: sortOrder,
      });

      sortOrder += 1;
    }
  }

  const cleanedStoreMessages = cleanList(
    submittedStoreMessages,
    DEFAULT_STORE_MESSAGE,
  );

  for (const message of cleanedStoreMessages) {
    if (containsStoreMessagePlaceholder(message)) {
      return Response.json(
        {
          success: false,
          error:
            "Store messages cannot contain placeholders such as {city}, {time}, or {product}.",
        },
        {
          status: 400,
        },
      );
    }

    templateRows.push({
      shop,
      template: message,
      event_type: "announcement",
      is_announcement: true,
      is_enabled: true,
      sort_order: sortOrder,
    });

    sortOrder += 1;
  }

  const { error: settingsError } = await supabase
    .from("shop_settings")
    .upsert(settings, {
      onConflict: "shop",
    });

  if (settingsError) {
    return Response.json(
      {
        success: false,
        error: settingsError.message,
      },
      {
        status: 500,
      },
    );
  }

  const { error: deleteError } = await supabase
    .from("message_templates")
    .delete()
    .eq("shop", shop);

  if (deleteError) {
    return Response.json(
      {
        success: false,
        error: deleteError.message,
      },
      {
        status: 500,
      },
    );
  }

  const { error: insertError } = await supabase
    .from("message_templates")
    .insert(templateRows);

  if (insertError) {
    return Response.json(
      {
        success: false,
        error: insertError.message,
      },
      {
        status: 500,
      },
    );
  }

  return Response.json({
    success: true,
    message: "NearbyPulse settings saved.",
  });
}

function ActivityTemplateEditor({
  type,
  templates,
  onAdd,
  onUpdate,
  onRemove,
  onPreview,
}) {
  return (
    <div style={styles.activitySection}>
      <div style={styles.sectionHeadingRow}>
        <div>
          <h3 style={styles.sectionHeading}>{type.label}</h3>

          <p style={styles.sectionDescription}>
            {type.description}
          </p>
        </div>

        <span style={styles.verifiedBadge}>Verified event</span>
      </div>

      <div style={styles.templateList}>
        {templates.map((template, index) => (
          <div
            key={`${type.key}-${index}`}
            style={styles.templateCard}
          >
            <div style={styles.templateHeader}>
              <strong>Template #{index + 1}</strong>

              <div style={styles.templateActions}>
                <button
                  type="button"
                  style={styles.smallButton}
                  onClick={() => onPreview(type.key, template)}
                >
                  Preview
                </button>

                <button
                  type="button"
                  style={styles.removeButton}
                  onClick={() => onRemove(type.key, index)}
                >
                  Remove
                </button>
              </div>
            </div>

            <textarea
              rows={3}
              value={template}
              style={styles.textarea}
              onChange={(event) =>
                onUpdate(type.key, index, event.target.value)
              }
            />

            <div style={styles.variableList}>
              {type.variables.map((variable) => (
                <span key={variable} style={styles.variableBadge}>
                  {variable}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        style={styles.secondaryButton}
        onClick={() => onAdd(type.key)}
      >
        + Add template
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const {
    settings,
    activityTemplates: initialActivityTemplates,
    storeMessages: initialStoreMessages,
  } = useLoaderData();

  const actionData = useActionData();
  const navigation = useNavigation();

  const saving = navigation.state === "submitting";

  const [activeTab, setActiveTab] = useState("activity");

  const [activityTemplates, setActivityTemplates] = useState(
    initialActivityTemplates,
  );

  const [storeMessages, setStoreMessages] = useState(
    initialStoreMessages,
  );

  const [previewType, setPreviewType] =
    useState("order_completed");

  const [previewTemplate, setPreviewTemplate] = useState(
    initialActivityTemplates.order_completed?.[0] ||
      ACTIVITY_TYPES[0].defaultTemplate,
  );

  const [previewCity, setPreviewCity] = useState(
    randomItem(SAMPLE_CITIES),
  );

  const [previewTime, setPreviewTime] = useState(
    randomItem(SAMPLE_TIMES),
  );

  const [previewProduct, setPreviewProduct] = useState(
    randomItem(SAMPLE_PRODUCTS),
  );

  const activityPreview = useMemo(
    () =>
      applyActivityVariables(previewTemplate, {
        city: previewCity,
        time: previewTime,
        product: previewProduct,
      }),
    [
      previewTemplate,
      previewCity,
      previewTime,
      previewProduct,
    ],
  );

  const storePreview =
    storeMessages.find((message) => message.trim()) ||
    DEFAULT_STORE_MESSAGE;

  function randomiseActivityPreview() {
    const availableTemplates =
      activityTemplates[previewType]?.filter((item) =>
        item.trim(),
      ) || [];

    const type = ACTIVITY_TYPES.find(
      (item) => item.key === previewType,
    );

    setPreviewTemplate(
      randomItem(availableTemplates) ||
        type?.defaultTemplate ||
        "",
    );

    setPreviewCity(randomItem(SAMPLE_CITIES));
    setPreviewTime(randomItem(SAMPLE_TIMES));
    setPreviewProduct(randomItem(SAMPLE_PRODUCTS));
  }

  function updateActivityTemplate(typeKey, index, value) {
    setActivityTemplates((current) => {
      const updated = [...(current[typeKey] || [])];
      updated[index] = value;

      return {
        ...current,
        [typeKey]: updated,
      };
    });
  }

  function addActivityTemplate(typeKey) {
    const type = ACTIVITY_TYPES.find(
      (item) => item.key === typeKey,
    );

    if (!type) {
      return;
    }

    setActivityTemplates((current) => ({
      ...current,
      [typeKey]: [
        ...(current[typeKey] || []),
        type.defaultTemplate,
      ],
    }));
  }

  function removeActivityTemplate(typeKey, index) {
    const type = ACTIVITY_TYPES.find(
      (item) => item.key === typeKey,
    );

    if (!type) {
      return;
    }

    setActivityTemplates((current) => {
      const remaining = (current[typeKey] || []).filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return {
        ...current,
        [typeKey]:
          remaining.length > 0
            ? remaining
            : [type.defaultTemplate],
      };
    });
  }

  function previewActivityTemplate(typeKey, template) {
    setPreviewType(typeKey);
    setPreviewTemplate(template);
    setPreviewCity(randomItem(SAMPLE_CITIES));
    setPreviewTime(randomItem(SAMPLE_TIMES));
    setPreviewProduct(randomItem(SAMPLE_PRODUCTS));
  }

  function addStoreMessage() {
    setStoreMessages((current) => [
      ...current,
      DEFAULT_STORE_MESSAGE,
    ]);
  }

  function updateStoreMessage(index, value) {
    setStoreMessages((current) => {
      const updated = [...current];
      updated[index] = value;
      return updated;
    });
  }

  function removeStoreMessage(index) {
    setStoreMessages((current) => {
      const remaining = current.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return remaining.length > 0
        ? remaining
        : [DEFAULT_STORE_MESSAGE];
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Storefront widget</p>

          <h1 style={styles.title}>NearbyPulse Settings</h1>

          <p style={styles.subtitle}>
            Configure verified customer activity and merchant-authored
            store messages separately.
          </p>
        </div>

        <button
          type="submit"
          form="nearby-pulse-settings"
          disabled={saving}
          style={{
            ...styles.primaryButton,
            opacity: saving ? 0.65 : 1,
          }}
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      {actionData?.success && (
        <div style={styles.success}>
          ✓ Settings saved successfully.
        </div>
      )}

      {actionData?.error && (
        <div style={styles.error}>{actionData.error}</div>
      )}

      <Form method="post" id="nearby-pulse-settings">
        <input
          type="hidden"
          name="activity_templates"
          value={JSON.stringify(activityTemplates)}
        />

        <input
          type="hidden"
          name="store_messages"
          value={JSON.stringify(storeMessages)}
        />

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>General</h2>

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
                Show verified activity and store messages on product
                pages.
              </small>
            </span>
          </label>
        </section>

        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "activity"
                ? styles.activityTabActive
                : {}),
            }}
          >
            <span style={styles.tabIcon}>✓</span>

            <span>
              <strong>Verified Activity</strong>
              <small>Real customer events</small>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("store")}
            style={{
              ...styles.tabButton,
              ...(activeTab === "store"
                ? styles.storeTabActive
                : {}),
            }}
          >
            <span style={styles.tabIcon}>i</span>

            <span>
              <strong>Store Messages</strong>
              <small>Information and promotions</small>
            </span>
          </button>
        </div>

        {activeTab === "activity" && (
          <div style={styles.twoColumnLayout}>
            <main style={styles.mainColumn}>
              <section style={styles.card}>
                <div style={styles.verifiedNotice}>
                  <strong>Verified customer activity</strong>

                  <p>
                    These messages are displayed only when
                    NearbyPulse receives a matching product event.
                    Purchase wording is never used for product views,
                    carts or checkout events.
                  </p>
                </div>

                <h2 style={styles.cardTitle}>Location Rules</h2>

                <div style={styles.field}>
                  <label style={styles.label}>
                    Nearby activity radius
                  </label>

                  <div style={styles.radiusOptions}>
                    {[25, 50, 100, 200].map((radius) => (
                      <label key={radius} style={styles.radioLabel}>
                        <input
                          type="radio"
                          name="radius_km"
                          value={radius}
                          defaultChecked={
                            Number(settings.radius_km) === radius
                          }
                        />

                        <span>{radius} km</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={styles.fieldGrid}>
                  <div style={styles.field}>
                    <label style={styles.label}>City source</label>

                    <select
                      name="city_mode"
                      defaultValue={
                        settings.city_mode || "activity"
                      }
                      style={styles.input}
                    >
                      <option value="activity">
                        Use activity city
                      </option>

                      <option value="nearest">
                        Use nearest matching city
                      </option>
                    </select>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>
                      Template selection
                    </label>

                    <select
                      name="message_mode"
                      defaultValue={
                        settings.message_mode || "random"
                      }
                      style={styles.input}
                    >
                      <option value="random">
                        Random matching template
                      </option>

                      <option value="first">
                        First matching template
                      </option>
                    </select>
                  </div>
                </div>
              </section>

              <section style={styles.card}>
                <h2 style={styles.cardTitle}>
                  Activity Message Templates
                </h2>

                <p style={styles.cardDescription}>
                  Each category is connected to its corresponding
                  verified event.
                </p>

                {ACTIVITY_TYPES.map((type) => (
                  <ActivityTemplateEditor
                    key={type.key}
                    type={type}
                    templates={
                      activityTemplates[type.key] || []
                    }
                    onAdd={addActivityTemplate}
                    onUpdate={updateActivityTemplate}
                    onRemove={removeActivityTemplate}
                    onPreview={previewActivityTemplate}
                  />
                ))}
              </section>
            </main>

            <aside style={styles.sideColumn}>
              <section style={styles.previewCard}>
                <p style={styles.greenEyebrow}>
                  Verified Activity Preview
                </p>

                <label style={styles.label}>Event type</label>

                <select
                  value={previewType}
                  style={styles.input}
                  onChange={(event) => {
                    const typeKey = event.target.value;
                    const type = ACTIVITY_TYPES.find(
                      (item) => item.key === typeKey,
                    );

                    setPreviewType(typeKey);
                    setPreviewTemplate(
                      activityTemplates[typeKey]?.[0] ||
                        type?.defaultTemplate ||
                        "",
                    );
                  }}
                >
                  {ACTIVITY_TYPES.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.shortLabel}
                    </option>
                  ))}
                </select>

                <div style={styles.activityWidgetPreview}>
                  <div style={styles.previewIcon}>📍</div>
                  <p style={styles.previewText}>{activityPreview}</p>
                </div>

                <button
                  type="button"
                  style={styles.previewButton}
                  onClick={randomiseActivityPreview}
                >
                  🎲 Random preview
                </button>

                <p style={styles.helpText}>
                  Preview values are examples only. Storefront
                  messages use matching activity data.
                </p>
              </section>

              <TimingSettings settings={settings} />
            </aside>
          </div>
        )}

        {activeTab === "store" && (
          <div style={styles.twoColumnLayout}>
            <main style={styles.mainColumn}>
              <section style={styles.card}>
                <div style={styles.storeNotice}>
                  <strong>Merchant-authored store information</strong>

                  <p>
                    Store Messages are not based on customer activity.
                    Use them for shipping, returns, offers, support or
                    other information that is true for your store.
                  </p>
                </div>

                <h2 style={styles.cardTitle}>Store Messages</h2>

                <p style={styles.cardDescription}>
                  Placeholders are intentionally disabled for store
                  messages.
                </p>

                <div style={styles.safeExamples}>
                  <strong>Safe examples</strong>

                  <span>Free delivery on qualifying orders.</span>
                  <span>Easy 30-day returns.</span>
                  <span>Secure checkout available.</span>
                  <span>Orders usually dispatch within 24 hours.</span>
                </div>

                <div style={styles.templateList}>
                  {storeMessages.map((message, index) => {
                    const hasPlaceholder =
                      containsStoreMessagePlaceholder(message);

                    return (
                      <div
                        key={`store-message-${index}`}
                        style={styles.templateCard}
                      >
                        <div style={styles.templateHeader}>
                          <strong>
                            Store message #{index + 1}
                          </strong>

                          <button
                            type="button"
                            style={styles.removeButton}
                            onClick={() =>
                              removeStoreMessage(index)
                            }
                          >
                            Remove
                          </button>
                        </div>

                        <textarea
                          rows={3}
                          value={message}
                          style={{
                            ...styles.textarea,
                            borderColor: hasPlaceholder
                              ? "#d72c0d"
                              : "#c9cccf",
                          }}
                          onChange={(event) =>
                            updateStoreMessage(
                              index,
                              event.target.value,
                            )
                          }
                        />

                        {hasPlaceholder && (
                          <p style={styles.inlineError}>
                            Placeholders are not permitted in Store
                            Messages.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={addStoreMessage}
                >
                  + Add store message
                </button>
              </section>
            </main>

            <aside style={styles.sideColumn}>
              <section style={styles.storePreviewCard}>
                <p style={styles.blueEyebrow}>
                  Store Message Preview
                </p>

                <div style={styles.storeWidgetPreview}>
                  <div style={styles.previewIcon}>📦</div>
                  <p style={styles.previewText}>{storePreview}</p>
                </div>

                <p style={styles.helpText}>
                  Store Messages never display customer activity,
                  location or elapsed-time placeholders.
                </p>
              </section>

              <section style={styles.card}>
                <h2 style={styles.cardTitle}>
                  Store Message Frequency
                </h2>

                <div style={styles.field}>
                  <label style={styles.label}>
                    Percentage of messages
                  </label>

                  <input
                    type="number"
                    name="announcement_percentage"
                    min={0}
                    max={100}
                    defaultValue={
                      settings.announcement_percentage ?? 20
                    }
                    style={styles.input}
                  />

                  <p style={styles.helpText}>
                    Set to 0 to disable Store Messages. Recommended:
                    10–20%.
                  </p>
                </div>
              </section>

              <TimingSettings settings={settings} />
            </aside>
          </div>
        )}
      </Form>
    </div>
  );
}

function TimingSettings({ settings }) {
  return (
    <section style={styles.card}>
      <h2 style={styles.cardTitle}>Timing</h2>

      <div style={styles.field}>
        <label style={styles.label}>
          Messages per product / hour
        </label>

        <input
          type="number"
          name="max_per_product_per_hour"
          min={1}
          max={20}
          defaultValue={
            settings.max_per_product_per_hour || 3
          }
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Cooldown in minutes</label>

        <input
          type="number"
          name="cooldown_minutes"
          min={0}
          max={180}
          defaultValue={settings.cooldown_minutes ?? 15}
          style={styles.input}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Display time in seconds</label>

        <input
          type="number"
          name="display_seconds"
          min={3}
          max={30}
          defaultValue={settings.display_seconds || 10}
          style={styles.input}
        />
      </div>
    </section>
  );
}

const styles = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: 32,
    minHeight: "100vh",
    background: "#f6f6f7",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
    color: "#6d7175",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
  },

  greenEyebrow: {
    margin: "0 0 14px",
    color: "#008060",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
  },

  blueEyebrow: {
    margin: "0 0 14px",
    color: "#2463bc",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
  },

  title: {
    margin: 0,
    color: "#202223",
    fontSize: 30,
  },

  subtitle: {
    maxWidth: 680,
    margin: "8px 0 0",
    color: "#6d7175",
    lineHeight: 1.5,
  },

  card: {
    marginBottom: 20,
    padding: 22,
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: 14,
  },

  cardTitle: {
    margin: "0 0 8px",
    fontSize: 18,
    color: "#202223",
  },

  cardDescription: {
    margin: "0 0 18px",
    color: "#6d7175",
    fontSize: 13,
    lineHeight: 1.5,
  },

  toggleRow: {
    display: "flex",
    gap: 12,
    padding: 14,
    background: "#fafafa",
    border: "1px solid #e1e3e5",
    borderRadius: 10,
  },

  checkbox: {
    width: 18,
    height: 18,
  },

  helpText: {
    display: "block",
    marginTop: 7,
    color: "#6d7175",
    fontSize: 13,
    lineHeight: 1.45,
  },

  tabBar: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 22,
  },

  tabButton: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 18,
    textAlign: "left",
    background: "#ffffff",
    border: "2px solid #e1e3e5",
    borderRadius: 14,
    cursor: "pointer",
    color: "#202223",
  },

  activityTabActive: {
    borderColor: "#008060",
    background: "#f1f8f5",
  },

  storeTabActive: {
    borderColor: "#2463bc",
    background: "#f3f7fd",
  },

  tabIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "#f1f2f3",
    fontWeight: 700,
  },

  twoColumnLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 340px",
    gap: 22,
  },

  mainColumn: {
    minWidth: 0,
  },

  sideColumn: {
    minWidth: 0,
  },

  verifiedNotice: {
    marginBottom: 22,
    padding: 16,
    background: "#eef8f4",
    border: "1px solid #95c9b8",
    borderRadius: 10,
    color: "#174c3c",
    lineHeight: 1.5,
  },

  storeNotice: {
    marginBottom: 22,
    padding: 16,
    background: "#f3f7fd",
    border: "1px solid #9ab7df",
    borderRadius: 10,
    color: "#183b66",
    lineHeight: 1.5,
  },

  field: {
    marginBottom: 18,
  },

  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },

  label: {
    display: "block",
    marginBottom: 7,
    fontSize: 13,
    fontWeight: 700,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #c9cccf",
    borderRadius: 9,
    background: "#ffffff",
    fontSize: 14,
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #c9cccf",
    borderRadius: 9,
    fontFamily: "inherit",
    fontSize: 14,
    resize: "vertical",
  },

  radiusOptions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
  },

  radioLabel: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },

  activitySection: {
    marginTop: 24,
    paddingTop: 24,
    borderTop: "1px solid #e1e3e5",
  },

  sectionHeadingRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  },

  sectionHeading: {
    margin: 0,
    fontSize: 16,
  },

  sectionDescription: {
    margin: "5px 0 14px",
    color: "#6d7175",
    fontSize: 13,
    lineHeight: 1.45,
  },

  verifiedBadge: {
    padding: "5px 9px",
    color: "#006e52",
    background: "#dff3eb",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  templateList: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginBottom: 15,
  },

  templateCard: {
    padding: 14,
    background: "#fafafa",
    border: "1px solid #e1e3e5",
    borderRadius: 11,
  },

  templateHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  templateActions: {
    display: "flex",
    gap: 8,
  },

  variableList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 8,
  },

  variableBadge: {
    padding: "4px 8px",
    color: "#3730a3",
    background: "#eef2ff",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },

  primaryButton: {
    padding: "11px 18px",
    color: "#ffffff",
    background: "#008060",
    border: 0,
    borderRadius: 9,
    cursor: "pointer",
    fontWeight: 700,
  },

  secondaryButton: {
    padding: "10px 14px",
    background: "#f6f6f7",
    border: "1px solid #c9cccf",
    borderRadius: 9,
    cursor: "pointer",
    fontWeight: 700,
  },

  smallButton: {
    padding: "6px 10px",
    background: "#ffffff",
    border: "1px solid #c9cccf",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 12,
  },

  removeButton: {
    padding: "6px 10px",
    color: "#8a1f11",
    background: "#fff4f4",
    border: "1px solid #fed3d1",
    borderRadius: 7,
    cursor: "pointer",
    fontSize: 12,
  },

  previewCard: {
    position: "sticky",
    top: 20,
    marginBottom: 20,
    padding: 22,
    background: "#ffffff",
    border: "1px solid #b8dbc9",
    borderRadius: 14,
  },

  storePreviewCard: {
    position: "sticky",
    top: 20,
    marginBottom: 20,
    padding: 22,
    background: "#ffffff",
    border: "1px solid #b7c9e5",
    borderRadius: 14,
  },

  activityWidgetPreview: {
    display: "flex",
    gap: 12,
    marginTop: 15,
    padding: 14,
    background: "#f1f8f5",
    border: "1px solid #b8dbc9",
    borderRadius: 11,
  },

  storeWidgetPreview: {
    display: "flex",
    gap: 12,
    padding: 14,
    background: "#f3f7fd",
    border: "1px solid #b7c9e5",
    borderRadius: 11,
  },

  previewIcon: {
    flexShrink: 0,
  },

  previewText: {
    margin: 0,
    lineHeight: 1.45,
  },

  previewButton: {
    width: "100%",
    marginTop: 12,
    padding: "10px 12px",
    background: "#f6f6f7",
    border: "1px solid #c9cccf",
    borderRadius: 9,
    cursor: "pointer",
    fontWeight: 700,
  },

  safeExamples: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 18,
    padding: 14,
    background: "#fafafa",
    borderRadius: 9,
    color: "#4a4d50",
    fontSize: 13,
  },

  inlineError: {
    margin: "7px 0 0",
    color: "#d72c0d",
    fontSize: 12,
    fontWeight: 600,
  },

  success: {
    marginBottom: 20,
    padding: 14,
    color: "#1f3520",
    background: "#e3f1df",
    border: "1px solid #bbe5b3",
    borderRadius: 10,
  },

  error: {
    marginBottom: 20,
    padding: 14,
    color: "#8a1f11",
    background: "#fff4f4",
    border: "1px solid #fed3d1",
    borderRadius: 10,
  },
};
