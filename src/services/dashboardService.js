/**
 * Dashboard Service
 * Builds the Quote/0 dashboard screen and pushes it through the Canvas API (DASHBOARD_DEVICE, default 48F6EE543F1C):
 *   title row : date (left) + weather and max/min temperature (right)
 *   3 rows    : upcoming events (date | detail)
 *   1 row     : tomorrow's bin collection reminder
 */

const binCollectionDbService = require('./binCollectionDbService');
const dynamoDbService = require('./dynamoDbService');
const weatherService = require('./weatherService');
const quote0CanvasService = require('./quote0CanvasService');

const BIN_NAMES = {
  'Domestic Waste Collection Service': 'Grey bin',
  'Recycling Collection Service': 'Red bin',
  'Food Waste Collection Service': 'Food waste'
};

function todayInLondon() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

class DashboardService {
  /**
   * Gather today's data and build the dashboard fields.
   * @param {Array} [binCollections] - tomorrow's collections if already loaded
   */
  async build(binCollections) {
    const today = todayInLondon();
    const [bins, upcoming, weather] = await Promise.all([
      binCollections ? Promise.resolve(binCollections) : binCollectionDbService.getTomorrowCollections(),
      dynamoDbService.getUpcomingEvents(today, 3),
      weatherService.getToday()
    ]);

    const names = [...new Set(bins.map(b => BIN_NAMES[b.service] || b.service))];
    const now = new Date();

    return {
      title: `${today.slice(8, 10)}/${today.slice(5, 7)} ${new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', weekday: 'short'
      }).format(now)}`, // e.g. "22/11 Sun"
      weather: weather ? weather.text : '',
      events: upcoming.map(e => ({
        // today's events show detail only; future events show "dd/mm" + detail
        date: e.date === today ? '' : `${e.date.slice(8, 10)}/${e.date.slice(5, 7)}`,
        text: String(e.event).replace(/\s*\n\s*/g, ' ')
      })),
      bin: names.length ? `Collect ${names.join(', ')} tmr` : ''
    };
  }

  /**
   * Build and push the dashboard.
   * @param {Array} [binCollections]
   * @param {Array<string|number>} [devices] - device serial numbers; defaults to DASHBOARD_DEVICE
   * @returns {Promise<{data: Object, results: Object}>}
   */
  async refresh(binCollections, devices) {
    const data = await this.build(binCollections);
    console.log('[Dashboard] Data:', JSON.stringify(data));
    const results = await quote0CanvasService.postDashboard(data, devices);
    return { data, results };
  }
}

module.exports = new DashboardService();
