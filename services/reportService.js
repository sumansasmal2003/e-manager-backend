const { GoogleGenerativeAI } = require('@google/generative-ai');
const Task = require('../models/Task');
const dotenv = require('dotenv');

dotenv.config();

const api = process.env.GEMINI_API_KEY;

// Initialize the AI client
const genAI = new GoogleGenerativeAI(api);

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' }); // Using 'pro' for a more detailed report

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' }); // Use 'pro' for this task

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

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
 * AI Call 2: The "Talker"
 * Generates a contextual chat response using Gemini AI.
 * This is *only* called if the intent is "GET_ANSWER".
 */
exports.generateChatResponse = async (history, question, context) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  // 1. --- MODIFIED SYSTEM INSTRUCTION ---
  // This prompt is now *simpler*. It no longer needs rules for
  // handling sensitive data because it's only a "reader".
  const systemInstruction = {
    role: 'user',
    parts: [{
      text: `
You are E-Manager AI, a helpful and professional assistant.
Your task is to answer the user's questions based *ONLY* on the data provided in the "USER'S ACCOUNT DATA" section.
You must strictly follow these rules:

1.  **Use Only Provided Data:** Do not use any external knowledge. All your answers must come from the "USER'S ACCOUNT DATA" context.
2.  **Be Data-Aware:** You have access to all the user's teams, tasks, members, notes, meetings, and attendance records.
3.  **This is Read-Only:** Your *only* job is to answer questions. You cannot create, update, or delete anything. If a user asks you to create something (e.g., "make a new task"), you must respond with: "I'm sorry, I can't perform that action."
4.  **Handle Missing Information:** If the user asks for information that is not in the provided data (e.g., "What's the weather?"), respond with: "I'm sorry, I don't have that information in my records."
5.  **Be Concise:** Keep your answers short and direct.

Here is the full context of the user's account:

--- START OF USER'S ACCOUNT DATA ---
${context}
--- END OF USER'S ACCOUNT DATA ---
    `,
    }],
  };

  // 2. --- (This part is the same as your previous fix) ---
  const formattedHistory = history.map(msg => ({
    role: msg.role === 'ai' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const chat = model.startChat({
    history: [systemInstruction, ...formattedHistory],
  });

  try {
    const result = await chat.sendMessage(question);
    const response = await result.response;
    const text = response.text();
    return text;

  } catch (error) {
    console.error('Error in generateChatResponse:', error);
    if (error.response && error.response.promptFeedback) {
      console.error('AI Prompt Feedback:', error.response.promptFeedback);
      return "I'm sorry, I couldn't process that request due to a content filter. Please try rephrasing.";
    }
    throw new Error('Failed to get a response from the AI.');
  }
};

/**
 * AI Call 1: The "Router" or "Agent"
 * This function determines if the user wants to READ data or WRITE data.
 * It returns a JSON object describing the user's intent.
 */
exports.determineUserIntent = async (question, context, history, timezone) => { // <-- 1. ADD TIMEZONE
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  // Convert chat history to a simple string
  const historyString = history.map(h => `${h.role}: ${h.content}`).join('\n');

  const prompt = `
You are a highly intelligent routing agent. Your job is to analyze a user's request, chat history, and data context.
You must determine which "tool" to use and respond ONLY with a valid JSON object.

--- TIME & DATE CONTEXT ---
* Today's Date (User's Timezone): ${new Date().toLocaleDateString('en-CA')}
* User's Local Timezone: ${timezone}

--- CRITICAL TIME INSTRUCTIONS ---
When you must provide a "dueDate" or "meetingTime":
1.  Calculate the user's *local* date/time based on their request (e.g., "tomorrow at 5 PM").
2.  You MUST convert this local date/time into a full UTC ISO 8601 string (e.g., if the user is in "America/New_York" (UTC-4) and asks for 5 PM, the ISO string would end in T21:00:00.000Z).
3.  Use "Today's Date" and "User's Local Timezone" as your reference point for all calculations.

--- TOOL DEFINITIONS ---

1.  **GET_ANSWER**:
    * Description: Use this for general questions, summaries, or any request that does *not* create, update, or delete an item.
    * JSON: {"action": "GET_ANSWER", "payload": {"question": "The user's original question"}}

2.  **CREATE_TASK**:
    * Description: Use this to create a new task.
    * Parameters:
        * "teamName" (string, required): The name of the team.
        * "assignedTo" (string, required): The name of the member.
        * "title" (string, required): The title of the task.
        * "description" (string, optional): A longer description.
        * "dueDate" (string, optional): The *full UTC ISO 8601 string* for the due date (e.g., "2025-11-21T04:59:59.000Z" for end of day Nov 20th).
    * JSON: {"action": "CREATE_TASK", "payload": {"teamName": "...", "assignedTo": "...", "title": "...", "dueDate": "..."}}

3.  **SCHEDULE_MEETING**:
    * Description: Use this to schedule a new meeting.
    * Parameters:
        * "teamName" (string, required): The name of the team.
        * "title" (string, required): The title of the meeting.
        * "agenda" (string, optional): The meeting agenda.
        * "meetingTime" (string, required): The *full UTC ISO 8601 string* for the meeting (e.g., "2025-11-20T21:30:00.000Z").
    * JSON: {"action": "SCHEDULE_MEETING", "payload": {"teamName": "...", "title": "...", "meetingTime": "..."}}

4.  **ADD_NOTE**:
    * Description: Use this to create a new *personal* note.
    * JSON: {"action": "ADD_NOTE", "payload": {"title": "...", "content": "..."}}

**UPDATE_TASKS**:
    * Description: Use this to modify *one or more* existing tasks that match a set of filters.
    * Parameters:
        * "find" (object, required): An object of filters to identify the tasks.
            * "teamName" (string, optional): The name of the team.
            * "assignedTo" (string, optional): The member the task is assigned to.
            * "title" (string, optional): A specific task title (or partial title).
            * "status" (string, optional): The *current* status to filter by (e.g., "Pending").
            * "dueDate" (string, optional): A *date* ("YYYY-MM-DD") to filter by.
        * "updates" (object, required): An object containing the fields to change.
            * "status" (string, optional, enum: ["Pending", "In Progress", "Completed"])
            * "assignedTo" (string, optional): The *new* member to assign the task(s) to.
            * "dueDate" (string, optional): The *new* due date ("YYYY-MM-DD" or full ISO string).
    * JSON: {"action": "UPDATE_TASKS", "payload": {"find": {"teamName": "fixspire", "status": "Pending", "dueDate": "2025-11-15"}, "updates": {"status": "Completed"}}}

**DELETE_TASKS**:
    * Description: Use this to delete *one or more* tasks that match a set of filters.
    * Parameters:
        * "find" (object, required): An object of filters to identify the tasks to delete.
            * "teamName" (string, optional): The name of the team.
            * "assignedTo" (string, optional): The member the task is assigned to.
            * "title" (string, optional): A specific task title (or partial title).
            * "status" (string, optional): The status to filter by.
            * "dueDate" (string, optional): A date ("YYYY-MM-DD") to filter by.
    * JSON: {"action": "DELETE_TASKS", "payload": {"find": {"title": "Old reports", "status": "Completed"}}}

7.  **UPDATE_NOTE**:
    * Description: Use this to modify an existing *personal* note.
    * JSON: {"action": "UPDATE_NOTE", "payload": {"find": {"title": "..."}, "updates": {"content": "..."}}}

8.  **DELETE_NOTE**:
    * Description: Use this to delete a *personal* note.
    * JSON: {"action": "DELETE_NOTE", "payload": {"find": {"title": "..."}}}

9. **UPDATE_MEETING**:
    * Description: Use this to modify an existing meeting (e.g., change its time, agenda, or participants).
    * Parameters:
        * "find" (object, required): An object to identify the meeting.
            * "title" (string, required): The title (or partial title) of the meeting to find.
        * "updates" (object, required): An object containing the fields to change.
            * "title" (string, optional): New title.
            * "agenda" (string, optional): New agenda.
            * "meetingTime" (string, optional): The *new full UTC ISO 8601 string* for the meeting.
            * "participants" (array[string], optional): New list of participants.
    * JSON: {"action": "UPDATE_MEETING", "payload": {"find": {"title": "Team Sync"}, "updates": {"agenda": "New agenda item"}}}

10. **DELETE_MEETING**:
    * Description: Use this to delete or cancel an existing meeting.
    * Parameters:
        * "find" (object, required): An object to identify the meeting.
            * "title" (string, required): The title (or partial title) of the meeting to find.
            * "teamName" (string, optional): The name of the team (for disambiguation).
            * "meetingTime" (string, optional): The *full UTC ISO 8601 string* for the meeting time (for disambiguation).
    * JSON: {"action": "DELETE_MEETING", "payload": {"find": {"title": "Fixspire Working Progress", "teamName": "fixspire", "meetingTime": "2025-11-17T05:30:00.000Z"}}}

12. **SET_ATTENDANCE**:
    * Description: Use this to mark attendance for one or more members for *today's date only*.
    * Parameters:
        * "status" (string, required, enum: ["Present", "Absent", "Leave", "Holiday"]): The status to set.
        * "teamName" (string, optional): The team whose members you want to mark.
        * "members" (array[string], optional): A list of specific member names.
        * "note": You *must* use either "teamName" OR "members". "teamName" is preferred if the user says "all members" or "the whole team".
    * JSON: {"action": "SET_ATTENDANCE", "payload": {"teamName": "Fixspire", "status": "Present"}}

--- DATA CONTEXT ---
${context}

--- CHAT HISTORY ---
${historyString}

--- NEW USER QUESTION ---
"${question}"

Respond ONLY with the single, valid JSON object for the action.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    // Clean the response to ensure it's valid JSON
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return text;
  } catch (error) {
    console.error("Error in determineUserIntent:", error);
    // Fallback to GET_ANSWER if intent recognition fails
    return JSON.stringify({ action: "GET_ANSWER", payload: { question: question } });
  }
};

/**
 * Generates a professional email draft based on a prompt and user data.
 * @param {string} userPrompt - The user's goal (e.g., "Draft a warning for Suman about 3 overdue tasks").
 * @param {string} dataContext - The user's data (tasks, members, etc.).
 * @param {string} senderName - The user's (leader's) name.
 * @returns {Promise<{subject: string, body: string}>} - A JSON object with subject and HTML body.
 */
exports.generateEmailDraft = async (userPrompt, dataContext, senderName) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `
You are an expert HR manager and team leader. Your task is to draft a professional, clear, and context-aware email.
The user's goal is: "${userPrompt}".
The user's name (the sender) is: ${senderName}.
Use the provided "DATA CONTEXT" to get all names, task titles, and dates you need.

--- DATA CONTEXT ---
${dataContext}
--- END DATA CONTEXT ---

Your response MUST be a single, minified JSON object in this exact format:
{"subject": "A clear, professional subject line", "body": "The full email body, formatted as simple HTML using <p> and <ul> tags."}

Rules:
1.  **Be Professional:** The tone should match the user's prompt (e.g., "warning," "congratulations," "update").
2.  **Use Context:** You MUST use the specific task titles, member names, and dates from the data context.
3.  **Use HTML:** The "body" MUST be valid, simple HTML. Use <p> for paragraphs and <ul>/<li> for lists.
4.  **Sign Off:** End the email with the sender's name (e.g., "Best,\n${senderName}").
5.  **Be Specific:** Do not be vague. If the prompt is "warn Suman about 3 overdue tasks," the email should list those 3 tasks.
6.  **JSON Only:** Do not include any text before or after the JSON object.

Draft the email now.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // Parse to ensure it's valid JSON before returning
    const emailData = JSON.parse(text);
    return emailData;

  } catch (error) {
    console.error("Error in generateEmailDraft:", error);
    throw new Error("Failed to generate AI email draft. The AI returned an invalid response.");
  }
};


/**
 * Generates proactive insights, warnings, and suggestions based on all user data.
 * @param {string} dataContext - The user's complete data context.
 * @returns {Promise<string>} - A JSON string *array* of insight objects.
 */
exports.generateProactiveInsights = async (dataContext) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `
You are a proactive, senior-level "Manager's Assistant" AI.
Your *only* job is to analyze the user's complete "DATA CONTEXT" and find potential problems, risks, or positive insights that the user might have missed.
Today's Date: ${new Date().toLocaleDateString('en-CA')}

--- DATA CONTEXT ---
${dataContext}
--- END DATA CONTEXT ---

You must analyze the context and look for these specific patterns:
1.  **Overdue Tasks:** Are there any tasks that are past their due date but not 'Completed'?
2.  **At-Risk Tasks:** Are there tasks due in the next 1-2 days that are still 'Pending'?
3.  **Member Overload:** Is one specific member assigned to a high number of 'In Progress' or 'Overdue' tasks?
4.  **Meeting Conflicts:** Are there any meetings scheduled for the same time?
5.  **Meeting Preparedness:** Is there a meeting in the next 24 hours with no agenda?
6.  **1-on-1 Gaps:** Has it been more than 30 days since the last 1-on-1 with a specific member (check 'ATTENDANCE TOTALS' for member names)?
7.  **Positive Reinforcement:** Is a member on a long 'Present' streak? Has a team just completed a major task?
8.  **Attendance Issues:** Does any member have a high number of 'Absent' or 'Leave' days in the 'ATTENDANCE TOTALS' data?

CRITICAL: Your response MUST be a single, valid, minified JSON array of "Insight Objects".
An "Insight Object" has this format:
{"type": "Warning" | "Suggestion" | "Insight", "title": "A short, bold headline", "message": "A 1-2 sentence explanation."}

Rules:
-   If you find no insights, return an empty array: [].
-   Do not generate more than 5 insights, even if you find more. Pick the 5 most critical ones.
-   Do not include any text, markdown, or commentary before or after the JSON array.

Analyze the data and return the JSON array of insights now.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // Ensure it's a valid array
    if (!text.startsWith('[') || !text.endsWith(']')) {
      console.error("AI Insight Error: Response was not a valid JSON array.", text);
      return "[]"; // Return empty array on failure
    }

    // Test parsing
    JSON.parse(text);

    return text;

  } catch (error) {
    console.error("Error in generateProactiveInsights:", error);
    // Return an empty array on any error
    return "[]";
  }
};

/**
 * AI-Powered Task & Project Forecasting
 * Generates a time estimate for a new task based on past, similar tasks.
 * @param {string} taskTitle - The title of the new task to estimate.
 * @param {string} teamId - The ID of the team to scope the search.
 * @param {string} timezone - The user's local timezone.
 * @returns {Promise<object>} - A JSON object with the estimate.
 */
exports.generateTaskEstimate = async (taskTitle, teamId, timezone) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  // 1. Fetch all *completed* tasks for this team to build a knowledge base.
  const completedTasks = await Task.find({
    team: teamId,
    status: 'Completed',
    createdAt: { $exists: true },
    updatedAt: { $exists: true }
  }).select('title createdAt updatedAt').lean();

  // 2. Calculate the duration for each completed task
  const taskKnowledgeBase = completedTasks.map(task => {
    const start = new Date(task.createdAt);
    const end = new Date(task.updatedAt);
    const durationMs = end.getTime() - start.getTime();
    // Convert duration from milliseconds to days, rounding to one decimal
    const durationDays = Math.round((durationMs / (1000 * 60 * 60 * 24)) * 10) / 10;

    return { title: task.title, durationDays: durationDays > 0 ? durationDays : 0.5 }; // Min 0.5 days
  });

  // 3. Create the prompt
  const prompt = `
You are an expert Senior Project Manager. Your job is to analyze a new task and provide a time estimate.
Today's Date: ${new Date().toLocaleDateString('en-CA')}
User's Timezone: ${timezone}

New Task to Estimate: "${taskTitle}"

Here is a knowledge base of all past completed tasks for this team and their actual duration in days:
--- KNOWLEDGE BASE ---
${JSON.stringify(taskKnowledgeBase, null, 2)}
--- END KNOWLEDGE BASE ---

Your task:
1.  Analyze the "New Task to Estimate".
2.  Find 3-5 tasks from the "KNOWLEDGE BASE" that are *semantically similar* (e.g., "Design logo" is similar to "Create branding mockups").
3.  Calculate the average duration of those similar tasks.
4.  Round the average to the nearest half-day (e.g., 3, 3.5, 4). This is your "estimateInDays".
5.  Calculate the "suggestedDate" by adding "estimateInDays" to "Today's Date". Format it as YYYY-MM-DD.
6.  Write a brief "reasoning" string (1-2 sentences) explaining *which* past tasks you used for the estimate.

Respond ONLY with a single, minified JSON object in this exact format:
{
  "estimateInDays": 4.5,
  "suggestedDate": "YYYY-MM-DD",
  "reasoning": "Based on similar tasks like 'Task A' (X days) and 'Task B' (Y days)."
}

If no similar tasks are found, return:
{
  "estimateInDays": null,
  "suggestedDate": null,
  "reasoning": "I couldn't find any similar completed tasks in your history for this team."
}

Generate the JSON object now.
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const estimateData = JSON.parse(text);
    return estimateData;

  } catch (error) {
    console.error("Error in generateTaskEstimate:", error);
    throw new Error("Failed to generate AI task estimate.");
  }
};
