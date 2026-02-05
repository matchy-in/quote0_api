/**
 * Quote/0 Client Service
 * Sends formatted display data to Quote/0 device text API
 */

const axios = require('axios');

const QUOTE0_TEXT_API = process.env.QUOTE0_TEXT_API;
const QUOTE0_AUTH_TOKEN = process.env.QUOTE0_AUTH_TOKEN; // Bearer token for authorization
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

class Quote0ClientService {
  /**
   * Send display data to Quote/0 device
   * @param {Object} displayData - Formatted display data
   * @param {number} attempt - Current attempt number (for retries)
   * @returns {Promise<void>}
   */
  async updateDisplay(displayData, attempt = 1) {
    if (!QUOTE0_TEXT_API) {
      console.warn('[Quote0Client] QUOTE0_TEXT_API not configured, skipping device update');
      console.warn('[Quote0Client] Set QUOTE0_TEXT_API environment variable to enable');
      return;
    }

    if (!QUOTE0_AUTH_TOKEN) {
      console.warn('[Quote0Client] QUOTE0_AUTH_TOKEN not configured, skipping device update');
      console.warn('[Quote0Client] Set QUOTE0_AUTH_TOKEN environment variable to enable');
      return;
    }

    try {
      console.log(`[Quote0Client] Sending update to device (attempt ${attempt}/${MAX_RETRIES})`);
      console.log('[Quote0Client] Endpoint:', QUOTE0_TEXT_API);
      console.log('[Quote0Client] Payload:', JSON.stringify(displayData, null, 2));

      // Build headers with Bearer token
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QUOTE0_AUTH_TOKEN}`,
        'User-Agent': 'Quote0-API/1.0'
      };

      console.log('[Quote0Client] Using Bearer token authentication');

      const response = await axios.post(QUOTE0_TEXT_API, displayData, {
        timeout: 10000, // 10 second timeout
        headers: headers
      });

      console.log('[Quote0Client] ✅ Successfully updated Quote/0 display');
      console.log('[Quote0Client] Response:', response.status, response.statusText);
      
      if (response.data) {
        console.log('[Quote0Client] Response data:', response.data);
      }
    } catch (error) {
      console.error(`[Quote0Client] ❌ Failed to update Quote/0 (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

      if (error.response) {
        // Server responded with error status
        console.error('[Quote0Client] Response status:', error.response.status);
        console.error('[Quote0Client] Response data:', error.response.data);
      } else if (error.request) {
        // Request made but no response
        console.error('[Quote0Client] No response received from device');
        console.error('[Quote0Client] This could mean the device is offline or unreachable');
      } else {
        // Error in request setup
        console.error('[Quote0Client] Error setting up request:', error.message);
      }

      // Retry logic
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`[Quote0Client] Retrying in ${delay}ms...`);
        
        await this.sleep(delay);
        return await this.updateDisplay(displayData, attempt + 1);
      }

      // All retries exhausted
      console.error('[Quote0Client] ❌ Failed to update Quote/0 after all retry attempts');
      console.error('[Quote0Client] Device will use hourly pull (GET /api/display) as fallback');
      
      // Don't throw error - allow scheduled update to complete
      // Quote/0 device will pull data via GET endpoint as fallback
    }
  }

  /**
   * Test connection to Quote/0 device
   * @returns {Promise<boolean>} True if device is reachable
   */
  async testConnection() {
    if (!QUOTE0_TEXT_API) {
      console.log('[Quote0Client] QUOTE0_TEXT_API not configured');
      return false;
    }

    try {
      // Try to make a HEAD request or simple GET to test connectivity
      await axios.get(QUOTE0_TEXT_API, { timeout: 5000 });
      console.log('[Quote0Client] Device is reachable');
      return true;
    } catch (error) {
      console.log('[Quote0Client] Device is not reachable:', error.message);
      return false;
    }
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new Quote0ClientService();
