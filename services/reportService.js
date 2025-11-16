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

/**
 * Generates a concise, personal daily briefing using Gemini AI.
 * @param {string} username - The user's name for personalization.
 * @param {object} actionItems - The object containing tasks and meetings.
 * @returns {string} The AI-generated briefing text in Markdown format.
 */
exports.generateAIDailyBriefing = async (username, actionItems) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); // Use 'pro' for this task

  // 1. Serialize the data into a simple text format for the AI
  let dataSummary = '--- DATA START ---\n';
  dataSummary += `Today's Date: ${new Date().toLocaleDateString()}\n`;
  dataSummary += `User's Name: ${username}\n\n`;

  // Add Meetings
  if (actionItems.todayMeetings.length > 0) {
    dataSummary += 'Today\'s Meetings:\n';
    actionItems.todayMeetings.forEach(m => {
      dataSummary += `- ${new Date(m.meetingTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}: ${m.title} (Team: ${m.team.teamName})\n`;
    });
  } else {
    dataSummary += 'No meetings scheduled for today.\n';
  }
  dataSummary += '\n';

  // Add Overdue Tasks
  if (actionItems.actionTasks.overdue.length > 0) {
    dataSummary += 'URGENT - Overdue Tasks:\n';
    actionItems.actionTasks.overdue.forEach(t => {
      dataSummary += `- ${t.title} (Assigned to: ${t.assignedTo})\n`;
    });
  } else {
    dataSummary += 'No overdue tasks.\n';
  }
  dataSummary += '\n';

  // Add Tasks Due Today
  if (actionItems.actionTasks.dueToday.length > 0) {
    dataSummary += 'Tasks Due Today:\n';
    actionItems.actionTasks.dueToday.forEach(t => {
      dataSummary += `- ${t.title} (Assigned to: ${t.assignedTo})\n`;
    });
  } else {
    dataSummary += 'No tasks due today.\n';
  }
  dataSummary += '\n';

  // Add Weekly Notes
  if (actionItems.weeklyNotes.length > 0) {
    dataSummary += 'Personal Weekly Goals/Notes:\n';
    actionItems.weeklyNotes.forEach(n => {
      dataSummary += `- ${n.title}\n`;
    });
  }
  dataSummary += '--- DATA END ---\n';

  // 2. Create the prompt
  const prompt = `
You are an expert executive assistant. Your name is "Gemini".
You are writing a daily briefing for a team leader named ${username}.
Your tone should be professional, encouraging, and clear.
You MUST follow this structure:
1.  Start with a friendly, brief greeting.
2.  Check for "Today's Meetings". If there are any, list the most important ones.
3.  Check for "URGENT - Overdue Tasks". If there are any, highlight this section as the top priority.
4.  List the "Tasks Due Today".
5.  If there are "Personal Weekly Goals/Notes", mention one or two as a reminder.
6.  Conclude with a short, motivational closing sentence.

Use markdown for formatting (like **bolding** for urgent items and lists).
Do NOT include the "--- DATA ---" markers in your final response.
Keep the entire briefing concise (around 100-150 words).

Based on the provided data, write the daily briefing.

${dataSummary}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error('Error generating AI briefing:', error);
    throw new Error('Failed to generate AI summary.');
  }
};

/**
 * Generates a professional, AI-powered performance report for a single member.
 * @param {object} profile - The member's profile (name, email, joiningDate)
 * @param {Array} tasks - The member's tasks
 * @param {Array} attendance - The member's attendance records
 * @param {string} startDate - The start date (ISO string)
 * @param {string} endDate - The end date (ISO string)
 * @returns {string} The AI-generated report text in Markdown format.
 */
exports.generateAIMemberReport = async (profile, tasks, attendance, startDate, endDate) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // --- 1. Calculate Statistics ---

  // --- THIS IS THE FIX ---
  // Get the start of today (in the server's timezone)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // --- END OF FIX ---

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Completed');

  // --- THIS LOGIC IS NOW CORRECTED ---
  // "Overdue" now means due *before* the start of today.
  const overdueTasks = tasks.filter(t =>
    t.status !== 'Completed' &&
    t.dueDate && // ensure it has a due date
    new Date(t.dueDate) < today
  );
  // --- END OF CORRECTION ---

  const pendingTasks = tasks.filter(t => t.status === 'Pending' || t.status === 'In Progress');

  const presentDays = attendance.filter(a => a.status === 'Present').length;
  const absentDays = attendance.filter(a => a.status === 'Absent').length;
  const leaveDays = attendance.filter(a => a.status === 'Leave').length;
  const totalAttendanceDays = presentDays + absentDays + leaveDays;
  const attendanceRate = totalAttendanceDays > 0 ? Math.round((presentDays / totalAttendanceDays) * 100) : 100;

  // --- 2. Serialize Data for the AI ---
  // (This section remains unchanged, but the data it receives is now more accurate)
  let dataSummary = `
## Member Profile:
- Name: ${profile.name}
- Email: ${profile.email}
- Report Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}

## Performance Statistics:
- Total Tasks Assigned: ${totalTasks}
- Tasks Completed: ${completedTasks.length}
- Tasks Pending/In Progress: ${pendingTasks.length}
- Tasks Overdue: ${overdueTasks.length}
- Attendance Rate: ${attendanceRate}% (${presentDays} Present, ${absentDays} Absent, ${leaveDays} Leave)

## Detailed Task List:
`;

  if (tasks.length > 0) {
    tasks.forEach(task => {
      dataSummary += `- **${task.title}** (Status: ${task.status}, Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'})\n`;
    });
  } else {
    dataSummary += "No tasks assigned in this period.\n";
  }

  // --- 3. This is our advanced prompt ---
  // (The prompt itself doesn't need to change, as it just reports on the
  // now-corrected `overdueTasks` variable)
  const prompt = `
You are a professional Senior Project Manager. Your task is to write a personalized, detailed performance report FOR a team member named "${profile.name}".
The report is from their team leader and covers their performance from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}.
You MUST output your entire response in simple MARKDOWN format.

**Report Structure:**

1.  **# Performance Report: ${profile.name}**
    (A main title)

2.  **## Executive Summary**
    (Write a 2-3 paragraph high-level summary. Start by addressing the member directly (e.g., "Hello ${profile.name}, here is your report...").
    Analyze their performance based on the stats: Are they completing tasks on time? Is their attendance strong?
    Acknowledge their hard work and highlight both strengths and areas for improvement.)

3.  **## Task Performance Analysis**
    (Use the 'Performance Statistics' data.
    -   Start with a summary paragraph explaining what the task numbers mean (e.g., "You completed ${completedTasks.length} out of ${totalTasks} tasks...").
    -   **Crucially**, mention the **${overdueTasks.length} overdue tasks** and list them if there are any. This is the most important area to follow up on.)

4.  **## Attendance Summary**
    (Analyze the attendance data.
    -   State their attendance rate (${attendanceRate}%) and what that means (e.g., "Your attendance has been excellent...").
    -   Mention the number of absent or leave days and frame it as "We've logged ${absentDays} absent days..." etc.)

5.  **## Concluding Remarks**
    (A brief, encouraging closing paragraph. For example: "Overall, your performance has been solid... Let's focus on addressing the overdue tasks in the next period. Keep up the great work.")

---
**RAW DATA TO USE:**
${dataSummary}
---

Begin Report (output in simple Markdown, starting with the '# Performance Report' title):
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error('Error generating AI member report:', error);
    throw new Error('Failed to generate AI summary.');
  }
};

/**
 * Generates 1-on-1 talking points for a specific member.
 * @param {object} profile - The member's profile
 * @param {Array} tasks - The member's tasks
 * @param {Array} activities - The member's recent activities
 * @returns {string} The AI-generated talking points in a simple string format.
 */
exports.generateAITalkingPoints = async (profile, tasks, activities) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // --- 1. Calculate Statistics & Filter Data ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completedTasks = tasks.filter(t => t.status === 'Completed');
  const overdueTasks = tasks.filter(t =>
    t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < today
  );
  const pendingTasks = tasks.filter(t => t.status === 'In Progress' || (t.status === 'Pending' && !overdueTasks.includes(t)));

  // --- 2. Serialize Data for the AI ---
  let dataSummary = `
## Member: ${profile.name}
Today's Date: ${today.toLocaleDateString()}

## Task Summary:
- **Overdue Tasks (${overdueTasks.length}):**
${overdueTasks.length > 0 ? overdueTasks.map(t => `  - ${t.title} (Due: ${new Date(t.dueDate).toLocaleDateString()})`).join('\n') : '  - None. Great job!'}
- **In Progress Tasks (${pendingTasks.length}):**
${pendingTasks.length > 0 ? pendingTasks.map(t => `  - ${t.title}`).join('\n') : '  - None.'}
- **Recently Completed Tasks (${completedTasks.length}):**
${completedTasks.length > 0 ? completedTasks.map(t => `  - ${t.title}`).join('\n') : '  - None.'}

## Recent Activity Log (Last 30 events):
${activities.length > 0 ? activities.map(a => `  - ${a.details} (by ${a.user?.username || 'user'})`).join('\n') : '  - No recent activity mentions.'}
`;

  // --- 3. The Prompt ---
  const prompt = `
You are a senior team leader and an expert manager. You are preparing for a 1-on-1 meeting with your team member, ${profile.name}.
Based *only* on the data provided, generate a short, bulleted list of 3-5 talking points for the meeting.
Your tone should be constructive and supportive.

- **Start with praise:** Find something positive (e.g., completed tasks, no overdue tasks).
- **Then, address blockers:** Gently ask about any "In Progress" tasks to see if they need help.
- **Finally, address concerns:** List any "Overdue Tasks" as the top priority to discuss and resolve.
- If there is no data (e.g., no tasks), generate general check-in points.

**Rules:**
- Be very concise.
- Use simple bullet points (e.g., "- ...").
- Do NOT use markdown headers (like # or ##).
- Address the points *about* the member, not *to* the member (e.g., use "Discuss..." or "Praise..." not "You did...").

---
**DATA TO USE:**
${dataSummary}
---

Begin Talking Points:
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error('Error generating AI talking points:', error);
    throw new Error('Failed to generate AI summary.');
  }
};

/**
 * Breaks down a complex task into smaller sub-tasks using AI.
 * @param {string} taskTitle - The complex task string from the user.
 * @returns {Promise<Array<{title: string, description: string}>>} A promise that resolves to an array of sub-task objects.
 */
exports.generateAISubtasks = async (taskTitle) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // 1. The Prompt (remains the same)
  const prompt = `
You are a senior project manager. A user has provided a complex task: "${taskTitle}".
Your job is to break this task down into a list of 3-5 smaller, actionable sub-tasks.

**CRITICAL:** You must return **ONLY** a valid, minified JSON array of objects.
Do not include any text, markdown, or commentary before or after the JSON.
Each object in the array must have two keys: "title" (string) and "description" (string).

**Example Response:**
[{"title":"Design user interface mockups","description":"Create high-fidelity mockups in Figma for all landing page sections."},{"title":"Develop responsive HTML/CSS","description":"Code the frontend of the landing page, ensuring it works on desktop and mobile."},{"title":"Integrate with email form","description":"Hook up the contact form to the backend email service."}]
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // --- 2. THIS IS THE FIX ---
    // We will find the first '[' and the last ']' in the response
    // to extract the JSON array and ignore the "```json" wrapper.
    try {
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');

      if (firstBracket === -1 || lastBracket === -1) {
        throw new Error('AI response did not contain a JSON array.');
      }

      // Slice the string from the first '[' to the last ']'
      const jsonString = text.substring(firstBracket, lastBracket + 1);

      const subtasks = JSON.parse(jsonString);
      return subtasks;

    } catch (jsonError) {
      console.error('AI Subtask Generation - JSON Parse Error:', jsonError.message);
      console.error('Raw AI Response:', text);
      throw new Error('AI response was not valid JSON.');
    }
    // --- END OF FIX ---

  } catch (error) {
    console.error('Error generating AI sub-tasks:', error);
    throw new Error('Failed to generate AI sub-tasks.');
  }
};

/**
 * Generates a contextual chat response using Gemini AI.
 * @param {Array} history - The chat history (e.g., [{role: 'user', content: '...'}])
 * @param {string} question - The user's new question.
 * @param {string} context - The massive string of all user data.
 * @returns {string} The AI-generated text response.
 */
exports.generateChatResponse = async (history, question, context) => {
  // Use the 'gemini-2.0-flash' model for fast, conversational responses
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // 1. --- FIX: Correct System Instruction Format ---
  // The content must be wrapped in a `parts` array.
  const systemInstruction = {
    role: 'user',
    parts: [{
      text: `
You are E-Manager AI, a helpful and professional assistant.
Your task is to answer the user's questions based *ONLY* on the data provided in the "USER'S ACCOUNT DATA" section.
You must strictly follow these rules:

1.  **Use Only Provided Data:** Do not use any external knowledge. All your answers must come directly from the "USER'S ACCOUNT DATA" context.
2.  **Be Data-Aware:** You have access to all the user's teams, tasks, members, notes, meetings, and attendance records.
3.  **Be Conversational:** Answer in a helpful, clear, and professional tone.
4.  **Handle Missing Information:** If the user asks for information that is not in the provided data (e.g., "What's the weather?" or "Who is Suman's manager?"), you MUST respond with: "I'm sorry, I don't have that information in my records." or "I can only answer questions about your E-Manager account data."
5.  **Be Concise:** Keep your answers as short and direct as possible while still being helpful.
6.  **Perform Calculations:** You can count items (e.g., "How many tasks are pending?"), list items (e.g., "What are Suman's tasks?"), and summarize data.

Here is the full context of the user's account:

--- START OF USER'S ACCOUNT DATA ---
${context}
--- END OF USER'S ACCOUNT DATA ---
    `,
    }],
  };

  // 2. --- FIX: Correct History Mapping ---
  // We must map the frontend's history format to the SDK's required format.
  // - Map `role: 'ai'` to `role: 'model'`
  // - Map `content: '...'` to `parts: [{ text: '...' }]`
  const formattedHistory = history.map(msg => ({
    role: msg.role === 'ai' ? 'model' : 'user', // Map 'ai' to 'model'
    parts: [{ text: msg.content }],
  }));

  // 3. Start the chat with the fully formatted history
  const chat = model.startChat({
    history: [systemInstruction, ...formattedHistory],
  });

  try {
    // 4. Send the user's new question (as a plain string, which is correct)
    const result = await chat.sendMessage(question);
    const response = await result.response;
    const text = response.text();
    return text;

  } catch (error) {
    console.error('Error in generateChatResponse:', error);
    // Handle potential safety blocks or other AI errors
    if (error.response && error.response.promptFeedback) {
      console.error('AI Prompt Feedback:', error.response.promptFeedback);
      return "I'm sorry, I couldn't process that request due to a content filter. Please try rephrasing.";
    }
    throw new Error('Failed to get a response from the AI.');
  }
};
