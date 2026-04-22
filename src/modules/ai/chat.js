/**
 * ─── Groq Conversational AI Module ───────────────────────
 * Utilizes the Groq fast inference API to generate highly
 * contextual and conversational responses acting as a 
 * professional financial loan officer.
 */

import axios from 'axios';
import { log } from '../utils/logger.js';
import { getPhase, triggerAadhaarUpload } from '../orchestration/sessionOrchestrator.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

/**
 * Generate an LLM response.
 * 
 * @param {Array} transcript - the dialogue history
 * @param {Object} extractedData - Current extracted KYC fields
 * @returns {Promise<string>} Response text from the AI
 */
export async function generateResponse(transcript, extractedData) {
    log('CHAT', 'INFO', 'Calling Groq LLM with state', extractedData);

    const apiKey = import.meta.env.VITE_GROQ_API_KEY || import.meta.env.GROQ_API_KEY;

    if (!apiKey) {
        log('CHAT', 'ERROR', 'GROQ_API_KEY missing. Cannot generate response.');
        return "I am sorry, my connection is currently missing an API key. Please check your config.";
    }

    // Check KYC completeness — trigger Aadhaar upload phase if all basic info is collected
    const currentPhase = getPhase();
    const hasName = !!(extractedData.name?.value);
    const hasIncome = !!(extractedData.income?.value);
    const hasPurpose = !!(extractedData.purpose?.value);
    const hasAmount = !!(extractedData.loanAmount?.value);
    const hasEmployment = !!(extractedData.employment?.value);
    const allBasicInfoDone = hasName && hasIncome && hasPurpose && hasAmount && hasEmployment;

    if (allBasicInfoDone && currentPhase === 'CHAT') {
        // Trigger transition to Aadhaar upload — await so DB application ID is initialized
        await triggerAadhaarUpload();
    }

    // Build a clear picture of what's confirmed vs missing for the LLM
    const confirmed = [];
    const missing = [];
    const fieldMap = {
        name: 'Full Name',
        employment: 'Employment Type',
        income: 'Monthly Income',
        purpose: 'Loan Purpose',
        loanAmount: 'Requested Loan Amount',
    };
    for (const [key, label] of Object.entries(fieldMap)) {
        if (extractedData[key]?.value) {
            confirmed.push(`${label}: ${extractedData[key].value}`);
        } else {
            missing.push(label);
        }
    }

    // Build the system prompt (phase-aware)
    const systemPrompt = `You are a professional, polite, and concise AI Loan Officer at LiveKYC.ai.

Session Phase: ${currentPhase}

ALREADY CONFIRMED (DO NOT ask for these again, they are locked):
${confirmed.length > 0 ? confirmed.map(f => '- ' + f).join('\n') : '- None yet'}

STILL NEEDED:
${missing.length > 0 ? missing.map(f => '- ' + f).join('\n') : '- Nothing, all collected!'}

Rules:
1. NEVER re-ask for anything in the ALREADY CONFIRMED list above.
2. If STILL NEEDED has items: ask for the FIRST missing item only, in one short sentence.
3. If STILL NEEDED is empty (all collected): say exactly this: "Thank you! I have everything I need. Please upload your Aadhaar card on the right to verify your identity."
4. If phase is AADHAAR_UPLOAD, AADHAAR_VERIFY, AADHAAR_DONE, FACE_SCAN, FACE_DONE, or BUREAU: say something brief and encouraging like "Your documents are being verified, please hold on."
5. If phase is OFFER: say "Based on your profile, here is your personalised loan offer on the right. Would you like to accept?"
6. Keep ALL responses under 25 words. No markdown, no emojis, no numbered lists.`;

    // Build the messages array from the transcript
    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    for (const entry of transcript) {
        if (entry.speaker === 'user' || entry.speaker === 'agent') {
            messages.push({
                role: entry.speaker === 'user' ? 'user' : 'assistant',
                content: entry.text
            });
        }
    }

    try {
        const response = await axios.post(GROQ_API_URL, {
            model: MODEL,
            messages: messages,
            temperature: 0.5,
            max_tokens: 60,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        const aiText = response.data.choices[0]?.message?.content || '';
        log('CHAT', 'INFO', `Generated Groq response: "${aiText}"`);
        return aiText.trim();
    } catch (error) {
        log('CHAT', 'ERROR', 'Groq API error:', error.response?.data || error.message);
        return null;
    }
}
