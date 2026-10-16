import { anthropic, anthropicText } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const ORDERS = "orders(id, customer_id, total_cents, status, created_at)";
const SYSTEM = `You write PostgreSQL queries. Reply with the query only, no explanation.

Schema:
customers(id, name, country, created_at)
${ORDERS}`;
const ASK = "Top 5 customers by total revenue from paid orders, with their revenue in dollars.";

export default {
  id: "sql",
  split: "test",
  tags: [],
  request: anthropic({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: ASK }],
  }),
  response: anthropicText(`SELECT c.id, c.name, SUM(o.total_cents) / 100.0 AS revenue_dollars
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'paid'
GROUP BY c.id, c.name
ORDER BY revenue_dollars DESC
LIMIT 5;`),
  edits: [
    {
      id: "top-10",
      category: "different-subject",
      replace: [["Top 5", "Top 10"]],
      draft: "rerecord",
      why: "The query has LIMIT 5.",
    },
    {
      id: "reword",
      category: "reword",
      replace: [[ASK, "Which 5 customers have the highest total revenue from paid orders? Include the revenue in dollars."]],
      draft: "replay",
      why: "Same question in other words.",
    },
    {
      id: "extra-table",
      category: "irrelevant-addition",
      replace: [[ORDERS, `${ORDERS}\nproducts(id, name, price_cents)`]],
      draft: "replay",
      why: "The query doesn't need products.",
    },
    {
      id: "column-renamed",
      category: "input-edit",
      replace: [["total_cents, status", "amount_cents, status"]],
      draft: "rerecord",
      why: "The query uses total_cents, which no longer exists.",
    },
    {
      id: "mysql",
      category: "changed-requirement",
      replace: [["You write PostgreSQL queries.", "You write MySQL queries."]],
      draft: "replay",
      why: "The query is standard SQL that runs unchanged on MySQL.",
    },
    {
      id: "with-country",
      category: "added-broken",
      replace: [[ASK, `${ASK} Include each customer's country.`]],
      draft: "rerecord",
      why: "The query doesn't select country.",
    },
    {
      id: "this-year",
      category: "different-subject",
      replace: [["from paid orders", "from paid orders placed in 2026"]],
      draft: "rerecord",
      why: "The query doesn't filter by date.",
    },
    {
      id: "explain",
      category: "changed-requirement",
      replace: [["Reply with the query only, no explanation.", "Reply with the query, then one sentence explaining it."]],
      draft: "rerecord",
      why: "The reply has no explanation.",
    },
    {
      id: "status-values",
      category: "irrelevant-addition",
      replace: [["status, created_at)", "status, created_at)\n-- orders.status is one of 'pending', 'paid', 'refunded'"]],
      draft: "replay",
      why: "Confirms 'paid' is a real status; the query already uses it.",
    },
    {
      id: "in-cents",
      category: "changed-requirement",
      replace: [["revenue in dollars", "revenue in cents"]],
      draft: "rerecord",
      why: "The query divides by 100 to get dollars.",
    },
    {
      id: "lowercase-keywords",
      category: "added-broken",
      replace: [["no explanation.", "no explanation. Use lowercase SQL keywords."]],
      draft: "rerecord",
      why: "The query's keywords are uppercase.",
    },
  ],
} satisfies Family;
