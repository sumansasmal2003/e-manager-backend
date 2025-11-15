// services/memberReportService.js
const PDFDocument = require('pdfkit');
const moment = require('moment');

const COLORS = {
  primary: '#111827', // This is the dark color we want
  secondary: '#6B7280', // This is the light gray we are removing
  accent: '#2563EB',
};

/**
 * Generates a professional PDF from an AI-generated Markdown string.
 * @param {string} markdownText - The Markdown text from the AI.
 * @param {string} memberName - The member's name for the file.
 * @returns {Promise<Buffer>} A promise that resolves with the PDF buffer.
 */
exports.generatePDFFromMarkdown = (markdownText, memberName) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Performance Report - ${memberName}`,
          Author: 'E-Manager AI',
        },
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // --- PDF Header ---
      doc
        .fillColor(COLORS.primary)
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('E-Manager', { align: 'left' });

      doc
        .fillColor(COLORS.secondary) // It's okay for this one sub-header to be gray
        .fontSize(10)
        .font('Helvetica')
        .text(`Generated on: ${moment().format('MMMM DD, YYYY')}`, { align: 'right' });

      doc.moveDown(2);

      const lines = markdownText.split('\n');

      // --- Parse and Render Markdown Lines ---
      lines.forEach(line => {
        if (doc.y > 720) {
          doc.addPage();
          doc.y = 50;
        }

        if (line.startsWith('# ')) {
          // Main Title
          doc
            .fillColor(COLORS.primary)
            .fontSize(20)
            .font('Helvetica-Bold')
            .text(line.substring(2))
            .moveDown(0.75);
        } else if (line.startsWith('## ')) {
          // Sub-header
          doc
            .fillColor(COLORS.primary)
            .fontSize(16)
            .font('Helvetica-Bold')
            .text(line.substring(3))
            .moveDown(0.5);
        } else if (line.startsWith('* ') || line.startsWith('- ')) {

          // --- THIS IS THE FIX (Bullet point) ---
          doc
            .fillColor(COLORS.primary) // Set color to dark
            .fontSize(10)
            .font('Helvetica');
          // --- END OF FIX ---

          doc.list([line.substring(2)], {
            bulletRadius: 2.5,
            textIndent: 10,
            lineGap: 4,
          });

        } else if (line.trim() === '') {
          // Empty line
          doc.moveDown();
        } else {

          // --- THIS IS THE FIX (Paragraph) ---
          doc
            .fillColor(COLORS.primary) // Changed from COLORS.secondary
            .fontSize(10)
            .font('Helvetica')
            .text(line, {
              align: 'justify',
              lineGap: 4,
            })
            .moveDown();
          // --- END OF FIX ---
        }
      });

      // --- PDF Footer ---
      const pageCount = doc.page.count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        doc
          .fontSize(8)
          .fillColor(COLORS.secondary) // Footer can stay gray
          .text(
            `Confidential Performance Report for ${memberName}  •  Page ${i + 1} of ${pageCount}`,
            50,
            doc.page.height - 40,
            { align: 'center' }
          );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
