const PYTHON_AI_SERVICE_URL = "http://localhost:8005/chat";

export const queryChatbot = async (req, res) => {
  try {
    const { message, userId, role } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    console.log(`Chatbot query from ${userId} (${role}): ${message}`);

    const response = await fetch(PYTHON_AI_SERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: message,
        userId: userId || "anonymous",
        role: role || "guest"
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({
        response: data.answer,
        options: data.options || []
      });
    } else {
      console.error("Python AI service error:", response.status);
      return res.status(502).json({ 
        response: "I'm having trouble connecting to my AI brain. Please try again later.",
        options: [
            { label: "🎟️ My Ticket", value: "my ticket status" },
            { label: "🏢 Departments", value: "list departments" }
        ]
      });
    }
  } catch (error) {
    console.error("Chatbot Controller Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
