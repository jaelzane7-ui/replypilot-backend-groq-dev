// server.js - ReplyPilot backend using Groq

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Groq = require("groq-sdk");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Groq client
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Simple test route to confirm server is running
app.get("/", (req, res) => {
  res.send("ReplyPilot (Groq) backend is running.");
});

// Main API endpoint used by your WordPress tool
app.post("/api/replypilot", async (req, res) => {
  try {
    const {
      marketplace,
      rating,
      productName,
      language,
      reviewText,
      // later we can add: style
    } = req.body;

    // Safety defaults
    const safeMarketplace = marketplace || "Shopee";
    const safeRating = Number(rating) || 5;
    const safeLanguage = language || "english";
    const safeProductName = productName || "the product";
    const safeReview = reviewText || "";

    if (!safeReview.trim()) {
      return res.status(400).json({ error: "Missing reviewText in request." });
    }

    // Language instruction
    let languageInstruction = "";
    if (safeLanguage === "english") {
      languageInstruction = "Reply ONLY in clear, natural English.";
    } else if (safeLanguage === "tagalog") {
      languageInstruction =
        "Reply ONLY in Filipino (Tagalog). Do not mix in English words unless they are common product terms.";
    } else if (safeLanguage === "taglish") {
      languageInstruction =
        "Reply in Taglish (a natural mix of Filipino and English), casual but still respectful.";
    } else {
      languageInstruction = "Reply in clear English.";
    }

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
        "Use a serious, sincere apologetic tone. Take responsibility, show empathy, and clearly invite them to contact support so you can resolve the issue.";
    }

    const systemPrompt = `
You are ReplyPilot, an AI assistant that writes short, helpful, and professional 
responses to customer reviews for online marketplaces like Shopee and Lazada.

${languageInstruction}
${toneInstruction}

Marketplace: ${safeMarketplace}.

Guidelines:
- Keep replies short: usually 2–5 sentences.
- Do NOT mention that you are an AI.
- Do NOT invent order numbers, tracking links, or specific policies.
- If the review is positive, say thank you and reinforce trust.
- If the review is negative or mixed, acknowledge the issue and offer help.
- Sound like a real Filipino online seller or brand representative.
`;

    const userPrompt = `
Customer rating: ${safeRating} stars
Marketplace: ${safeMarketplace}
Product name: ${safeProductName}

Customer review:
"${safeReview}"

Write the best possible reply for this review, following all the rules.
Return ONLY the reply text that the seller will post publicly.
`;

    // Call Groq chat completion
    const completion = await client.chat.completions.create({
      model: "llama3-8b-8192", // Groq model; we can change later if needed
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

    res.json({ reply: aiText });
  } catch (err) {
    console.error("❌ ReplyPilot (Groq) API error:", err);

    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Internal server error";

    res.status(500).json({
      error: "Internal server error",
      details: message,
    });
  }
});

// Start server
const PORT = process.env.PORT || 4000; // dev default 4000
app.listen(PORT, () => {
  console.log(`✅ ReplyPilot (Groq) server running on port ${PORT}`);
});
