/**
 * Test Script for Scheduled Update Service
 * Run with: node test-scheduled-update.js
 */

require('dotenv').config();

const scheduledUpdateService = require('./src/services/scheduledUpdateService');

async function test() {
  console.log('================================================================================');
  console.log('TESTING SCHEDULED UPDATE SERVICE');
  console.log('Time:', new Date().toISOString());
  console.log('================================================================================');
  console.log('');

  try {
    const result = await scheduledUpdateService.executeUpdate();
    
    console.log('');
    console.log('================================================================================');
    console.log('✅ TEST COMPLETED SUCCESSFULLY');
    console.log('================================================================================');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('');
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('================================================================================');
    console.error('❌ TEST FAILED');
    console.error('================================================================================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('');
    
    process.exit(1);
  }
}

test();
