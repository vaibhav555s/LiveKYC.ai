/**
 * ─── Negotiation Agent (Tier 8) ─────────────────────────
 *
 * Policy Engine  : Calculates max eligible loan amount using FOIR,
 *                  credit score, and fraud risk score.
 * Negotiation LLM: Groq-powered agent that handles objections,
 *                  counter-offers within policy limits, and detects
 *                  verbal acceptance — all over voice.
 *
 * Flow:
 *   Bureau data → calculatePolicyOffer() → initial offer
 *   User speaks → processNegotiation() → COUNTER / ACCEPT / DECLINE
 *   ACCEPT → triggerConsent() in orchestrator
 */

import { log } from '../utils/logger.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

/* ─── EMI Helper ─────────────────────────────────────── */
export function calcEMI(principal, annualRate, months) {
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principal / months);
  return Math.round(principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1));
}

/* ─── Interest Rate by Credit Score ─────────────────── */
function getInterestRate(creditScore) {
  if (creditScore >= 800) return 9.0;
  if (creditScore >= 750) return 9.5;
  if (creditScore >= 700) return 10.5;
  if (creditScore >= 650) return 12.5;
  return 15.0;
}

/* ─── Policy Engine ──────────────────────────────────── */
/**
 * Calculate the personalised loan offer based on bureau + risk data.
 * Uses FOIR (Fixed Obligation to Income Ratio) to cap the EMI at 45% of income.
 *
 * @param {{ income: number, creditScore: number, fraudScore?: number, requestedAmount?: number }} params
 * @returns {{ maxAmount, minAmount, initialAmount, interestRate, maxEMI, policyNote }}
 */
export function calculatePolicyOffer({ income, creditScore, fraudScore = 0, requestedAmount = null, purpose = null, employment = null, age = null }) {
  const FOIR = 0.45; // 45% of monthly income can go to EMI (RBI guideline)

  // Purpose-aware interest rate adjustments
  let baseRate = getInterestRate(creditScore);
  let purposeTitlePrefix = 'Standard';
  let alt2Title = 'Max Liquidity';
  let alt3Title = 'Light EMI';
  
  if (purpose) {
    const p = purpose.toLowerCase();
    if (p.includes('education')) {
      baseRate -= 0.5;
      purposeTitlePrefix = 'Education';
      alt2Title = 'Full Course Fee';
      alt3Title = 'Semester Saver';
    } else if (p.includes('home') || p.includes('housing')) {
      baseRate -= 1.0;
      purposeTitlePrefix = 'Home';
      alt2Title = 'Dream Home';
      alt3Title = 'Low EMI Home';
    } else if (p.includes('business')) {
      baseRate += 0.5;
      purposeTitlePrefix = 'Growth';
      alt2Title = 'Max Capital';
      alt3Title = 'Cash Flow Saver';
    }
  }

  // Employment-aware risk tuning
  let employmentMaxTenure = 84;
  if (employment && employment.toLowerCase().includes('self')) {
    baseRate += 0.25;
    employmentMaxTenure = 60;
  }

  const interestRate = Math.max(7.0, baseRate); // floor at 7%
  const maxMonthlyEMI = income * FOIR;

  // Age-aware tenure capping
  let ageMaxTenure = 84;
  if (age) {
    if (age < 25) ageMaxTenure = 60;
    else if (age > 55) ageMaxTenure = 48;
  }

  const absoluteMaxTenure = Math.min(employmentMaxTenure, ageMaxTenure);

  // Purpose-aware loan ceiling (higher for secured / priority-sector categories)
  let loanCeiling = 500000; // ₹5L default for personal
  if (purpose) {
    const p = purpose.toLowerCase();
    if (p.includes('education'))                       loanCeiling = 2000000; // ₹20L
    else if (p.includes('home') || p.includes('housing')) loanCeiling = 2000000; // ₹20L
    else if (p.includes('business'))                   loanCeiling = 1000000; // ₹10L
  }

  // Back-calculate max loan principal using the LONGEST available tenure (maximises eligibility)
  const r = interestRate / 12 / 100;
  const calcTenure = absoluteMaxTenure; // use full tenure for eligibility calc
  const rawMaxLoan = r > 0
    ? maxMonthlyEMI * (Math.pow(1 + r, calcTenure) - 1) / (r * Math.pow(1 + r, calcTenure))
    : maxMonthlyEMI * calcTenure;

  // Fraud risk penalty
  const fraudMultiplier = fraudScore > 70 ? 0.5 : fraudScore > 40 ? 0.75 : 1.0;

  // Round down to nearest ₹10,000 and apply purpose-aware ceiling
  const maxAmount = Math.min(
    Math.floor((rawMaxLoan * fraudMultiplier) / 10000) * 10000,
    loanCeiling
  );

  // ─── Anchor all 3 options around the user's requested amount ───
  // If user asked for a specific amount, all variants orbit around it.
  // If no request, fall back to maxAmount-based logic.
  const anchorAmount = (requestedAmount && requestedAmount >= 50000)
    ? Math.min(Math.floor(requestedAmount / 10000) * 10000, maxAmount)
    : Math.floor((maxAmount * 0.8) / 10000) * 10000;

  const stdTenure = Math.min(36, absoluteMaxTenure);

  // Option 1: Recommended — requested amount, standard tenure
  const opt1Amount = anchorAmount;
  const opt1Tenure = stdTenure;

  // Option 2: Flexibility — same amount, longer tenure → lower EMI
  const opt2Tenure = Math.min(opt1Tenure + 24, absoluteMaxTenure); // +24 months or capped
  const opt2Amount = anchorAmount; // same amount, just stretched over more months

  // Option 3: Budget — reduced amount (~70%), longest tenure → lowest EMI
  const opt3Amount = Math.max(50000, Math.floor((anchorAmount * 0.7) / 10000) * 10000);
  const opt3Tenure = absoluteMaxTenure;

  const alternatives = [
    {
      id: 'opt1',
      title: `${purposeTitlePrefix} Plan`,
      icon: 'star',
      amount: opt1Amount,
      tenure: opt1Tenure,
      interestRate
    },
    {
      id: 'opt2',
      title: alt2Title,
      icon: 'zap',
      amount: opt2Amount,
      tenure: opt2Tenure,
      interestRate
    },
    {
      id: 'opt3',
      title: alt3Title,
      icon: 'shield',
      amount: opt3Amount,
      tenure: opt3Tenure,
      interestRate
    }
  ];

  let policyNote;
  if (fraudMultiplier < 1) {
    policyNote = `Adjusted for elevated risk profile (fraud score: ${fraudScore})`;
  } else if (requestedAmount && requestedAmount > maxAmount) {
    policyNote = `Requested ₹${requestedAmount.toLocaleString('en-IN')} exceeds FOIR-eligible max of ₹${maxAmount.toLocaleString('en-IN')} — capped at policy limit`;
  } else {
    policyNote = `FOIR cap at 45% of stated income ₹${income.toLocaleString('en-IN')}/mo`;
  }

  log('NEGOTIATION', 'INFO', '📋 Policy offer calculated', {
    income, creditScore, fraudScore, requestedAmount, purpose, employment, age,
    maxAmount, interestRate,
  });

  return {
    maxAmount,
    minAmount: 50000,
    initialAmount: anchorAmount,
    interestRate,
    maxEMI: Math.round(maxMonthlyEMI),
    policyNote,
    alternatives
  };
}

/* ─── Parse AI Action Tag ────────────────────────────── */
/**
 * Extract the structured action from the LLM response.
 * The LLM appends a machine-readable tag like: [ACTION:COUNTER,AMOUNT:320000,TENURE:36,RATE:11.5]
 */
function parseAction(rawText) {
  const match = rawText.match(/\[ACTION:(\w+)(?:,AMOUNT:(\d+))?(?:,TENURE:(\d+))?(?:,RATE:([0-9.]+))?\]/);
  if (match) {
    return {
      action: match[1],                            // COUNTER | ACCEPT | DECLINE
      amount: match[2] ? parseInt(match[2]) : null,
      tenure: match[3] ? parseInt(match[3]) : null,
      rate: match[4] ? parseFloat(match[4]) : null,
    };
  }
  // Soft fallback: detect acceptance phrases
  const lower = rawText.toLowerCase();
  const acceptSignals = ['confirmed', 'accepted', 'locked in', 'proceeding', 'finalising', 'finalizing', 'lock offer', 'lock terms', 'lock it'];
  if (acceptSignals.some(s => lower.includes(s))) {
    return { action: 'ACCEPT', amount: null, tenure: null, rate: null };
  }
  return { action: 'COUNTER', amount: null, tenure: null, rate: null };
}

/* ─── Main Negotiation LLM Call ──────────────────────── */
/**
 * Process one turn of negotiation via Groq LLM.
 *
 * @param {{
 *   userText: string,
 *   currentOffer: { amount: number, tenure: number, interestRate: number },
 *   policyLimits: { maxAmount: number, minAmount: number, interestRate: number },
 *   negotiationLog: Array,
 * }} params
 * @returns {Promise<{ message: string, action: 'COUNTER'|'ACCEPT'|'DECLINE', newAmount: number|null, newTenure: number|null }>}
 */
export async function processNegotiation({ userText, currentOffer, policyLimits, negotiationLog }) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    log('NEGOTIATION', 'ERROR', 'GROQ_API_KEY missing');
    return null;
  }

  const currentEMI = calcEMI(currentOffer.amount, currentOffer.interestRate, currentOffer.tenure);
  const maxEMI = calcEMI(policyLimits.maxAmount, currentOffer.interestRate, currentOffer.tenure);
  const roundNum = negotiationLog.filter(r => r.type === 'USER').length + 1;

  const historyText = negotiationLog.length > 0
    ? negotiationLog.map(r => `  [${r.type}] Round ${r.round}: ${r.message}`).join('\n')
    : '  (none — this is the first response)';

  const systemPrompt = `You are a voice-based AI Loan Negotiation Officer at LiveKYC.ai. You are in a LIVE VIDEO CALL.

━━━ POLICY LIMITS (HARD — NEVER VIOLATE) ━━━
• Maximum eligible amount: ₹${policyLimits.maxAmount.toLocaleString('en-IN')} (FOIR-based cap)
• Minimum amount: ₹${policyLimits.minAmount.toLocaleString('en-IN')}
• Interest rate: ${policyLimits.interestRate}% p.a. (fixed by credit profile, NOT negotiable)
• Valid tenures: 12, 24, 36, 48, 60, 72, 84 months
• REASONING FOR LIMITS: ${policyLimits.policyNote}

━━━ CURRENT OFFER ON TABLE ━━━
• Amount  : ₹${currentOffer.amount.toLocaleString('en-IN')}
• Tenure  : ${currentOffer.tenure} months
• Rate    : ${currentOffer.interestRate}% p.a.
• EMI     : ₹${currentEMI.toLocaleString('en-IN')} / month

━━━ NEGOTIATION HISTORY ━━━
${historyText}

━━━ CUSTOMER JUST SAID ━━━
"${userText}"

━━━ YOUR TASK ━━━
This is Round ${roundNum}. Respond naturally as if speaking on a call.
Rules:
1. If customer requests ABOVE ₹${policyLimits.maxAmount.toLocaleString('en-IN')}: explain that based on their ${policyLimits.policyNote}, our maximum limit is ₹${policyLimits.maxAmount.toLocaleString('en-IN')}. Be empathetic but firm.
2. If customer requests amount WITHIN limits (or a LOWER amount): accept it happily.
3. If customer wants different tenure (and it's 12/24/36/48/60/72/84): recalculate EMI and confirm.
4. If customer requests a HIGHER interest rate (which favors the bank), ACCEPT IT.
5. If customer requests a LOWER interest rate, firmly explain it is locked to their credit profile and cannot be decreased.
6. If customer says "yes", "okay", "fine", "accepted", "deal", "haan", "theek hai", "I agree", "go ahead", "proceed", or "lock offer terms": ACCEPT.
7. Keep response under 30 words. Speak naturally. No markdown.

REQUIRED: End your response with EXACTLY ONE action tag (no spaces inside):
[ACTION:COUNTER,AMOUNT:250000,TENURE:36,RATE:10.5]   ← to counter with new terms
[ACTION:ACCEPT]                                      ← customer accepted current offer
[ACTION:DECLINE]                                     ← customer declined / dropped`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
        temperature: 0.35,
        max_tokens: 120,
      }),
    });

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    // Strip the action tag from the spoken response
    const spokenMessage = rawText.replace(/\[ACTION:[^\]]+\]/g, '').trim();
    const parsed = parseAction(rawText);

    log('NEGOTIATION', 'INFO', `Round ${roundNum} complete`, {
      userText: userText.slice(0, 60),
      action: parsed.action,
      newAmount: parsed.amount,
      newTenure: parsed.tenure,
      newRate: parsed.rate,
      response: spokenMessage.slice(0, 80),
    });

    return {
      message: spokenMessage,
      action: parsed.action,   // 'COUNTER' | 'ACCEPT' | 'DECLINE'
      newAmount: parsed.amount,
      newTenure: parsed.tenure,
      newRate: parsed.rate,
      round: roundNum,
    };

  } catch (err) {
    log('NEGOTIATION', 'ERROR', 'Groq negotiation call failed', err.message);
    return null;
  }
}

/* ─── Opening Offer Script ───────────────────────────── */
/**
 * Generate the AI's opening verbal presentation of the offer.
 * Called once when OFFER phase starts.
 */
export function buildOpeningOfferScript(offer, policyLimits) {
  const purposeName = policyLimits.alternatives?.[0]?.title.replace(' Plan', '').toLowerCase() || 'standard';
  const rate = offer.interestRate;
  const amt = offer.amount.toLocaleString('en-IN');
  const purposeContext = purposeName === 'standard' ? 'personalised loan' : `${purposeName} loan`;
  
  return `I have generated three ${purposeContext} options tailored for your profile. The recommended plan is for ₹${amt} at ${rate}% interest for ${offer.tenure} months. You can see all options on the screen. Would you like to select one, or negotiate the terms?`;
}
