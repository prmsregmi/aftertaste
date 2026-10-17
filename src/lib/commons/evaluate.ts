import type { Submission } from "./contracts";

export type Status = "published" | "pending_review" | "rejected" | "needs_consent";

export type Evaluation = {
  status: Status;
  reasonCodes: string[];
  messages: string[];
  redacted: Submission;
};

const SEVERITY: Record<Status, number> = {
  published: 0,
  pending_review: 1,
  needs_consent: 2,
  rejected: 3,
};

type Pattern = { code: string; status: Status; label: string; re: RegExp };

const PRIVACY_PATTERNS: Pattern[] = [
  {
    code: "contains_secret",
    status: "rejected",
    label: "SECRET",
    re: /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})|\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*\S{6,}/gi,
  },
  {
    code: "contains_personal_data",
    status: "rejected",
    label: "EMAIL",
    re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  {
    code: "contains_personal_data",
    status: "rejected",
    label: "PHONE",
    re: /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
  },
  {
    code: "contains_transaction_id",
    status: "rejected",
    label: "ORDER_ID",
    re: /\b(?:order|invoice|tracking|confirmation)\s*(?:#|no\.?|number|id)?\s*[:#]?\s*(?=[A-Z-]*\d)[A-Z0-9][A-Z0-9-]{5,}\b/gi,
  },
  {
    code: "possible_private_address",
    status: "pending_review",
    label: "ADDRESS",
    re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place)\b\.?/g,
  },
];

const PROMO_PHRASES =
  /\b(?:buy (?:now|here|at|it)|discount code|promo code|use (?:my )?code|limited time|click (?:here|this|the link)|five stars|5 stars|best \w+ ever|order (?:now|today)|affiliate|don'?t miss|act now)\b/gi;
const TRACKING_LINK =
  /https?:\/\/\S*(?:[?&](?:ref|aff|affiliate|tag|coupon|promo|discount|utm_[a-z]+)=|amzn\.to|bit\.ly|tinyurl\.com)\S*/gi;
const UNIVERSAL_CLAIM =
  /\b(?:every|all|always|never|nobody|everyone)\b[^.!?]{0,60}\b(?:defective|broken|scam|perfect|best|worst|fake|amazing|terrible)\b/i;

function mapStrings<T>(value: T, fn: (text: string) => string): T {
  if (typeof value === "string") return fn(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)])) as T;
  }
  return value;
}

const mapKeys = (r: Record<string, string> | undefined, fn: (text: string) => string) =>
  r && Object.fromEntries(Object.entries(r).map(([k, v]) => [fn(k), v]));

// Walks every string value, plus the keys of the free-form maps, so redaction and spam checks
// cannot be bypassed through a field that was added to the schema later.
function mapText(s: Submission, fn: (text: string) => string): Submission {
  const mapped = mapStrings(s, fn);
  return { ...mapped, context: mapKeys(mapped.context, fn), preferences: mapKeys(mapped.preferences, fn) };
}

export function allText(s: Submission): string {
  const parts: string[] = [];
  mapText(s, (t) => {
    parts.push(t);
    return t;
  });
  return parts.join("\n");
}

export function evaluateSubmission(input: Submission): Evaluation {
  const reasons = new Map<string, Status>();
  const messages: string[] = [];
  const flag = (code: string, status: Status, message: string) => {
    if (!reasons.has(code)) messages.push(message);
    reasons.set(code, status);
  };

  // Privacy: redact before anything is stored, and refuse to publish what was found.
  const redacted = mapText(input, (text) =>
    PRIVACY_PATTERNS.reduce(
      (acc, p) =>
        acc.replace(p.re, () => {
          flag(p.code, p.status, `Removed ${p.label.toLowerCase().replace("_", " ")}; resubmit without it.`);
          return `[REDACTED_${p.label}]`;
        }),
      text,
    ),
  );

  // Provenance: only firsthand human reports and real agent runs are original experience.
  if (input.source_type === "official_source_reference" || input.source_type === "secondhand_summary") {
    flag(
      "not_original_experience",
      "rejected",
      "The Commons only accepts firsthand human reports or real agent experiments, not summaries of other sources.",
    );
  }

  // Consent: human-supplied information needs approval of the final text.
  if (input.source_type === "human_firsthand") {
    const approved =
      input.permission.basis === "standing_user_permission" ||
      (input.permission.basis === "explicit_user_approval" && input.permission.user_reviewed_final_text);
    if (!approved) {
      flag(
        "missing_user_approval",
        "needs_consent",
        "Show the user the final distilled claim and get approval, or use standing permission the user already gave.",
      );
    }
  } else if (input.permission.basis === "none") {
    flag(
      "missing_sharing_basis",
      "needs_consent",
      "Agent experiments need explicit user approval or an organization sharing policy.",
    );
  }

  // Spam and manipulation.
  const text = allText(input);
  let spam = 0;
  spam += 2 * (text.match(PROMO_PHRASES)?.length ?? 0);
  spam += 3 * (text.match(TRACKING_LINK)?.length ?? 0);
  if ((text.match(/!/g)?.length ?? 0) >= 3) spam += 1;
  if ((text.match(/\b[A-Z]{4,}\b/g)?.length ?? 0) >= 3) spam += 1;
  if (UNIVERSAL_CLAIM.test(text) && (input.sample_size ?? 1) <= 1) {
    spam += 2;
    flag(
      "overgeneralized_claim",
      "pending_review",
      "A single experience cannot support a claim about every unit or every user; scope it to what was observed.",
    );
  }
  if (spam >= 3) {
    flag("promotional_spam", "rejected", "Submission reads as promotion or manipulation rather than an observation.");
  }

  // Specificity: an experience needs conditions that let others judge whether it applies to them.
  const hasContext =
    Boolean(input.variant || input.subject.location || input.observed_on || input.use_case) ||
    Object.keys(input.context ?? {}).length > 0;
  if (!hasContext) {
    flag(
      "insufficient_context",
      "pending_review",
      "Add the variant, date, location, environment or use case the experience applies to.",
    );
  }
  if (input.source_type === "agent_experiment" && (!input.method || !(input.variant || input.context))) {
    flag(
      "insufficient_experiment_detail",
      "pending_review",
      "Agent experiments need the method plus tested versions or environment.",
    );
  }

  if (input.derived_from?.length) {
    messages.push("Recorded lineage; this record will not count as independent corroboration of its sources.");
  }

  const status = [...reasons.values()].reduce<Status>(
    (worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst),
    "published",
  );
  return { status, reasonCodes: [...reasons.keys()], messages, redacted };
}
