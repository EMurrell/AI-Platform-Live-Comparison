# Personal plans phase: Stage 1 research

Executed 2026-07-30 against `docs/personal-plans-phase.md`. Every quote below was
fetched with the same method `scripts/refresh.mjs` uses (plain Node `fetch`, its
Chrome User-Agent, `accept-language: en-CA`, tags stripped, whitespace collapsed,
entity and typography normalization, lowercased) and confirmed present in the
stripped server-rendered HTML. Result of that pass: 20 pages reachable, 15 of 15
watched quotes found, 0 not found.

Cells marked `watched: false` carry no quote. They are note-plus-link cells: the
claim is either an absence (no admin console on a personal plan) or a figure the
page renders with client-side scripts, so a daily grep would either prove nothing
or fail every day.

## Step 0 result (recorded here because it changes what a reviewer should check)

Workflow run [30557952569](https://github.com/EMurrell/AI-Platform-Live-Comparison/actions/runs/30557952569),
`workflow_dispatch` on `main`: **red**, `confirmed: 15`, `quote not found: 1`,
**`unreachable: 0`**. The plan's stop condition is unreachable pages, and there
were none, so Stage 2 proceeded. Two separate defects produced the red run; both
are described in the final report and neither is a Stage 1 or Stage 2 change.

## A. Personal table (4 providers x 4 rows)

Providers: ChatGPT Plus (OpenAI), Claude Pro (Anthropic), Google AI Pro (Google),
Microsoft 365 Personal (Microsoft).

### ChatGPT tier availability in Canada

The plan required checking ChatGPT Go before naming a tier. `help.openai.com`
article 11989085 states "ChatGPT Go is now available in all ChatGPT supported
countries" and "ChatGPT Go is available in all countries ChatGPT is supported
in". So Go is purchasable in Canada, and so is Plus. Naming **ChatGPT Plus** is
correct (it is the tier that lines up with Claude Pro and Google AI Pro); Go is
recorded in the price cell's note so the page does not hide a cheaper option.

### Price

| Provider | display | source_url | quote | watched |
| --- | --- | --- | --- | --- |
| ChatGPT Plus | `$20/month, billed monthly.` | help.openai.com/en/articles/6950777-what-is-chatgpt-plus | `ChatGPT Plus is a subscription plan that provides enhanced access to the ChatGPT web app for $20/month` | yes |
| Claude Pro | `$17/month with an annual subscription ($200 up front), $20 billed monthly.` | claude.com/pricing | `$17 per month with annual subscription discount` | yes |
| Google AI Pro | `CAD $26.99/month` | one.google.com/about/google-ai-plans/ | (none) | **no** |
| Microsoft 365 Personal | `CAD $115.00/year, or CAD $11.50/month` | microsoft.com/en-ca/microsoft-365/buy/compare-all-microsoft-365-products | `Microsoft 365 Personal CAD $11.50/month CAD $115.00/year` | yes |

Notes proposed:

- ChatGPT Plus: the article states no currency. OpenAI says purchases are in US
  dollars with local-currency billing in a limited set of countries, that no
  annual billing is offered for Go, Plus or Pro, and that a lower-cost Go plan is
  sold in every supported country, all at
  `help.openai.com/en/articles/11989085-what-is-chatgpt-go`.
- Claude Pro: currency not stated on the vendor page for Canadian customers
  (same wording the Claude Team price cell already uses).
- Google AI Pro: price is script-rendered, so the daily check cannot watch it;
  read from the Canadian view of the page on 2026-07-30. Monthly billing only.
- Microsoft 365 Personal: Copilot is included in the plan; Family and Premium are
  sold on the same page.

### Data used for training

| Provider | display | source_url | quote | watched |
| --- | --- | --- | --- | --- |
| ChatGPT Plus | `Yes, unless you opt out.` | help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance | `When you use our services for individuals such as ChatGPT and Codex, we may use your content to train our models` | yes |
| Claude Pro | `Only if you turn on model improvement in your privacy settings.` | privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training | `you choose to allow us to use your chats and coding sessions to improve Claude` | yes |
| Google AI Pro | `Yes, unless you turn off Keep Activity.` | support.google.com/gemini/answer/13594961 | `To stop your future chats from being reviewed to improve Google services, turn off your Keep Activity setting` | yes |
| Microsoft 365 Personal | `No.` | support.microsoft.com/en-us/privacy/copilot-in-microsoft-365-apps-for-home-your-data-and-privacy | `Prompts, responses, and your file contents when using Copilot in Microsoft 365 apps aren't used to train foundation models` | yes |

This row is the one where the four vendors genuinely differ, and three of the
four sources are precise about it. Points a reviewer should know:

- **Anthropic's two pages disagree in tone.** The Privacy Center article (dated
  16 March 2026) frames consumer training as something Anthropic does only if
  "you choose to allow" it. The plan-comparison table on `claude.com/pricing`
  labels the model-training row "Opt-out" for Free, Pro and Max, which reads as
  default-on. The Privacy Center is the specific, dated, consumer-scoped
  document, so it is the source; the discrepancy is disclosed in the cell note so
  a reader who clicks through to the pricing page is not surprised.
- **The Microsoft cell is scoped to Copilot inside the Microsoft 365 apps.** The
  standalone Copilot app and copilot.microsoft.com are a different product, and
  its privacy FAQ says conversations are used to "train our generative ai models"
  with an opt-out. The note names that page so the "No." is not read too widely.
  This resolves the plan's known-hard cell: the 404 page it flagged
  (`microsoft.com/en-ca/microsoft-365/copilot/copilot-for-individuals`) is still
  a 404, but `support.microsoft.com/en-us/privacy/copilot-in-microsoft-365-apps-for-home-your-data-and-privacy`
  is a real, server-rendered, consumer-scoped page and it states the claim
  outright.
- Google AI Pro's note records that with Keep Activity off, chats are still held
  72 hours, and chats already seen by human reviewers are kept up to three years.
- ChatGPT Plus's note records the Data Controls path and that the same page says
  business plans are not trained on by default.

### Works with your work email

| Provider | display | source_url | quote | watched |
| --- | --- | --- | --- | --- |
| ChatGPT Plus | `Connecting an Outlook mailbox needs your employer's Microsoft Entra admin to approve the app's permissions.` | help.openai.com/en/articles/12512241-outlook-email-and-calendar-app-for-chatgpt | `the app requires the following scopes to be reviewed and approved by your Microsoft Entra admin` | yes |
| Claude Pro | `Connects to Gmail and drafts, but cannot send. If the mailbox is a Google Workspace account, your employer's admin may have to allow Claude first.` | support.claude.com/en/articles/10166901-use-google-workspace-connectors | `your Google Workspace admin may need to allow Claude as a trusted application` | yes |
| Google AI Pro | `On a work or school Google account, access must be enabled by your employer's Workspace administrator.` | support.google.com/gemini/answer/14620100 | `access must be enabled by your Google Workspace administrator` | yes |
| Microsoft 365 Personal | `Covers a personal Microsoft account, for example an outlook.com address.` | support.microsoft.com/en-us/privacy/copilot-in-microsoft-365-apps-for-home-your-data-and-privacy | `we mean when you're signed in with a Microsoft account. For example, a personal outlook.com email address` | yes |

The plan expected the Google cell to reflect that Google AI Pro cannot serve a
business mailbox. The publishable version of that is narrower than "cannot":
`support.google.com/gemini/answer/14620100` says a work or school account's
Gemini access follows the employer's Workspace licence and must be enabled by
their administrator, which is the same practical answer without asserting an
absence. Everything in the Claude Pro display comes from the one cited page
(the "cannot send" half is the quote already used by the Claude Team email cell).

### Admin control

All four are `watched: false`, note-plus-link, as the plan directed. Each cites
the vendor's own business-plan documentation and states what that page lists,
rather than asserting an absence that no page will ever say out loud.

| Provider | display | source_url |
| --- | --- | --- |
| ChatGPT Plus | `Admin controls for managing users, roles and access are listed as ChatGPT Business features.` | help.openai.com/en/articles/8792828-what-is-chatgpt-business |
| Claude Pro | `Single sign-on, central billing and admin controls for connectors are listed in the Team and Enterprise comparison.` | claude.com/pricing |
| Google AI Pro | `Turning Gemini on or off per service and per group is a Google Workspace administrator setting.` | knowledge.workspace.google.com/admin/generative-ai/workspace-with-gemini/manage-access-to-gemini-features-in-workspace-services |
| Microsoft 365 Personal | `Tenant-wide Copilot settings live in the Microsoft 365 admin center, which serves business subscriptions.` | learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-page |

Shared note wording: documented for business plans; this cell links to that page
rather than quoting a claim about the personal plan, so the daily check does not
watch it.

Each of these four could technically have been made `watched: true` by quoting
the business-plan sentence the display restates. That was rejected: the quote
would watch a fact about a different plan than the one the cell is about, which
would put a green "confirmed" on a claim nobody checked. The plan called for
unwatched here and the plan is right.

## B. Main table: new "Admin control" row (4 cells, all watched)

| Provider | display | source_url | quote |
| --- | --- | --- | --- |
| ChatGPT Business | `Owners and admins manage members and seats. Removing someone revokes access immediately and reassigns their projects and GPTs to an owner.` | help.openai.com/en/articles/8266418-data-retention-when-a-member-is-removed-from-a-workspace | `On removal, a member's projects and GPTs are reassigned to a workspace owner` |
| Claude Team | `Owners and admins manage members and seats. Removing a member frees the seat; their history returns if the same email is re-added.` | support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans | `Removing a member frees up their seat for reassignment` |
| Gemini for Google Workspace | `An admin turns Gemini on or off per Workspace service and per group. It is on by default.` | knowledge.workspace.google.com/admin/generative-ai/workspace-with-gemini/manage-access-to-gemini-features-in-workspace-services | `As an administrator, you can choose to enable or disable Gemini features and the side panel in the following Workspace services` |
| Microsoft 365 Copilot Business | `An AI Administrator configures Copilot for the whole tenant in the Microsoft 365 admin center; a Global Reader can view the settings.` | learn.microsoft.com/en-us/microsoft-365/copilot/microsoft-365-copilot-page | `To view and make changes to the Copilot scenarios in the Microsoft 365 admin center, sign in with the AI Administrator role` |

Notes proposed:

- ChatGPT Business: chats and files in a Business workspace are retained
  indefinitely, and a removed member's conversations are not visible to the
  owner. App and connector admin controls are documented at
  `help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-in-apps-enterprise-edu-and-business`.
- Claude Team: only owners and primary owners reach billing. Connectors must be
  enabled for the organization by an owner before members can use them, per
  `support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities`.
- Gemini: changing the setting needs the Gemini settings administrator privilege.
  When someone leaves, an admin can move their data to another account and delete
  the original, per
  `knowledge.workspace.google.com/admin/users/maintain-data-security-after-an-employee-leaves`.
- Microsoft 365 Copilot Business: the admin center only shows services licensed
  in the tenant, so which Copilot settings appear depends on the licences held.

The plan asked this row to cover four things (ownership, what an admin can see or
shut off, offboarding, who enables connectors). No single vendor page covers all
four, and one cell can carry one source link, so each display states the
strongest quotable fact from its cited page and the note carries the rest with a
named URL. That is the pattern the existing email cells already use.

## Weak sources, ranked

1. **Google AI Pro price** (`one.google.com/about/google-ai-plans/`): no price in
   the server HTML at all, so the figure is unwatched and only a human will catch
   a change. Read in a browser on 2026-07-30 with the page's own region indicator
   showing Canada: Google AI Pro `$26.99 CAD/mo`.
2. **Microsoft 365 Personal price quote**: `Microsoft 365 Personal CAD $11.50/month
   CAD $115.00/year` is three adjacent DOM nodes rather than a sentence. It
   matches today and watches both figures, but a layout change breaks it. It
   fails loudly (`needs_verify`), which is the correct failure direction.
3. **The four unwatched admin cells**: correct by construction but invisible to
   the daily check forever.
4. **`claude.com/pricing`** now backs four cells (two existing, two new). One page
   change can flip several cells at once.

## Judgment calls made in Stage 1

1. Named ChatGPT **Plus**, not Go, and disclosed Go in the price note. Go is sold
   in Canada, so the plan's "do not list a tier a Canadian buyer cannot purchase"
   check passed for either; Plus is the tier comparable to the other three.
2. Chose the Anthropic Privacy Center over `claude.com/pricing` for Claude Pro
   training, and disclosed the disagreement in the note.
3. Scoped the Microsoft training answer to Copilot in the Microsoft 365 apps, and
   named the standalone Copilot app's different policy in the note.
4. Softened "Google AI Pro cannot connect to a business mailbox" to what the
   vendor page actually says about work-account access being admin-enabled.
5. Left the Google AI Pro price and all four consumer admin cells unwatched
   rather than attaching a quote that would watch the wrong thing.
6. Did not touch any existing cell. The `gemini-workspace/price` quote is
   geo-fragile (see the final report) but fixing it is remediation-plan work that
   is already merged and out of scope here.
