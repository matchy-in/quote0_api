/**
 * Scheduled Update Service
 * Orchestrates the daily scheduled updates:
 * 1. Fetch bin collections from Reading API
 * 2. Store in DynamoDB
 * 3. Query tomorrow's collections from database
 * 4. Query today's events from database
 * 5. Format display data
 * 6. Push to Quote/0 device
 */

const binCollectionService = require('./binCollectionService');
const binCollectionDbService = require('./binCollectionDbService');
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
      // Step 1: Fetch bin collections from Reading API
      console.log('');
      console.log('Step 1/6: Fetching bin collections from Reading API...');
      const apiCollections = await binCollectionService.fetchBinCollections();
      console.log(`✅ Step 1 complete: Fetched ${apiCollections.length} collections from API`);

      // Step 2: Store bin collections in DynamoDB
      console.log('');
      console.log('Step 2/6: Storing bin collections in DynamoDB...');
      const storedCount = await binCollectionDbService.storeBinCollections(apiCollections);
      console.log(`✅ Step 2 complete: Stored ${storedCount} bin collections in database`);

      // Step 3: Query tomorrow's bin collections from database
      console.log('');
      console.log('Step 3/6: Querying tomorrow\'s bin collections from database...');
      const tomorrowCollections = await binCollectionDbService.getTomorrowCollections();
      console.log(`✅ Step 3 complete: Found ${tomorrowCollections.length} bin collections for tomorrow`);

      // Step 4: Query today's events from database
      console.log('');
      console.log('Step 4/6: Querying today\'s events from database...');
      const today = new Date().toISOString().split('T')[0];
      const events = await dynamoDbService.getEventsByDate(today);
      console.log(`✅ Step 4 complete: Found ${events.length} events for today (${today})`);

      // Step 5: Format display data
      console.log('');
      console.log('Step 5/6: Formatting display data...');
      const displayData = displayFormatterService.formatDisplayFromDb(events, tomorrowCollections);
      console.log('✅ Step 5 complete: Display data formatted');
      console.log('');
      console.log('Display Data Preview:');
      console.log('─'.repeat(40));
      console.log(`Title:     "${displayData.title}"`);
      console.log(`Message:   "${displayData.message.replace(/\n/g, '\\n')}"`);
      console.log('─'.repeat(40));

      // Step 6: Push to Quote/0 device
      console.log('');
      console.log('Step 6/6: Pushing update to Quote/0 device...');
      await quote0ClientService.updateDisplay(displayData);
      console.log('✅ Step 6 complete: Update sent to Quote/0');

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
          binCollectionsFetched: apiCollections.length,
          binCollectionsStored: storedCount,
          tomorrowCollections: tomorrowCollections.length,
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
