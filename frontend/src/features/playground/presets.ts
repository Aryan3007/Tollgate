import type { CacheResult } from "./schemas/playground";

/** What a test step should produce. The page marks each step ✓ or ✗ against this. */
export interface Expectation {
  cache?: CacheResult;
  /** At least this many personal values masked. */
  minMasked?: number;
}

export interface Step {
  /** `{n}` is replaced by a number unique to each run, so a rerun starts from an empty cache. */
  prompt: string;
  expect: Expectation;
  /** Shown beside the step: why this result is the right one. */
  why: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  steps: Step[];
}

export interface Quick {
  id: string;
  label: string;
  prompt: string;
}

// Wordings below were checked against the real embedding model: rewordings
// score 0.987-0.991 (above the 0.95 threshold), "lost" vs "damaged" scores 0.855.
export const SCENARIOS: Scenario[] = [
  {
    id: "cache-reword",
    title: "Repeat and reword a question",
    description:
      "The same question twice, then reworded, then a different question.",
    steps: [
      {
        prompt: "What is your refund policy for damaged items? (ref {n})",
        expect: { cache: "miss" },
        why: "First time: goes to the provider and is cached.",
      },
      {
        prompt: "What is your refund policy for damaged items? (ref {n})",
        expect: { cache: "hit-exact" },
        why: "Identical request: answered from the cache for free.",
      },
      {
        prompt: "what is your refund policy for damaged items (ref {n})",
        expect: { cache: "hit-semantic" },
        why: "Same meaning, different wording: matched by embedding similarity.",
      },
      {
        prompt:
          "Hi, what is your refund policy for damaged items? (ref {n}) Thanks!",
        expect: { cache: "hit-semantic" },
        why: "Politeness added: still the same question.",
      },
      {
        prompt: "What is your refund policy for lost items? (ref {n})",
        expect: { cache: "miss" },
        why: "A different question must not reuse the answer.",
      },
    ],
  },
  {
    id: "cache-numbers",
    title: "Different amount, different answer",
    description:
      "Two questions that read almost identically but have different answers.",
    steps: [
      {
        prompt: "How much GST is 18% of ₹5000? (ref {n})",
        expect: { cache: "miss" },
        why: "First time.",
      },
      {
        prompt: "How much GST is 18% of ₹50000? (ref {n})",
        expect: { cache: "miss" },
        why: "99.8% similar by meaning, but the number differs: the guard blocks the cache. Reusing ₹900 here would be wrong.",
      },
      {
        prompt: "How much GST is 18% of ₹5000? (ref {n})",
        expect: { cache: "hit-exact" },
        why: "Back to the first question: cached.",
      },
    ],
  },
  {
    id: "cache-negation",
    title: "Include vs exclude",
    description:
      "One word flips the meaning while barely changing the similarity score.",
    steps: [
      {
        prompt: "Does the Pro plan include GST? (ref {n})",
        expect: { cache: "miss" },
        why: "First time.",
      },
      {
        prompt: "Does the Pro plan exclude GST? (ref {n})",
        expect: { cache: "miss" },
        why: "96% similar, opposite meaning: the negation guard blocks the cache.",
      },
    ],
  },
  {
    id: "pii",
    title: "Personal data masking",
    description:
      "The provider only sees placeholders like <PHONE_1>. Your reply shows the original values.",
    steps: [
      {
        prompt:
          "Write a one-sentence confirmation for the customer, quoting their phone number and email exactly: phone 98765 43210, email rahul.sharma@gmail.com.",
        expect: { cache: "skip", minMasked: 2 },
        why: "The provider saw <PHONE_1> and <EMAIL_1>; the reply you see has your real values. Never cached.",
      },
      {
        prompt:
          "Return JSON with keys aadhaar and pan for this customer: Aadhaar 2345 6789 0124, PAN ABCPE1234F.",
        expect: { cache: "skip", minMasked: 2 },
        why: "Aadhaar (checksum-valid) and PAN masked, then restored in the reply.",
      },
      {
        prompt: "Write one sentence confirming the payment, quoting the card number exactly: card 4111 1111 1111 1111.",
        expect: { cache: "skip", minMasked: 1 },
        why: "Card number masked, then restored in the reply.",
      },
    ],
  },
];

export const QUICK_QUERIES: Quick[] = [
  { id: "hello", label: "Say hello", prompt: "Say hello in five words." },
  {
    id: "upi",
    label: "Explain UPI",
    prompt: "Explain how UPI works in 3 short bullet points.",
  },
  {
    id: "tips",
    label: "Support tips",
    prompt: "Give me three tips for writing a good support reply.",
  },
  {
    id: "all-pii",
    label: "All five data types",
    prompt:
      "Summarise this customer in one sentence: Rahul Sharma, rahul.sharma@gmail.com, +91 98765 43210, Aadhaar 2345 6789 0124, PAN ABCPE1234F, card 4111 1111 1111 1111.",
  },
];

export const DEFAULT_SYSTEM_PROMPT =
  "You are a concise support assistant. Answer in at most three sentences.";

/** A short number that differs on every call. */
export function newRunNonce(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}
