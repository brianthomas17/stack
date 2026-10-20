import { askClaude } from './claude.ts';
import type { Item, ItemFindings, StackFindings } from '../shared/types.ts';

// Research runs through the local Claude Code CLI, so it uses your existing
// Claude login: no API key, and nothing runs that you haven't started.

const str = { type: 'string' } as const;
const strArr = { type: 'array', items: str } as const;
const severity = { type: 'string', enum: ['high', 'medium', 'low'] } as const;
const sources = {
  type: 'array',
  items: { type: 'object', properties: { title: str, url: str }, required: ['title', 'url'] },
} as const;

const itemSchema = {
  type: 'object',
  properties: {
    summary: str,
    verdict: str,
    why: str,
    typicalDose: str,
    doseAssessment: str,
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: str,
          strength: { type: 'string', enum: ['strong', 'moderate', 'weak', 'mixed'] },
          sources,
        },
        required: ['claim', 'strength', 'sources'],
      },
    },
    testing: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['certified', 'brand-tested', 'none', 'unknown'] },
        certifications: strArr,
        notes: str,
        sources,
      },
      required: ['status', 'certifications', 'notes', 'sources'],
    },
    redFlags: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: str, detail: str, severity, url: str },
        required: ['title', 'detail', 'severity'],
      },
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          brand: str,
          product: str,
          url: str,
          pricePerServing: { type: 'number' },
          certifications: strArr,
          reason: str,
        },
        required: ['brand', 'product', 'certifications', 'reason'],
      },
    },
    productDetails: {
      type: 'object',
      properties: {
        brand: str,
        product: str,
        price: { type: 'number' },
        servingsPerContainer: { type: 'number' },
        servingSize: str,
      },
    },
  },
  required: [
    'summary', 'verdict', 'why', 'typicalDose', 'doseAssessment',
    'evidence', 'testing', 'redFlags', 'alternatives', 'productDetails',
  ],
};

const stackSchema = {
  type: 'object',
  properties: {
    summary: str,
    interactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { items: strArr, severity, detail: str, recommendation: str, sources },
        required: ['items', 'severity', 'detail', 'recommendation', 'sources'],
      },
    },
    timingSuggestions: strArr,
    redundancies: strArr,
  },
  required: ['summary', 'interactions', 'timingSuggestions', 'redundancies'],
};

export function describe(item: Item) {
  return [
    `Name: ${item.name}`,
    `Type: ${item.kind}`,
    item.brand && `Brand: ${item.brand}`,
    item.product && `Product: ${item.product}`,
    item.dose && `Dose taken: ${item.dose}`,
    `Servings per day: ${item.servingsPerDay}`,
    `Taken: ${item.timing.join(' and ').toUpperCase() || 'unspecified'}`,
    item.url && `Bought from: ${item.url}`,
    item.price && `Price paid: $${item.price}${item.servingsPerContainer ? ` for ${item.servingsPerContainer} servings` : ''}`,
    item.why && `Why they take it: ${item.why}`,
  ].filter(Boolean).join('\n');
}

const RULES = `Rules:
- Search the web. Do not rely on memory for anything time-sensitive (recalls, certifications, prices, lawsuits, FDA warning letters).
- Every evidence claim needs at least one source URL. Prefer meta-analyses, RCTs, PubMed, Examine.com, NIH ODS.
- Be honest about weak evidence. "Weak" and "mixed" are useful answers.
- Third-party testing: "certified" means an independent seal on this exact product (USP Verified, NSF Certified / NSF Certified for Sport, Informed Choice / Informed Sport, BSCG). "brand-tested" means the brand claims testing or publishes COAs but has no independent seal. Check each certifier's public product directory and Labdoor where possible. ConsumerLab is paywalled; only cite its public pages.
- Red flags: recalls, FDA warning letters, failed independent tests, lawsuits, contamination (heavy metals, label inaccuracy), safety issues at this dose, and Amazon counterfeit risk.
- Amazon product pages often block fetching. If so, find the product on the brand's site or use the listing title in the URL.
- This is informational, not medical advice. Do not tell anyone to stop a prescription; suggest discussing with their doctor.`;

export function itemPrompt(item: Item) {
  return `You are researching one item in someone's daily supplement stack.

${describe(item)}

Start with a one-sentence verdict that says what to do, e.g. "Keep it, but switch to an Informed Choice certified brand" or "Worth taking; this product is a good pick".

Find out:
1. What the evidence says about it (benefits worth having, strength of evidence), and a concise evidence-based "why" they might take it.
2. Typical evidence-backed dose, and whether their dose looks reasonable.
3. Whether THIS brand and product is independently third-party tested or certified.
4. Any red flags with the brand, the product, or the ingredient.
5. Up to 3 alternatives that are independently certified and/or more cost-effective per serving, with real product URLs. Include the current product only if it is still the best choice.
6. Product details for the current product if you can find them (brand, product name, current price, servings per container, serving size, kept short like "1 softgel (24mg)" or "1 scoop (5g)"). Omit anything you can't confirm.
${item.kind !== 'supplement' ? '\nThis is a medication, so skip alternatives and focus on evidence, dose, and safety.\n' : ''}
${RULES}`;
}

export function stackPrompt(items: Item[]) {
  return `You are reviewing someone's whole daily stack for interactions. It includes supplements and possibly prescription or OTC medications.

${items.map((i, n) => `--- Item ${n + 1} ---\n${describe(i)}`).join('\n\n')}

Find:
1. Interactions between any of these items (supplement-supplement and supplement-drug), with severity and what to do about it. Use the item names exactly as given.
2. Timing suggestions (AM vs PM, with food, spacing items that compete for absorption).
3. Redundancies or overlapping items.

${RULES}`;
}

function structured<T>(schema: object, prompt: string) {
  return askClaude(prompt, {
    schema,
    tools: ['WebSearch', 'WebFetch'],
    model: process.env.STACK_RESEARCH_MODEL,
  }).then((r) => r.structured as T);
}

export const researchItem = (item: Item) => structured<ItemFindings>(itemSchema, itemPrompt(item));
export const researchStack = (items: Item[]) => structured<StackFindings>(stackSchema, stackPrompt(items));
