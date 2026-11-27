/**
 * Weather Service
 * Today's weather summary from Open-Meteo (free, no API key): https://open-meteo.com
 * Defaults to Reading, UK. Override with WEATHER_LAT / WEATHER_LON.
 */

const axios = require('axios');

const LAT = process.env.WEATHER_LAT || '51.4543';
const LON = process.env.WEATHER_LON || '-0.9781';
const WINDY_KMH = 40; // daily max wind speed at/above this counts as "Windy" on otherwise dry days

// WMO weather codes -> short word
function describe(code, windKmh) {
  if (code >= 95) return 'Storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return code <= 57 ? 'Drizzle' : 'Rainy';
  if (code === 45 || code === 48) return 'Fog';
  if (windKmh >= WINDY_KMH) return 'Windy';
  if (code <= 1) return 'Sunny';
  return 'Cloudy';
}

class WeatherService {
  /**
   * @returns {Promise<{condition: string, max: number, min: number, text: string}|null>}
   *          null if the weather could not be fetched (the display still updates without it)
   */
  async getToday() {
    try {
      const res = await axios.get('https://api.open-meteo.com/v1/forecast', {
        timeout: 5000,
        params: {
          latitude: LAT,
          longitude: LON,
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max',
          timezone: 'Europe/London',
          forecast_days: 1
        }
      });
      const d = res.data.daily;
      const condition = describe(d.weather_code[0], d.wind_speed_10m_max[0]);
      const max = Math.round(d.temperature_2m_max[0]);
      const min = Math.round(d.temperature_2m_min[0]);
      const weather = { condition, max, min, text: `${condition} ${max}/${min}C` };
      console.log('[Weather] Today:', weather);
      return weather;
    } catch (error) {
      console.error('[Weather] Failed to fetch weather:', error.message);
      return null;
    }
  }
}

module.exports = new WeatherService();
module.exports.describe = describe;
