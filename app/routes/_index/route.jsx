import {
  redirect,
  Form,
  useLoaderData,
} from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";


export const loader = async ({
  request,
}) => {
  const url =
    new URL(request.url);

  if (
    url.searchParams.get("shop")
  ) {
    throw redirect(
      `/app?${url.searchParams.toString()}`,
    );
  }

  return {
    showForm:
      Boolean(login),
  };
};


export default function App() {

  const { showForm } =
    useLoaderData();


  return (
    <div className={styles.index}>

      <div className={styles.content}>

        <div className={styles.heroTop}>

          <p className={styles.badge}>
            Shopify App
          </p>

          <p
            className={
              styles.dataSourceBadge
            }
          >
            Real storefront activity + merchant announcements
          </p>

        </div>


        <h1
          className={
            styles.heading
          }
        >
          Build customer confidence with relevant social proof.
        </h1>


        <p
          className={
            styles.text
          }
        >
          NearbyPulse uses real storefront activity
          and merchant-created messages to show
          shoppers timely, location-aware social
          proof without fabricated urgency.
        </p>


        {showForm && (
          <Form
            className={
              styles.form
            }
            method="post"
            action="/auth/login"
          >

            <div
              className={
                styles.formCard
              }
            >

              <label
                className={
                  styles.label
                }
              >

                <span
                  className={
                    styles.labelTitle
                  }
                >
                  Shop domain
                </span>


                <input
                  className={
                    styles.input
                  }
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  autoComplete="on"
                  inputMode="url"
                  required
                />


                <span
                  className={
                    styles.labelHint
                  }
                >
                  Use your{" "}
                  <strong>
                    .myshopify.com
                  </strong>{" "}
                  domain to continue.
                </span>

              </label>


              <button
                className={
                  styles.button
                }
                type="submit"
              >
                Continue to Shopify
              </button>

            </div>


            <p
              className={
                styles.formTrust
              }
            >
              No credit card required.
              Setup usually takes under
              2 minutes.
            </p>

          </Form>
        )}


        <ul className={styles.list}>

          <li>
            <strong>
              Location-aware social proof
            </strong>
            . Show shoppers recent nearby
            activity when suitable activity
            is available.
          </li>


          <li>
            <strong>
              Truthful messaging
            </strong>
            . NearbyPulse uses real recorded
            activity and merchant-created
            announcements instead of
            manufacturing fake social proof.
          </li>


          <li>
            <strong>
              NearbyPulse Intelligence
            </strong>
            . Understand product activity,
            widget displays, customer funnel
            signals and opportunities from
            your dashboard.
          </li>

        </ul>


        <section
          className={
            styles.trustSection
          }
          aria-label="Trust and compliance highlights"
        >

          <h2
            className={
              styles.trustHeading
            }
          >
            Why merchants use NearbyPulse
          </h2>


          <div
            className={
              styles.trustGrid
            }
          >

            <article
              className={
                styles.trustCard
              }
            >

              <h3>
                Transparent messaging
              </h3>

              <p>
                NearbyPulse prioritizes genuine
                storefront activity and
                merchant-owned announcements.
              </p>

            </article>


            <article
              className={
                styles.trustCard
              }
            >

              <h3>
                Privacy-conscious design
              </h3>

              <p>
                NearbyPulse uses coarse location
                context and anonymous session
                identifiers without exposing
                individual customer identities.
              </p>

            </article>


            <article
              className={
                styles.trustCard
              }
            >

              <h3>
                Useful merchant insights
              </h3>

              <p>
                See where NearbyPulse appears,
                how shoppers move through the
                customer funnel, and which
                products may deserve attention.
              </p>

            </article>

          </div>


          <nav
            className={
              styles.trustLinks
            }
            aria-label="Policy and support links"
          >

            <a href="/privacy">
              Privacy Policy
            </a>

            <a href="/terms">
              Terms of Service
            </a>

            <a href="/support">
              Support
            </a>

          </nav>

        </section>


        <p
          className={
            styles.footnote
          }
        >
          By logging in, you agree to the
          NearbyPulse terms and privacy policy.
        </p>

      </div>

    </div>
  );
}
