import { chatText, openai } from "../../lib/build.js";
import type { Family } from "../../lib/types.js";

const SYSTEM =
  'Extract invoice fields from the text. Reply with JSON only: {"vendor": string, "invoice_number": string, "total": number, "currency": string, "due_date": "YYYY-MM-DD"}.';

const INVOICE = `INVOICE #A-1043
From: Northwind Supplies Ltd
Date: 2 March 2026
Payment due: 1 April 2026

12 x Printer paper (A4) @ 4.50 = 54.00
3 x Toner cartridge @ 62.00 = 186.00
Subtotal: 240.00
VAT (20%): 48.00
Total due: GBP 288.00`;

export default {
  id: "extraction",
  split: "tune",
  tags: ["structured"],
  request: openai({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: INVOICE },
    ],
  }),
  response: chatText(
    JSON.stringify({ vendor: "Northwind Supplies Ltd", invoice_number: "A-1043", total: 288, currency: "GBP", due_date: "2026-04-01" }),
  ),
  edits: [
    {
      id: "reword-system",
      category: "reword",
      replace: [["Extract invoice fields from the text.", "Pull the invoice fields out of the text."]],
      draft: "replay",
      why: "Same instruction in other words.",
    },
    {
      id: "new-total",
      category: "input-edit",
      replace: [["Total due: GBP 288.00", "Total due: GBP 302.40"]],
      draft: "rerecord",
      why: "The reply's total is 288.",
    },
    {
      id: "line-item-detail",
      category: "input-edit",
      replace: [["Printer paper (A4)", "Printer paper (A4, 80gsm)"]],
      draft: "replay",
      why: "Line-item wording isn't extracted.",
    },
    {
      id: "due-date",
      category: "input-edit",
      replace: [["Payment due: 1 April 2026", "Payment due: 15 April 2026"]],
      draft: "rerecord",
      why: "The reply's due_date is 2026-04-01.",
    },
    {
      id: "subtotal-field",
      category: "added-broken",
      replace: [['"total": number,', '"subtotal": number, "total": number,']],
      draft: "rerecord",
      why: "The reply has no subtotal field.",
    },
    {
      id: "date-format",
      category: "changed-requirement",
      replace: [['"due_date": "YYYY-MM-DD"', '"due_date": "DD/MM/YYYY"']],
      draft: "rerecord",
      why: "The reply's date is in YYYY-MM-DD.",
    },
    {
      id: "address",
      category: "irrelevant-addition",
      replace: [["From: Northwind Supplies Ltd\n", "From: Northwind Supplies Ltd\nAddress: 4 Dock Road, Leeds LS1 4AB\n"]],
      draft: "replay",
      why: "The address isn't one of the extracted fields.",
    },
    {
      id: "pound-sign",
      category: "input-edit",
      replace: [["Total due: GBP 288.00", "Total due: £288.00"]],
      draft: "replay",
      why: "Same amount; GBP is still the right currency code.",
    },
    {
      id: "minor-units",
      category: "changed-requirement",
      replace: [['"total": number', '"total": integer (minor units, e.g. pence)']],
      draft: "rerecord",
      why: "The total should now be 28800.",
    },
    {
      id: "typo",
      category: "cosmetic",
      replace: [["Reply with JSON only:", "Reply in JSON only:"]],
      draft: "replay",
      why: "Wording only.",
    },
    {
      id: "copy-marker",
      category: "input-edit",
      replace: [["INVOICE #A-1043", "INVOICE #A-1043 (copy)"]],
      draft: "replay",
      why: "The invoice number is still A-1043.",
    },
  ],
} satisfies Family;
