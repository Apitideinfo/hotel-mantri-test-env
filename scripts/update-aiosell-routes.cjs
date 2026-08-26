const fs = require('fs');

const getDatesCode = `
// Helper to get dates array
const getDates = (start, end) => {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
};
`;

const inventoryPushCode = `
router.post('/inventory/push', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const supabase = getSupabase();
    const config = aiosellService.getConfig();

    // 1. Get active Aiosell mappings
    const { data: mappings } = await supabase
      .from('channel_rate_mappings')
      .select('room_category_id, external_room_code')
      .eq('hotel_id', hotelId)
      .eq('provider', 'aiosell')
      .eq('status', 'mapped');

    if (!mappings || mappings.length === 0) {
      throw new Error('No active Aiosell mappings found');
    }

    // 2. Get inventory restrictions
    const categoryIds = mappings.map(m => m.room_category_id);
    const { data: restrictions } = await supabase
      .from('channel_inventory_restrictions')
      .select('date, room_category_id, availability')
      .eq('hotel_id', hotelId)
      .in('room_category_id', categoryIds)
      .gte('date', startDate)
      .lte('date', endDate);

    // 3. Build payload
    const dates = getDates(startDate, endDate);
    const updates = dates.map(date => {
      const rooms = [];
      
      // We only want unique external room codes (since multiple rate plans might map to the same room)
      const uniqueRoomCodes = new Set();
      
      for (const mapping of mappings) {
        if (!mapping.external_room_code || uniqueRoomCodes.has(mapping.external_room_code)) continue;
        uniqueRoomCodes.add(mapping.external_room_code);
        
        const restriction = (restrictions || []).find(r => r.date === date && r.room_category_id === mapping.room_category_id);
        const available = restriction ? (restriction.availability || 0) : 0; // Default to 0 if no record
        
        rooms.push({
          roomCode: mapping.external_room_code,
          available: available
        });
      }
      
      return {
        startDate: date,
        endDate: date,
        rooms
      };
    }).filter(u => u.rooms.length > 0);

    const payload = {
      hotelCode: config.hotelCode,
      updates
    };

    const result = await aiosellService.pushInventory(payload);
    await logSync(hotelId, 'AIOSELL_INVENTORY_PUSH', 'outbound', 'success', 'Inventory pushed successfully');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_INVENTORY_PUSH', 'outbound', 'failure', 'Inventory push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});
`;

const ratePushCode = `
router.post('/rates/push', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const hotelId = req.headers['x-hotel-id'];
    const supabase = getSupabase();
    const config = aiosellService.getConfig();

    // 1. Get mappings
    const { data: mappings } = await supabase
      .from('channel_rate_mappings')
      .select('room_category_id, rate_plan_id, external_room_code, external_rate_plan_code')
      .eq('hotel_id', hotelId)
      .eq('provider', 'aiosell')
      .eq('status', 'mapped');

    if (!mappings || mappings.length === 0) {
      throw new Error('No active Aiosell mappings found');
    }

    // 2. Get categories and rate plans to find default tariffs
    const categoryIds = [...new Set(mappings.map(m => m.room_category_id))];
    const { data: categories } = await supabase.from('room_categories').select('id, default_tariff').in('id', categoryIds);
    
    // 3. Get inventory restrictions (which store overridden rates)
    const { data: restrictions } = await supabase
      .from('channel_inventory_restrictions')
      .select('date, room_category_id, channel_rate, base_rate')
      .eq('hotel_id', hotelId)
      .in('room_category_id', categoryIds)
      .gte('date', startDate)
      .lte('date', endDate);

    // 4. Build Payload
    const dates = getDates(startDate, endDate);
    const updates = dates.map(date => {
      const rates = [];
      
      for (const mapping of mappings) {
        if (!mapping.external_room_code || !mapping.external_rate_plan_code) continue;
        
        const restriction = (restrictions || []).find(r => r.date === date && r.room_category_id === mapping.room_category_id);
        const category = (categories || []).find(c => c.id === mapping.room_category_id);
        
        // If channel_rate is set, use it. Otherwise use base_rate. Otherwise fallback to category default_tariff.
        let rateValue = category ? (category.default_tariff || 0) : 0;
        if (restriction && restriction.channel_rate > 0) rateValue = restriction.channel_rate;
        else if (restriction && restriction.base_rate > 0) rateValue = restriction.base_rate;
        
        rates.push({
          roomCode: mapping.external_room_code,
          rateplanCode: mapping.external_rate_plan_code,
          rate: rateValue
        });
      }
      
      return {
        startDate: date,
        endDate: date,
        rates
      };
    }).filter(u => u.rates.length > 0);

    const payload = {
      hotelCode: config.hotelCode,
      updates
    };

    const result = await aiosellService.pushRates(payload);
    await logSync(hotelId, 'AIOSELL_RATE_PUSH', 'outbound', 'success', 'Rates pushed successfully');
    res.json(result);
  } catch (err) {
    await logSync(req.headers['x-hotel-id'], 'AIOSELL_RATE_PUSH', 'outbound', 'failure', 'Rates push failed', err.message);
    res.status(err.status || 500).json(err);
  }
});
`;

let content = fs.readFileSync('server/routes/aiosell.js', 'utf8');

// Inject getDates helper
if (!content.includes('getDates = (start, end)')) {
  content = content.replace('const router = express.Router();', 'const router = express.Router();\\n' + getDatesCode);
}

// Replace pushInventory
content = content.replace(/router\.post\('\/inventory\/push'[\s\S]*?\}\);/m, inventoryPushCode.trim());

// Replace pushRates
content = content.replace(/router\.post\('\/rates\/push'[\s\S]*?\}\);/m, ratePushCode.trim());

fs.writeFileSync('server/routes/aiosell.js', content, 'utf8');
console.log('Routes updated successfully!');
