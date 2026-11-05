# Assistant setup

> Purpose: Gemini key, demo limits, turning the assistant off, and what goes to Google. · Read when: building, configuring or troubleshooting the CartCheck Assistant.

**Status: planned, not built yet.** The env vars below do nothing until the feature ships. See the [design spec](superpowers/specs/2026-11-05-cartcheck-assistant-design.md) and [implementation plan](superpowers/plans/2026-11-05-cartcheck-assistant.md).

The assistant runs on the Gemini API free tier. `server/assistantModel.js` will be the only file that talks to Google, and the browser never does.

## 1. Create the API key

1. Create a separate project in [Google AI Studio](https://aistudio.google.com/) for CartCheck.
2. **Leave billing off.** The goal is that hitting a limit returns an error instead of a charge. Confirm this in AI Studio before relying on it, because this guide hasn't verified it.
3. Create an API key in that project.
4. Keep the key out of code, screenshots and chat. If it leaks, delete it and create a new one.

## 2. Find the real limits

Limits apply per project, not per key, so every account shares one quota. The daily quota resets at midnight Pacific.

Google doesn't publish fixed free-tier numbers on its [rate limits page](https://aistudio.google.com/docs/rate-limits). It points to the limits page in AI Studio, which shows your project's active values.

1. Open the limits page in AI Studio and note the requests per day for your chosen model.
2. Set `ASSISTANT_APP_DAILY_LIMIT` below that number, leaving some room for testing.

## 3. Configure the server

Set these in `server/.env` locally, and in the Render dashboard for production. Never use a `VITE_` prefix, because that would put the key in the browser.

| Variable | Required | Value |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | The key from step 1. Without it, the assistant is off. |
| `GEMINI_MODEL` | Yes | The model ID confirmed during the build. Stored here because Google retires models fairly often. |
| `ASSISTANT_DAILY_LIMIT` | No | Messages per account per day. Default `5`. |
| `ASSISTANT_APP_DAILY_LIMIT` | No | Messages per day across all accounts. Default `100`; set it from step 2. |

A limit that isn't a positive integer turns the assistant off.

If `ASSISTANT_DAILY_LIMIT` changes, the demo notice in the popup must change with it, because the copy says 5.

## 4. Check Google's terms

Check these before turning it on for real users:

- **Age rules:** CartCheck's users include students, so check whether Google's terms set a minimum age for users of your app.
- **Regions:** confirm your users' countries on Google's [available regions page](https://ai.google.dev/available_regions). Also confirm the free tier applies to your project in AI Studio.
- **Data use:** Google's [pricing page](https://aistudio.google.com/docs/pricing) says free-tier data may be used to improve its products. That's why the popup tells shoppers not to enter personal information.

## What goes to Google

| Sent | Never sent |
| --- | --- |
| The text of the shopper's message | List names and items |
| The fixed system prompt | Catalog items and prices |
| | Account IDs and email |
| | Earlier messages |

CartCheck's own logs record token counts only, never message text or model replies. The usage tables store counts only.

## Turn it off

Remove `GEMINI_API_KEY` and restart the server. The popup says the assistant isn't available, and the rest of CartCheck keeps working. Saved lists and catalog items aren't affected.

## Troubleshooting

| What you see | Likely cause | What to do |
| --- | --- | --- |
| "You've used today's 5 demo messages" | The account reached its daily limit | Wait for the reset time shown |
| "The demo is full for today" | The app-wide cap was reached | Wait for the reset, or raise `ASSISTANT_APP_DAILY_LIMIT` if it's still below Google's limit |
| "The assistant isn't available" for everyone | Missing key, invalid limit, or Google's quota used up | Check the env vars and the AI Studio limits page |
| "The assistant isn't available" after working before | The model was retired or Google's limits changed | Check server logs and Google's model list, then update `GEMINI_MODEL` |
| "I didn't catch that" often | The model is misreading commands | Re-run the acceptance commands in the design spec |
