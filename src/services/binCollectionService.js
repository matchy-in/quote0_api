/**
 * Bin Collection Service
 * Fetches bin collection schedules from Reading Council API
 */

const axios = require('axios');

const UPRN = process.env.UPRN || '310022781';
const READING_API_URL = process.env.READING_API_URL || 'https://api.reading.gov.uk/api/collections';
const READING_API_TIMEOUT = parseInt(process.env.READING_API_TIMEOUT) || 5000;
const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS) || 12;

// Service name mapping
const SERVICE_MAPPING = {
  'Domestic Waste Collection Service': 'Grey bin',
  'Recycling Collection Service': 'Red bin',
  'Food Waste Collection Service': 'Food waste'
};

// Simple in-memory cache
let cache = {
  data: null,
  timestamp: null
};

class BinCollectionService {
  /**
   * Fetch bin collections from Reading Council API (raw data for storing)
   * @returns {Promise<Array>} Array of raw collection objects from API
   */
  async fetchBinCollections() {
    // Check cache first
    if (this.isCacheValid()) {
      console.log('[BinCollection] Using cached data');
      return cache.data;
    }

    try {
      const url = `${READING_API_URL}/${UPRN}`;
      console.log('[BinCollection] Fetching from API:', url);

      const response = await axios.get(url, {
        timeout: READING_API_TIMEOUT,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Quote0-API/1.0'
        }
      });

      if (!response.data.success) {
        throw new Error(`API returned unsuccessful response: ${response.data.error_description}`);
      }

      const collections = response.data.collections;
      console.log(`[BinCollection] Fetched ${collections.length} collections from API`);

      // Update cache
      cache = {
        data: collections,
        timestamp: Date.now()
      };

      return collections;
    } catch (error) {
      console.error('[BinCollection] API fetch failed:', error.message);
      
      // Fallback to cached data even if expired
      if (cache.data) {
        console.warn('[BinCollection] Using expired cache due to API failure');
        return cache.data;
      }
      
      // No cache available, return empty array
      console.warn('[BinCollection] No cache available, returning empty array');
      return [];
    }
  }

  /**
   * Fetch bin collections from Reading Council API (LEGACY method)
   * @returns {Promise<Array>} Array of collection objects
   */
  async fetchCollections() {
    // Check cache first
    if (this.isCacheValid()) {
      console.log('[BinCollection] Using cached data');
      return cache.data;
    }

    try {
      const url = `${READING_API_URL}/${UPRN}`;
      console.log('[BinCollection] Fetching from API:', url);

      const response = await axios.get(url, {
        timeout: READING_API_TIMEOUT,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Quote0-API/1.0'
        }
      });

      if (!response.data.success) {
        throw new Error(`API returned unsuccessful response: ${response.data.error_description}`);
      }

      const collections = response.data.collections;
      console.log(`[BinCollection] Fetched ${collections.length} collections from API`);

      // Update cache
      cache = {
        data: collections,
        timestamp: Date.now()
      };

      return collections;
    } catch (error) {
      console.error('[BinCollection] API fetch failed:', error.message);
      
      // Fallback to cached data even if expired
      if (cache.data) {
        console.warn('[BinCollection] Using expired cache due to API failure');
        return cache.data;
      }
      
      // No cache available, return empty array
      console.warn('[BinCollection] No cache available, returning empty array');
      return [];
    }
  }

  /**
   * Get tomorrow's bin collections with friendly names
   * @returns {Promise<Array>} Array of tomorrow's collections
   */
  async getTomorrowCollections() {
    try {
      const collections = await this.fetchCollections();
      const tomorrow = this.getTomorrowDate();
      
      console.log('[BinCollection] Filtering for tomorrow:', tomorrow.toDateString());

      const tomorrowCollections = collections
        .filter(c => {
          const collectionDate = this.parseDate(c.date);
          return collectionDate.toDateString() === tomorrow.toDateString();
        })
        .map(c => ({
          service: SERVICE_MAPPING[c.service] || c.service,
          originalService: c.service,
          date: c.date,
          day: c.day
        }));

      console.log(`[BinCollection] Found ${tomorrowCollections.length} collections for tomorrow`);
      
      if (tomorrowCollections.length > 0) {
        console.log('[BinCollection] Tomorrow collections:', tomorrowCollections.map(c => c.service).join(', '));
      }

      return tomorrowCollections;
    } catch (error) {
      console.error('[BinCollection] Error getting tomorrow collections:', error);
      return [];
    }
  }

  /**
   * Parse date string from API format (DD/MM/YYYY HH:MM:SS)
   * @param {string} dateString - Date string from API
   * @returns {Date} Parsed date object
   */
  parseDate(dateString) {
    // Parse "03/02/2026 00:00:00" format
    const [datePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('/');
    return new Date(year, month - 1, day);
  }

  /**
   * Get tomorrow's date at midnight
   * @returns {Date} Tomorrow's date
   */
  getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Check if cache is still valid
   * @returns {boolean} True if cache is valid
   */
  isCacheValid() {
    if (!cache.data || !cache.timestamp) {
      return false;
    }
    
    const age = Date.now() - cache.timestamp;
    const maxAge = CACHE_TTL_HOURS * 60 * 60 * 1000;
    const isValid = age < maxAge;
    
    if (!isValid) {
      console.log(`[BinCollection] Cache expired (age: ${Math.round(age / 1000 / 60)} minutes)`);
    }
    
    return isValid;
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache() {
    cache = { data: null, timestamp: null };
    console.log('[BinCollection] Cache cleared');
  }
}

module.exports = new BinCollectionService();
