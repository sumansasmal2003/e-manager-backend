const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the AI client
const genAI = new GoogleGenerativeAI('AIzaSyDxz4v-T1_GCUxgxYMSSKDm1nkKzIGJdNU');

/**
 * Generates a professional, member-wise report using Gemini AI.
 * @param {string} leaderName - The name of the team leader.
 * @param {object} team - The team object.
 * @param {string} startDate - The start date (ISO string).
 * @param {string} endDate - The end date (ISO string).
 * @param {object} rawData - The processed, member-wise data.
 * @returns {string} The AI-generated report text in Markdown format.
 */
exports.generateAIReport = async (leaderName, team, startDate, endDate, rawData) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); // Using 'pro' for a more detailed report

  // --- Convert member-wise data into a detailed text block ---
  let memberDataSummary = '';
  for (const [memberName, data] of Object.entries(rawData.memberActivity)) {
    memberDataSummary += `### ${memberName}\n`; // Member name as a sub-header

    // List completed tasks
    if (data.completedTasks.length > 0) {
      memberDataSummary += `- **Completed Tasks (${data.completedTasks.length}):**\n`;
      memberDataSummary += data.completedTasks.map(title => `  - ${title}`).join('\n');
    } else {
      memberDataSummary += `- **Completed Tasks:** 0\n`;
    }

    // List new tasks
    if (data.newTasks.length > 0) {
      memberDataSummary += `\n- **New Tasks Assigned (${data.newTasks.length}):**\n`;
      memberDataSummary += data.newTasks.map(title => `  - ${title}`).join('\n');
    } else {
      memberDataSummary += `\n- **New Tasks Assigned:** 0\n`;
    }
    memberDataSummary += `\n\n`; // Add space between members
  }

  if (memberDataSummary === '') {
    memberDataSummary = 'No specific member activity was logged in this period.';
  }

  // --- THIS IS THE FIX ---
  // The dataSummary now correctly uses the ...Count variables passed from the controller.
  // The .length error came from trying to read rawData.tasksCompleted.length, which doesn't exist.
  const dataSummary = `
## Team-Wide Statistics:
- Total Tasks Completed: ${rawData.tasksCompletedCount}
- Total New Tasks Created: ${rawData.tasksCreatedCount}
- Total Tasks Now Overdue: ${rawData.tasksOverdueCount}
- Total Meetings Held: ${rawData.meetingsHeldCount}

## Member-Specific Activity:
${memberDataSummary}
  `;

  // --- This is our advanced prompt for a long-form report ---
  const prompt = `
You are a professional Senior Project Manager. Your task is to write a highly detailed, comprehensive status report for a team leader named "${leaderName}".
The report is for the "${team.teamName}" team, for the period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}.
You MUST output your entire response in MARKDOWN format.

The report must be thorough, well-structured, and fill at least a full A4 page, possibly two.

**Report Structure:**

1.  **# Team Status Report: ${team.teamName}**
    (A main title)

2.  **## Executive Summary**
    (Write a 3-4 paragraph high-level summary. Analyze the provided stats: Was productivity high? (tasks completed vs. created). Is the team on track? Mention any risks, like overdue tasks, and highlight the team's overall performance.)

3.  **## Team Performance Analysis**
    (Use the 'Team-Wide Statistics' data. Don't just list the numbers. Create a section with bullet points and *explain* what the numbers mean. For example: "The team demonstrated strong output by completing ${rawData.tasksCompletedCount} tasks, while also taking on ${rawData.tasksCreatedCount} new assignments...")

4.  **## Detailed Member Contributions**
    (This is the most important section. Use the 'Member-Specific Activity' data. For *each* member, create a sub-section. Write a detailed paragraph that:
    - Lists all the specific tasks they completed.
    - Lists all their new assignments.
    - Provides a brief qualitative summary of their work for the period, commenting on their workload and output.
    - **DO NOT** just write one line. Elaborate.)

5.  **## Risks & Forward Look**
    (A concluding section.
    - **Risks:** Explicitly state the number of overdue tasks (${rawData.tasksOverdueCount}). If there are zero, state that.
    - **Forward Look:** Provide a brief concluding paragraph about maintaining momentum or addressing challenges in the next period.)

---
**RAW DATA TO USE:**
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
    console.error('Error generating AI report:', error);
    throw new Error('Failed to generate AI summary.');
  }
};
