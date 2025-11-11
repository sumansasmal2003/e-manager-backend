const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the AI client
const genAI = new GoogleGenerativeAI('AIzaSyDxz4v-T1_GCUxgxYMSSKDm1nkKzIGJdNU');

/**
 * Generates a professional report using Gemini AI.
 * @param {string} leaderName - The name of the team leader.
 * @param {object} team - The team object (from Team.findById).
 *L @param {string} startDate - The start date (ISO string).
 * @param {string} endDate - The end date (ISO string).
 * @param {object} rawData - The raw data (tasks, meetings, etc.).
 * @returns {string} The AI-generated report text.
 */
exports.generateAIReport = async (leaderName, team, startDate, endDate, rawData) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Format the raw data into a clean text block for the AI
  const dataSummary = `
- Team Name: ${team.teamName}
- Report for Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}
- Tasks Completed: ${rawData.tasksCompleted.length}
- Tasks Created: ${rawData.tasksCreated.length}
- Tasks that Became Overdue: ${rawData.tasksOverdue.length}
- Meetings Held: ${rawData.meetingsHeld.length}
  `;

  // --- This is the "magic" ---
  // We are prompting the AI to act like a project manager
  // and synthesize the data, not just list it.
  const prompt = `
You are an expert project manager. Your task is to write a concise, professional status report for a team leader named "${leaderName}".
The report is for the "${team.teamName}" team.

Use the following raw data to generate a 3-paragraph summary:
1.  Start with a high-level overview.
2.  Detail key accomplishments and new work.
3.  Point out any risks, blockers, or items to watch (like overdue tasks).

Use a confident, professional, and clear tone. Do not just list the data; *synthesize* it into a narrative.

RAW DATA:
${dataSummary}

---
Begin Report:
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error(process.env.GOOGLE_AI_API_KEY)
    console.error('Error generating AI report:', error);
    throw new Error('Failed to generate AI summary.');
  }
};
