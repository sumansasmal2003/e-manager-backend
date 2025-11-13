const PDFDocument = require('pdfkit');
const moment = require('moment');

// Color scheme for modern design
const COLORS = {
  primary: '#111827',       // Gray-900
  secondary: '#6B7280',     // Gray-500
  accent: '#2563EB',        // Blue-600
  success: '#059669',       // Green-600
  warning: '#D97706',       // Amber-600
  danger: '#DC2626',        // Red-600
  lightBg: '#F9FAFB',       // Gray-50
  border: '#E5E7EB'         // Gray-200
};

// Helper to format date
const formatDate = (date) => moment(date).format('MMM DD, YYYY');
const formatDateFull = (date) => moment(date).format('MMMM DD, YYYY');

/**
 * Generates a professional modern PDF report for a single member.
 */
exports.generateMemberPDFReport = (memberProfile, tasks, attendance, startDate, endDate) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: {
          Title: `Performance Report - ${memberProfile.name}`,
          Author: 'E-Manager',
          Subject: `Member Performance Report for ${formatDate(startDate)} - ${formatDate(endDate)}`
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // --- Cover Page ---
      doc.rect(0, 0, doc.page.width, doc.page.height)
         .fill(COLORS.lightBg);

      // Header with gradient effect
      doc.rect(0, 0, doc.page.width, 120)
         .fill(COLORS.primary);

      // Title
      doc.fillColor('#FFFFFF')
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('PERFORMANCE REPORT', 40, 60, { align: 'center' });

      doc.fontSize(16)
         .font('Helvetica')
         .text('Comprehensive Member Analysis', 40, 95, { align: 'center' });

      // Member Name in accent color
      doc.fillColor(COLORS.accent)
         .fontSize(32)
         .font('Helvetica-Bold')
         .text(memberProfile.name.toUpperCase(), 40, 200, { align: 'center' });

      // Report period
      doc.fillColor(COLORS.secondary)
         .fontSize(14)
         .font('Helvetica')
         .text(`Report Period: ${formatDateFull(startDate)} - ${formatDateFull(endDate)}`, 40, 250, { align: 'center' });

      // Generated date
      doc.text(`Generated on ${formatDateFull(new Date())}`, 40, 270, { align: 'center' });

      // Footer note
      doc.fontSize(10)
         .text('Confidential - For Internal Use Only', 40, doc.page.height - 60, { align: 'center' });

      doc.addPage();

      // --- Executive Summary Page ---
      addHeader(doc, 'Executive Summary');

      // Member Info Card
      doc.roundedRect(40, 100, doc.page.width - 80, 80, 8)
         .fill(COLORS.lightBg)
         .stroke(COLORS.border);

      doc.fillColor(COLORS.primary)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Member Information', 60, 120);

      doc.fillColor(COLORS.secondary)
         .fontSize(11)
         .font('Helvetica')
         .text(`Name: ${memberProfile.name}`, 60, 145)
         .text(`Email: ${memberProfile.email || 'Not provided'}`, 60, 160)
         .text(`Report Period: ${formatDate(startDate)} - ${formatDate(endDate)}`, 60, 175);

      // Quick Stats in a grid
      const stats = calculateStats(tasks, attendance);
      const statBoxWidth = (doc.page.width - 120) / 3;

      // Total Tasks
      drawStatBox(doc, 40, 200, statBoxWidth, 60, 'Total Tasks', stats.totalTasks, COLORS.accent);

      // Completion Rate
      drawStatBox(doc, 40 + statBoxWidth + 20, 200, statBoxWidth, 60, 'Completion Rate',
                 `${stats.completionRate}%`, stats.completionRate >= 80 ? COLORS.success :
                 stats.completionRate >= 50 ? COLORS.warning : COLORS.danger);

      // Attendance Rate
      drawStatBox(doc, 40 + (statBoxWidth + 20) * 2, 200, statBoxWidth, 60, 'Attendance Rate',
                 `${stats.attendanceRate}%`, stats.attendanceRate >= 90 ? COLORS.success :
                 stats.attendanceRate >= 75 ? COLORS.warning : COLORS.danger);

      // Performance Overview
      doc.fillColor(COLORS.primary)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Performance Overview', 40, 300);

      doc.fillColor(COLORS.secondary)
         .fontSize(11)
         .text(`This report covers ${tasks.length} tasks and ${attendance.length} attendance records from the specified period.`, 40, 325)
         .text(`The member has maintained a ${stats.completionRate}% task completion rate and ${stats.attendanceRate}% attendance rate.`, 40, 340);

      // Key Highlights
      if (stats.completedTasks > 0) {
        doc.text(`• Completed ${stats.completedTasks} tasks successfully`, 40, 365);
      }
      if (stats.overdueTasks > 0) {
        doc.text(`• ${stats.overdueTasks} tasks require attention`, 40, 380);
      }
      if (stats.presentDays > 0) {
        doc.text(`• Present for ${stats.presentDays} days`, 40, 395);
      }

      doc.addPage();

      // --- Detailed Task Analysis ---
      addHeader(doc, 'Task Analysis');

      // Task Status Breakdown
      doc.fillColor(COLORS.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Task Status Distribution', 40, 120);

      // Status breakdown with visual indicators
      const statuses = [
        { name: 'Completed', count: stats.completedTasks, color: COLORS.success },
        { name: 'In Progress', count: stats.inProgressTasks, color: COLORS.accent },
        { name: 'Pending', count: stats.pendingTasks, color: COLORS.warning },
        { name: 'Overdue', count: stats.overdueTasks, color: COLORS.danger }
      ];

      let yPos = 150;
      statuses.forEach(status => {
        if (status.count > 0) {
          doc.fillColor(status.color)
             .rect(40, yPos, 8, 8)
             .fill();

          doc.fillColor(COLORS.primary)
             .fontSize(10)
             .font('Helvetica')
             .text(status.name, 60, yPos - 2)
             .text(status.count.toString(), 150, yPos - 2);

          yPos += 20;
        }
      });

      // Detailed Task List
      doc.fillColor(COLORS.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Task Details', 40, yPos + 20);

      if (tasks.length > 0) {
        // Table Header
        doc.fillColor(COLORS.primary)
           .fontSize(9)
           .font('Helvetica-Bold')
           .text('TITLE', 40, yPos + 50)
           .text('STATUS', 250, yPos + 50)
           .text('DUE DATE', 320, yPos + 50)
           .text('PRIORITY', 380, yPos + 50);

        doc.moveTo(40, yPos + 65)
           .lineTo(doc.page.width - 40, yPos + 65)
           .strokeColor(COLORS.border)
           .stroke();

        let taskY = yPos + 75;
        tasks.slice(0, 20).forEach((task, index) => { // Limit to 20 tasks
          if (taskY > doc.page.height - 100) {
            doc.addPage();
            taskY = 120;
          }

          const statusColor = getStatusColor(task.status);

          doc.fillColor(COLORS.primary)
             .fontSize(9)
             .font('Helvetica')
             .text(task.title.substring(0, 40) + (task.title.length > 40 ? '...' : ''), 40, taskY, { width: 200 })
             .text(task.status, 250, taskY)
             .text(task.dueDate ? formatDate(task.dueDate) : 'N/A', 320, taskY)
             .text(task.priority || 'Medium', 380, taskY);

          taskY += 20;

          // Add description if available
          if (task.description && task.description.trim()) {
            doc.fillColor(COLORS.secondary)
               .fontSize(8)
               .text(task.description.substring(0, 80) + (task.description.length > 80 ? '...' : ''), 60, taskY, { width: 300 });
            taskY += 15;
          }

          // Separator
          if (index < tasks.length - 1) {
            doc.moveTo(40, taskY - 5)
               .lineTo(doc.page.width - 40, taskY - 5)
               .strokeColor(COLORS.lightBg)
               .stroke();
            taskY += 10;
          }
        });

        if (tasks.length > 20) {
          doc.fillColor(COLORS.secondary)
             .fontSize(9)
             .text(`... and ${tasks.length - 20} more tasks`, 40, taskY + 10);
        }
      } else {
        doc.fillColor(COLORS.secondary)
           .fontSize(11)
           .text('No tasks found for this period.', 40, yPos + 50);
      }

      doc.addPage();

      // --- Attendance Analysis ---
      addHeader(doc, 'Attendance Analysis');

      // Attendance Summary
      doc.fillColor(COLORS.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Attendance Summary', 40, 120);

      const attendanceStats = [
        { label: 'Present', value: stats.presentDays, color: COLORS.success },
        { label: 'Absent', value: stats.absentDays, color: COLORS.danger },
        { label: 'On Leave', value: stats.leaveDays, color: COLORS.warning }
      ];

      let attY = 150;
      attendanceStats.forEach(stat => {
        if (stat.value > 0) {
          doc.fillColor(stat.color)
             .rect(40, attY, 8, 8)
             .fill();

          doc.fillColor(COLORS.primary)
             .fontSize(10)
             .font('Helvetica')
             .text(stat.label, 60, attY - 2)
             .text(stat.value.toString(), 150, attY - 2);

          attY += 20;
        }
      });

      // Attendance Rate Visualization
      doc.fillColor(COLORS.primary)
         .fontSize(10)
         .text(`Overall Attendance Rate: ${stats.attendanceRate}%`, 40, attY + 10);

      // Simple bar for attendance rate
      const barWidth = 200;
      const attendanceBarWidth = (stats.attendanceRate / 100) * barWidth;

      doc.rect(40, attY + 25, barWidth, 12)
         .fill(COLORS.lightBg)
         .stroke(COLORS.border);

      doc.rect(40, attY + 25, attendanceBarWidth, 12)
         .fill(stats.attendanceRate >= 90 ? COLORS.success :
               stats.attendanceRate >= 75 ? COLORS.warning : COLORS.danger);

      // Detailed Attendance Log
      doc.fillColor(COLORS.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Attendance Log', 40, attY + 60);

      if (attendance.length > 0) {
        // Table Header
        doc.fillColor(COLORS.primary)
           .fontSize(9)
           .font('Helvetica-Bold')
           .text('DATE', 40, attY + 90)
           .text('STATUS', 120, attY + 90)
           .text('NOTES', 180, attY + 90);

        doc.moveTo(40, attY + 105)
           .lineTo(doc.page.width - 40, attY + 105)
           .strokeColor(COLORS.border)
           .stroke();

        let logY = attY + 115;
        attendance.sort((a, b) => new Date(b.date) - new Date(a.date))
                  .slice(0, 25) // Limit to 25 records
                  .forEach((record, index) => {
          if (logY > doc.page.height - 100) {
            doc.addPage();
            logY = 120;
          }

          const statusColor = getAttendanceColor(record.status);

          doc.fillColor(COLORS.primary)
             .fontSize(9)
             .font('Helvetica')
             .text(formatDate(record.date), 40, logY)
             .text(record.status, 120, logY);

          if (record.notes) {
            doc.fillColor(COLORS.secondary)
               .text(record.notes.substring(0, 50) + (record.notes.length > 50 ? '...' : ''), 180, logY, { width: 200 });
          }

          logY += 20;

          // Separator
          if (index < Math.min(attendance.length, 25) - 1) {
            doc.moveTo(40, logY - 5)
               .lineTo(doc.page.width - 40, logY - 5)
               .strokeColor(COLORS.lightBg)
               .stroke();
            logY += 5;
          }
        });

        if (attendance.length > 25) {
          doc.fillColor(COLORS.secondary)
             .fontSize(9)
             .text(`... and ${attendance.length - 25} more records`, 40, logY + 10);
        }
      } else {
        doc.fillColor(COLORS.secondary)
           .fontSize(11)
           .text('No attendance records found for this period.', 40, attY + 90);
      }

      // --- Conclusion Page ---
      doc.addPage();
      addHeader(doc, 'Summary & Recommendations');

      doc.fillColor(COLORS.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Performance Summary', 40, 120);

      doc.fillColor(COLORS.secondary)
         .fontSize(11)
         .font('Helvetica')
         .text(generatePerformanceSummary(stats), 40, 150, {
           width: doc.page.width - 80,
           align: 'justify'
         });

      doc.fillColor(COLORS.primary)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Key Recommendations', 40, 240);

      const recommendations = generateRecommendations(stats);
      let recY = 270;
      recommendations.forEach(rec => {
        doc.fillColor(COLORS.accent)
           .text('•', 40, recY);
        doc.fillColor(COLORS.secondary)
           .text(rec, 50, recY, { width: doc.page.width - 90 });
        recY += 30;
      });

      // Footer on all pages
      addFooter(doc);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Helper functions
function calculateStats(tasks, attendance) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Completed').length;
  const pendingTasks = tasks.filter(t => t.status === 'Pending').length;
  const inProgressTasks = tasks.filter(t => t.status === 'In Progress').length;
  const overdueTasks = tasks.filter(t => t.status === 'Pending' && new Date(t.dueDate) < new Date()).length;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const presentDays = attendance.filter(a => a.status === 'Present').length;
  const absentDays = attendance.filter(a => a.status === 'Absent').length;
  const leaveDays = attendance.filter(a => a.status === 'Leave').length;
  const totalAttendanceDays = presentDays + absentDays + leaveDays;
  const attendanceRate = totalAttendanceDays > 0 ? Math.round((presentDays / totalAttendanceDays) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    overdueTasks,
    completionRate,
    presentDays,
    absentDays,
    leaveDays,
    attendanceRate
  };
}

function drawStatBox(doc, x, y, width, height, label, value, color) {
  doc.roundedRect(x, y, width, height, 6)
     .fill(COLORS.lightBg)
     .stroke(COLORS.border);

  doc.fillColor(COLORS.secondary)
     .fontSize(9)
     .font('Helvetica')
     .text(label, x + 10, y + 10);

  doc.fillColor(color)
     .fontSize(18)
     .font('Helvetica-Bold')
     .text(value, x + 10, y + 25);
}

function addHeader(doc, title) {
  doc.fillColor(COLORS.primary)
     .fontSize(20)
     .font('Helvetica-Bold')
     .text(title, 40, 60);

  doc.moveTo(40, 85)
     .lineTo(doc.page.width - 40, 85)
     .strokeColor(COLORS.accent)
     .lineWidth(2)
     .stroke();
}

function addFooter(doc) {
  const pageNumber = doc.bufferedPageRange().count;
  doc.fillColor(COLORS.secondary)
     .fontSize(8)
     .text(`E-Manager Performance Report • Page ${pageNumber} of ${doc.bufferedPageRange().count}`,
           40, doc.page.height - 30, { align: 'center' });
}

function getStatusColor(status) {
  switch (status) {
    case 'Completed': return COLORS.success;
    case 'In Progress': return COLORS.accent;
    case 'Pending': return COLORS.warning;
    default: return COLORS.secondary;
  }
}

function getAttendanceColor(status) {
  switch (status) {
    case 'Present': return COLORS.success;
    case 'Absent': return COLORS.danger;
    case 'Leave': return COLORS.warning;
    default: return COLORS.secondary;
  }
}

function generatePerformanceSummary(stats) {
  const summaries = [];

  if (stats.completionRate >= 80) {
    summaries.push("Excellent task completion rate demonstrating strong commitment and efficiency.");
  } else if (stats.completionRate >= 60) {
    summaries.push("Good task completion rate with room for improvement in timely delivery.");
  } else {
    summaries.push("Task completion rate requires attention to meet expected performance standards.");
  }

  if (stats.attendanceRate >= 90) {
    summaries.push("Outstanding attendance record reflecting strong reliability.");
  } else if (stats.attendanceRate >= 75) {
    summaries.push("Satisfactory attendance with occasional absences that should be monitored.");
  } else {
    summaries.push("Attendance pattern needs improvement to ensure consistent presence.");
  }

  if (stats.overdueTasks > 0) {
    summaries.push(`Attention needed on ${stats.overdueTasks} overdue tasks.`);
  }

  return summaries.join(' ');
}

function generateRecommendations(stats) {
  const recommendations = [];

  if (stats.completionRate < 80) {
    recommendations.push("Focus on improving task completion rate through better time management and prioritization");
  }

  if (stats.overdueTasks > 0) {
    recommendations.push("Address overdue tasks immediately and review workload distribution if necessary");
  }

  if (stats.attendanceRate < 90) {
    recommendations.push("Work on maintaining consistent attendance and communicate any challenges affecting presence");
  }

  if (stats.completionRate >= 90 && stats.attendanceRate >= 95) {
    recommendations.push("Continue the excellent performance - consider taking on additional responsibilities or mentoring roles");
  }

  if (recommendations.length === 0) {
    recommendations.push("Maintain current performance levels and continue following established work processes");
  }

  return recommendations;
}
