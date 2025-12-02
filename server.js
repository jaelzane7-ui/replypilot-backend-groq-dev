// server.js - ReplyPilot backend using Groq with multilingual + auto-language support

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Groq = require("groq-sdk");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ------------------------------
// Language helper
// ------------------------------

function normalizeLanguage(lang) {
  if (!lang) return "english";
  return String(lang).toLowerCase().trim();
}

// Map of supported languages and their strict rules.
// Easy to extend later (vietnamese, thai, etc).
function getLanguageBlock(preferredLanguage) {
  switch (preferredLanguage) {
    case "english":
      return {
        label: "English",
        rules: `
LANGUAGE RULES (STRICT)
- You MUST reply in 100% English.
- Do NOT use Filipino or Taglish.
- Do NOT mix languages.
Tone: professional, warm, brand-representative.
        `,
      };

    case "tagalog":
      return {
        label: "Filipino (Tagalog)",
        rules: `
LANGUAGE RULES (STRICT)
- You MUST reply fully in Filipino (Tagalog).
- Avoid English words, except unavoidable product terms (e.g. "charger", "order").
Tone: warm, friendly, conversational.
        `,
      };

    case "taglish":
      return {
        label: "Taglish (Filipino + English)",
        rules: `
LANGUAGE RULES (STRICT)
- Use a natural mix of Filipino and English.
- Filipino should be the base language.
- English is allowed for simple, casual expressions or product terms.
Tone: friendly, conversational, like a real online seller.
        `,
      };

    case "auto":
      return {
        label: "Auto-detect",
        rules: `
LANGUAGE RULES (STRICT)
- First, detect the main language of the customer's review.
- Then reply in that SAME language.
- If the review mixes languages, choose the dominant one.
- Keep the tone natural and appropriate for that language.
        `,
      };

    // Some extra languages for future UI options:
    case "vietnamese":
      return {
        label: "Vietnamese",
        rules: `
LANGUAGE RULES (STRICT)
- Reply fully in Vietnamese.
- Do NOT switch to other languages.
        `,
      };

    case "indonesian":
      return {
        label: "Indonesian",
        rules: `
LANGUAGE RULES (STRICT)
- Reply fully in Indonesian (Bahasa Indonesia).
- Do NOT switch to other languages.
        `,
      };

    case "thai":
      return {
        label: "Thai",
        rules: `
LANGUAGE RULES (STRICT)
- Reply fully in Thai.
- Do NOT switch to other languages.
        `,
      };

    default:
      // Safe fallback
      return {
        label: "English (default)",
        rules: `
LANGUAGE RULES (STRICT)
- Reply in clear, natural English.
        `,
      };
  }
}

// ------------------------------
// Simple test route
// ------------------------------

app.get("/", (req, res) => {
  res.send("ReplyPilot (Groq) backend is running.");
});

// ------------------------------
// Main API endpoint
// ------------------------------

app.post("/api/replypilot", async (req, res) => {
  try {
    const {
      marketplace,
      rating,
      productName,
      language, // "english" | "tagalog" | "taglish" | "auto" | etc.
      reviewText,
    } = req.body;

    // Safety defaults
    const safeMarketplace = marketplace || "Shopee";
    const safeRating = Number(rating) || 5;
    const safeLanguage = normalizeLanguage(language || "english");
    const safeProductName = productName || "the product";
    const safeReview = reviewText || "";

    if (!safeReview.trim()) {
      return res.status(400).json({ error: "Missing reviewText in request." });
    }

    const languageBlock = getLanguageBlock(safeLanguage);

    // Tone based on rating
    let toneInstruction = "";
    if (safeRating >= 5) {
      toneInstruction =
        "Sound very thankful, warm, and appreciative. Reinforce trust and invite them back.";
    } else if (safeRating === 4) {
      toneInstruction =
        "Be positive and appreciative. Thank them and encourage them to order again.";
    } else if (safeRating === 3) {
      toneInstruction =
        "Use a gently apologetic but hopeful tone. Acknowledge any issues and show willingness to improve.";
    } else if (safeRating === 2) {
      toneInstruction =
        "Use a clear apologetic tone. Acknowledge the problem, express regret, and invite them to contact support so you can fix it.";
    } else if (safeRating <= 1) {
      toneInstruction =
        "Use a serious, sincere apologetic tone. Take responsibility where appropriate, show empathy, and clearly invite them to contact support so you can resolve the issue.";
    }

    // -------- System prompt (FULL) --------
    const systemPrompt = `
You are ReplyPilot, an AI assistant that writes short, helpful, and professional 
responses to customer reviews for online marketplaces like Shopee and Lazada.

TARGET LANGUAGE:
- Selected mode: ${languageBlock.label}
${languageBlock.rules}

TONE SETTINGS (BASED ON RATING):
${toneInstruction}

MARKETPLACE CONTEXT:
- Marketplace: ${safeMarketplace}.
- Product name: ${safeProductName}.

GLOBAL GUIDELINES:
- Keep replies short: usually 2–5 sentences.
- Do NOT mention that you are an AI or language model.
- Do NOT invent order numbers, tracking links, discounts, or store policies.
- Do NOT promise things the seller did not explicitly say in the review.
- Never ask the customer to change their review score.
- If the review is positive, thank them and reinforce trust.
- If the review is negative or mixed, acknowledge the issue, apologize when needed, and invite them to contact support or chat for help.
- Sound like a real Filipino online seller or brand representative, not a robot.
- The final output must be ready to copy-paste as a public reply to the review.
    `.trim();

    const userPrompt = `
Customer rating: ${safeRating} stars
Marketplace: ${safeMarketplace}
Product name: ${safeProductName}
Selected language mode: ${languageBlock.label}

Customer review:
"${safeReview}"

Task:
Write the best possible reply for this review, following ALL language rules and tone instructions
from the system message above.

Return ONLY the reply text that the seller will post publicly.
Do NOT include explanations or labels.
    `.trim();

    // Groq chat completion
    const completion = await client.chat.completions.create({
      // Use a current Groq model; you can change this in the future if needed.
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 256,
    });

    const aiText =
      completion?.choices?.[0]?.message?.content?.trim() ||
      "Thank you for your review!";

    return res.json({ reply: aiText });
  } catch (err) {
    console.error("❌ ReplyPilot (Groq) API error:", err?.response?.data || err);

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Internal server error";

    return res.status(500).json({
      error: "Internal server error",
      details: message,
    });
  }
});

// ------------------------------
// Start server
// ------------------------------

const PORT = process.env.PORT || 4000; // 4000 for local dev, Render will override with its own PORT
app.listen(PORT, () => {
  console.log(`✅ ReplyPilot (Groq) server running on port ${PORT}`);
});
