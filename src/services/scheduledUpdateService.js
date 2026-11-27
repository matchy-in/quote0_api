/**
 * Scheduled Update Service
 * Orchestrates the daily scheduled updates:
 * 1. Fetch bin collections from Reading API
 * 2. Store in DynamoDB
 * 3. Query tomorrow's collections from database
 * 4. Build dashboard (weather, 3 upcoming events, bin reminder) and push to Quote/0 via Canvas API
 */

const binCollectionService = require('./binCollectionService');
const binCollectionDbService = require('./binCollectionDbService');
const dashboardService = require('./dashboardService');

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
      console.log('Step 1/4: Fetching bin collections from Reading API...');
      const apiCollections = await binCollectionService.fetchBinCollections();
      console.log(`✅ Step 1 complete: Fetched ${apiCollections.length} collections from API`);

      // Step 2: Store bin collections in DynamoDB
      console.log('');
      console.log('Step 2/4: Storing bin collections in DynamoDB...');
      const storedCount = await binCollectionDbService.storeBinCollections(apiCollections);
      console.log(`✅ Step 2 complete: Stored ${storedCount} bin collections in database`);

      // Step 3: Query tomorrow's bin collections from database
      console.log('');
      console.log('Step 3/4: Querying tomorrow\'s bin collections from database...');
      const tomorrowCollections = await binCollectionDbService.getTomorrowCollections();
      console.log(`✅ Step 3 complete: Found ${tomorrowCollections.length} bin collections for tomorrow`);

      // Step 4: Build dashboard (weather, 3 upcoming events, bin reminder) and push to Quote/0 via Canvas API
      console.log('');
      console.log('Step 4/4: Building dashboard and pushing to Quote/0 (Canvas API)...');
      const { data: dashboard, results: pushResults } = await dashboardService.refresh(tomorrowCollections);
      const pushed = Object.values(pushResults).every(r => r.success);
      console.log(`${pushed ? '✅' : '⚠️'} Step 4 complete: dashboard ${pushed ? 'sent' : 'NOT sent'}`, JSON.stringify(pushResults));

      const duration = Date.now() - startTime;
      
      console.log('');
      console.log('═'.repeat(80));
      console.log(pushed ? `✅ SCHEDULED UPDATE COMPLETED SUCCESSFULLY` : `⚠️ SCHEDULED UPDATE COMPLETED, BUT QUOTE/0 WAS NOT UPDATED`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Time: ${new Date().toISOString()}`);
      console.log('═'.repeat(80));
      console.log('');

      return {
        success: pushed,
        duration,
        timestamp: new Date().toISOString(),
        metrics: {
          binCollectionsFetched: apiCollections.length,
          binCollectionsStored: storedCount,
          tomorrowCollections: tomorrowCollections.length,
          upcomingEvents: dashboard.events.length,
          dashboard,
          pushResults
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
