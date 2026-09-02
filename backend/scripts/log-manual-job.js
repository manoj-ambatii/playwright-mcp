/**
 * log-manual-job.js
 * Command line tool to manually log job applications into job-tracker.json & job-applications.xlsx
 * 
 * Usage:
 *   node backend/scripts/log-manual-job.js "Job Title" "Company Name" "External URL" "Location" "Notes"
 * 
 * Example:
 *   node backend/scripts/log-manual-job.js "Java Backend Engineer" "Microsoft" "https://careers.microsoft.com/job/123" "Hyderabad" "Applied via company site"
 */

const fs = require('fs');
const path = require('path');
const tracker = require('./track-jobs');

const args = process.argv.slice(2);
const title = args[0] || 'Software Engineer';
const company = args[1] || 'External Company';
const externalUrl = args[2] || '';
const location = args[3] || 'Hyderabad / Remote';
const notes = args[4] || 'Manual external job application logged';

const url = externalUrl || `manual-${Date.now()}`;

tracker.logApplied({
  title,
  company,
  location,
  url,
  externalUrl: url,
  source: 'manual_external',
  notes,
});

tracker.save();

console.log('\n✅ Successfully logged manual job application:');
console.log(`  • Title:    ${title}`);
console.log(`  • Company:  ${company}`);
console.log(`  • Location: ${location}`);
console.log(`  • URL:      ${url}`);
console.log(`  • Date:     ${new Date().toLocaleString()}`);
console.log('\nTracker updated → job-tracker.json & job-applications.xlsx');
