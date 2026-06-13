export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { answers } = req.body;

  if (!answers || typeof answers !== "object") {
    return res.status(400).json({ error: "Missing or invalid answers" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "API key not configured" });
  }

  // Build a prompt from quiz answers
  const answerText = Object.entries(answers)
    .map(([q, a]) => `Q: ${q}\nA: ${a}`)
    .join("\n\n");

  const prompt = `You are a Gen Z vibe analyst. Based on these quiz answers, give the person their "vibe check" result.

${answerText}

Respond with a JSON object (no markdown, no backticks) with exactly these fields:
{
  "vibe": "<a short 2-4 word vibe title, e.g. 'Cottagecore Romantic' or 'Dark Academia Nerd'>",
  "emoji": "<1-2 relevant emojis>",
  "description": "<2-3 sentences describing their vibe in Gen Z language, upbeat and fun>",
  "traits": ["<trait 1>", "<trait 2>", "<trait 3>"],
  "aesthetic": "<one word aesthetic label>",
  "energy": "<one of: chaotic, calm, mysterious, bubbly, deep>"
}`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 400,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq error:", errText);
      return res.status(502).json({ error: "Groq API error", detail: errText });
    }

    const data = await groqRes.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Strip any accidental markdown fences
    const clean = raw.replace(/```json|```/g, "").trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      // If Groq didn't return clean JSON, send raw text as fallback
      return res.status(200).json({ raw });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
