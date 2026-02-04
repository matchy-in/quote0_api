/**
 * Scheduled Update Service
 * Orchestrates the scheduled update process
 * Triggered by EventBridge at 01:10, 07:10, 12:10, 17:10 UTC
 */

const binCollectionService = require('./binCollectionService');
const dynamoDbService = require('./dynamoDbService');
const displayFormatterService = require('./displayFormatterService');
const quote0ClientService = require('./quote0ClientService');

class ScheduledUpdateService {
  /**
   * Execute the complete scheduled update process
   * @returns {Promise<Object>} Result object with success status and metrics
   */
  async executeUpdate() {
    const startTime = Date.now();
    
    console.log('');
    console.log('═'.repeat(80));
    console.log(`🕐 SCHEDULED UPDATE STARTED`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log('═'.repeat(80));

    try {
      // Step 1: Fetch tomorrow's bin collections
      console.log('');
      console.log('Step 1/4: Fetching bin collection data...');
      const binCollections = await binCollectionService.getTomorrowCollections();
      console.log(`✅ Step 1 complete: Found ${binCollections.length} bin collections for tomorrow`);

      // Step 2: Query today's events from DynamoDB
      console.log('');
      console.log('Step 2/4: Querying today\'s events from DynamoDB...');
      const today = new Date().toISOString().split('T')[0];
      const events = await dynamoDbService.getEventsByDate(today);
      console.log(`✅ Step 2 complete: Found ${events.length} events for today (${today})`);

      // Step 3: Format display data
      console.log('');
      console.log('Step 3/4: Formatting display data...');
      const displayData = displayFormatterService.formatDisplay(events, binCollections);
      console.log('✅ Step 3 complete: Display data formatted');
      console.log('');
      console.log('Display Data Preview:');
      console.log('─'.repeat(40));
      console.log(`Title:     "${displayData.title}"`);
      console.log(`Message:   "${displayData.message.replace(/\n/g, '\\n')}"`);
      console.log(`Signature: "${displayData.signature}"`);
      console.log('─'.repeat(40));

      // Step 4: Push to Quote/0 device
      console.log('');
      console.log('Step 4/4: Pushing update to Quote/0 device...');
      await quote0ClientService.updateDisplay(displayData);
      console.log('✅ Step 4 complete: Update sent to Quote/0');

      const duration = Date.now() - startTime;
      
      console.log('');
      console.log('═'.repeat(80));
      console.log(`✅ SCHEDULED UPDATE COMPLETED SUCCESSFULLY`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Time: ${new Date().toISOString()}`);
      console.log('═'.repeat(80));
      console.log('');

      return {
        success: true,
        duration,
        timestamp: new Date().toISOString(),
        metrics: {
          binCollectionsFound: binCollections.length,
          eventsFound: events.length,
          displayData: displayData
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error('');
      console.error('═'.repeat(80));
      console.error(`❌ SCHEDULED UPDATE FAILED`);
      console.error(`   Duration: ${duration}ms`);
      console.error(`   Time: ${new Date().toISOString()}`);
      console.error(`   Error: ${error.message}`);
      console.error('═'.repeat(80));
      console.error('');
      console.error('Error Stack:');
      console.error(error.stack);
      console.error('');

      return {
        success: false,
        duration,
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      };
    }
  }
}

module.exports = new ScheduledUpdateService();
