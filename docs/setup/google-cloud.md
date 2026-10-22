# Setting up Google Cloud for the Google places sheet

The Google places sheet (S20, [ADR 0011](../adr/0011-google-places-only-through-the-places-ui-kit.md)) shows Google's Places UI Kit list with Google's own map beside it. Both run in the browser, so they need a browser key and a Map ID from a Google Cloud project with billing turned on. This guide is for Sah-Nikhil; it takes about 30 minutes and should be done by 23 Oct, before S20 starts on 24 Oct.

Checked against Google's and Vercel's documentation on 2026-10-22. Google renames console menus from time to time; if a label below doesn't match, search the console for the product name.

## What it costs

Nothing at demo scale. Google charges per event, and each product has its own monthly free allowance:

| What happens | Google's billing name | Free each month | After that |
|---|---|---|---|
| The sheet opens and the map loads | Dynamic Maps | 10,000 | $7 per 1,000 |
| A search runs, or a place's details open | Places UI Kit Query | 10,000 | $1 per 1,000 |

A demo month of 500 sheet opens, 500 searches and 500 detail views is about 500 map loads and 1,000 queries, well inside both allowances. Cheaper India prices (70,000 free) exist but need most of the usage to come from India, so don't count on them with judges elsewhere.

Google still requires a billing account with a payment method before it issues a key. The free allowances don't stop usage on their own; the steps below add the limits that do.

## 1. Create the project

1. Open the [Google Cloud console](https://console.cloud.google.com/) and sign in with the Google account you want to own this.
2. In the project picker at the top, click **New project**, name it `Utsavvy`, and create it. Make sure it's the selected project afterwards.

If Google shows a Google Maps Platform **Get started** wizard, you can follow it for billing and APIs, but still do steps 4 to 7 yourself: the wizard doesn't promise a properly restricted key.

## 2. Turn on billing

1. Go to **Billing > Manage billing accounts > Create account**.
2. Choose **Country: India** (it can't be changed later), your personal payments profile, and a Visa or Mastercard credit card or a supported debit card. UPI is documented only for registered Indian organizations, so use a card.
3. Link the billing account to the `Utsavvy` project.

Google may place a small temporary hold on the card to check it. That is not a charge. India billing accounts must also verify identity and address within 30 days: if **Billing > Overview** shows **Verify now**, do it.

**Take the Free Trial if Google offers it, and don't upgrade.** A new billing account usually starts as a Free Trial with $300 of credit for 90 days. While it stays a trial, Google can't charge your card: when the credit or the 90 days run out, the services just stop. That is the strongest guarantee of ₹0, and 90 days covers the hackathon. **Billing > Overview** shows `Free trial account` or `Paid account`. Never click **Activate full account** for this project. If you've used a Google Cloud trial before, you'll get a paid account instead, and the caps in step 6 and the alert in step 7 matter more.

## 3. Turn on the two APIs

Go to **Google Maps Platform > APIs & Services** (or **APIs & Services > Library**) and enable exactly these two:

- **Maps JavaScript API** (loads Google's code and draws the map)
- **Places UI Kit** (the list and details)

**Manage** instead of **Enable** means it's already on. Don't enable **Places API (New)** or anything else; the sheet doesn't need them.

## 4. Create the browser key

1. Go to **Google Maps Platform > Keys & Credentials > Create credentials > API key**. Name it `Utsavvy browser`.
2. Under **Application restrictions**, choose **Websites** and add these entries. Each site needs two lines, one without and one with `/*`:
   - `http://localhost:3000` and `http://localhost:3000/*`
   - The production URL: `https://utsavvy.vercel.app` and `https://utsavvy.vercel.app/*`.
   - S20's preview, when its PR opens: the branch URL from the Vercel deployment page, which looks like `https://utsavvy-git-build-66-google-places-<your-scope>.vercel.app`, both forms. It stays the same for every push to that branch. Remove it after S20 merges.
3. Under **API restrictions**, choose **Restrict key** and tick **Maps JavaScript API**. If the console lists a separate Places UI Kit entry, tick it too. If the S20 spike finds the list won't load with only Maps JavaScript API ticked, add the UI Kit entry then.
4. **Save.**

Two things that look like they'd work but don't:

- **`https://utsavvy-*.vercel.app` isn't allowed.** Google only accepts a wildcard at the start of a hostname, not in the middle.
- **`https://*.vercel.app` works but trusts every Vercel site on the internet,** so anyone could use our key from their own Vercel app. Don't use it.

So other PRs' previews won't load Google places, and the sheet shows "Google places can't load right now." there. That's expected. The browser tests stub Google, so CI doesn't need the key.

A browser key is always visible to anyone who opens the site's code; that's normal for Google Maps. The website and API restrictions, the caps and the trial are what make a copied key useless or harmless.

## 5. Create the Map ID

The map marks each result in the list, and those markers (Google calls them Advanced Markers) need a Map ID.

1. Go to **Google Maps Platform > Map Management > Create map ID**.
2. **Name** `Utsavvy Google places`, **Map type** `JavaScript`, choose **Vector**, and **Save**.
3. Copy the ID. It isn't secret, but it goes in the same places as the key (step 8).

A Map ID costs nothing by itself. A custom map style (**Map Styles > Create style**) is optional: S20 starts with Google's standard light or dark map to match the app's theme, and checks in its spike whether a custom dark style works with this Map ID.

## 6. Cap the daily usage

1. Go to **Google Maps Platform > Quotas** (or **IAM & Admin > Quotas & System Limits**) and look at **Maps JavaScript API** and **Places UI Kit**.
2. If there's a per-day row for map loads, select it, click **Edit**, enter `300`, and submit. Do the same for a per-day row of Places UI Kit queries.

300 a day stays under 10,000 a month for each, so the free allowances can't be exceeded. When a cap is reached, Google refuses requests for the rest of the day instead of charging.

Google's public docs don't confirm that both products have an editable per-day row. If one doesn't, tell the orchestrator; on a Free Trial account it doesn't matter, because the trial can't charge you anyway.

## 7. Set a budget alert

1. Go to **Billing > Budgets & alerts > Create budget**.
2. Scope it to the `Utsavvy` project, set the amount to ₹100, and keep the alert emails at 50%, 90% and 100%.

A budget only sends emails; it doesn't stop anything, and Google's billing data can lag by hours. It's the early warning, not the limit.

## 8. Put the values in Vercel and `.env.local`

1. In the Vercel project, open **Settings > Environment Variables** and add both for **Production**, **Preview** and **Development**:
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: the key from step 4
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`: the ID from step 5
2. **Redeploy** afterwards. Values starting with `NEXT_PUBLIC_` are baked into the site when it's built, so a running deployment won't see a new value.
3. Add the same two lines to `.env.local` in the main checkout. It's gitignored; never commit it, and never paste the key into a chat, an issue or a PR.

## 9. Check it

After S20's spike, open the sheet on the preview, run one search and open one place. Then look at **Google Maps Platform > Metrics** (or **Billing > Reports**, which can lag): you should see one map load and two Places UI Kit queries, all inside the free allowance.

## After the hackathon

If Utsavvy stays up only as a portfolio piece, a Free Trial account simply stops working after 90 days, and the sheet then shows "Google places can't load right now." To keep it running, upgrade knowingly and keep the caps. To shut it off early, delete the key in **Keys & Credentials**.

## Sources

[Maps get started](https://developers.google.com/maps/get-started), [Places UI Kit get started](https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started), [Place Search with a map](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-search), [creating a billing account](https://docs.cloud.google.com/billing/docs/how-to/create-billing-account), [payment methods](https://docs.cloud.google.com/billing/docs/how-to/payment-methods), [UPI requirements](https://docs.cloud.google.com/billing/docs/resources/upi-payment-india), [Free Trial](https://docs.cloud.google.com/free/docs/free-cloud-features), [key security](https://developers.google.com/maps/api-security-best-practices), [website restriction syntax](https://docs.cloud.google.com/docs/authentication/api-keys), [Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls), [Map IDs](https://developers.google.com/maps/documentation/javascript/map-ids/get-map-id), [Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/start), [usage, billing and quotas](https://developers.google.com/maps/documentation/javascript/usage-and-billing), [SKU triggers](https://developers.google.com/maps/billing-and-pricing/sku-details), [global prices](https://developers.google.com/maps/billing-and-pricing/pricing), [India prices](https://developers.google.com/maps/billing-and-pricing/pricing-india), [budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets), [Vercel environment variables](https://vercel.com/docs/environment-variables), [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).
