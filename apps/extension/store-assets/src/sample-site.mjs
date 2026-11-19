const STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #ffffff; color: #1f2328; font: 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
  header { display: flex; align-items: center; gap: 32px; padding: 0 40px; height: 56px; border-bottom: 1px solid #e5e7eb; }
  header strong { font-size: 17px; }
  header nav { display: flex; gap: 24px; color: #57606a; font-size: 14px; }
  main { max-width: 700px; padding: 32px 40px 80px; }
  .crumb { margin: 0 0 8px; color: #57606a; font-size: 14px; }
  h1 { margin: 0 0 12px; font-size: 32px; line-height: 1.2; letter-spacing: -0.02em; }
  h2 { margin: 32px 0 8px; font-size: 20px; line-height: 1.3; }
  p { margin: 0 0 12px; }
  .lede { color: #3d444d; font-size: 18px; }
  ul { margin: 0 0 12px; padding-left: 22px; }
  li { margin: 4px 0; }
  form { display: grid; gap: 16px; max-width: 460px; }
  label { display: grid; gap: 6px; font-size: 14px; font-weight: 600; }
  input, select, textarea { font: inherit; padding: 9px 12px; border: 1px solid #d0d7de; border-radius: 8px; background: #ffffff; color: #1f2328; }
  button { justify-self: start; font: inherit; font-weight: 600; padding: 10px 18px; border: 0; border-radius: 8px; background: #1f2328; color: #ffffff; }
`;

const NAV = `<header><strong>Employee handbook</strong><nav><span>Policies</span><span>Benefits</span><span>IT help</span><span>People</span></nav></header>`;

function document(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${STYLE}</style></head><body>${NAV}<main>${body}</main></body></html>`;
}

const TRAVEL_EXPENSES = document(
  'Travel and expense policy',
  `<p class="crumb">Policies / Finance</p>
<h1>Travel and expense policy</h1>
<p class="lede">This policy explains which business travel costs are reimbursed and how to claim them.</p>
<h2 id="booking">Booking travel</h2>
<p>Book flights and hotels through the travel portal at least 14 days before you leave.</p>
<ul>
  <li>Fly economy on flights shorter than 6 hours. Premium economy is allowed on longer flights.</li>
  <li>Hotels are reimbursed up to $220 a night in major cities and $160 elsewhere.</li>
  <li>If you need something outside these rules, ask your manager before you book.</li>
</ul>
<h2 id="meals">Meals while travelling</h2>
<p>You can claim up to $70 a day for meals while you travel. Alcohol is not reimbursed.</p>
<h2 id="claims">Claiming expenses</h2>
<p>Submit your claim within 30 days of returning, with an itemised receipt for any expense over $25.</p>
<ul>
  <li>Claims under $500 are approved by your manager within 5 business days.</li>
  <li>Larger claims also need approval from the finance team.</li>
</ul>`,
);

const EXPENSE_CLAIM = document(
  'New expense claim',
  `<p class="crumb">Finance / Expenses</p>
<h1>New expense claim</h1>
<p class="lede">Add the details of your trip and attach your receipts.</p>
<form onsubmit="return false">
  <label>Trip name<input value="Customer visit, March" /></label>
  <label>Category<select><option>Travel</option><option>Meals</option><option>Lodging</option></select></label>
  <label>Amount<input value="$184.50" /></label>
  <label>Notes<textarea rows="3">Return train fare and one hotel night.</textarea></label>
  <button type="submit">Submit claim</button>
</form>`,
);

export const SAMPLE_SITE_PATHS = Object.freeze({
  policy: '/travel-expenses',
  claim: '/expense-claim',
});

export function renderSamplePage(pathname) {
  if (pathname === SAMPLE_SITE_PATHS.policy) return TRAVEL_EXPENSES;
  if (pathname === SAMPLE_SITE_PATHS.claim) return EXPENSE_CLAIM;
  return null;
}
