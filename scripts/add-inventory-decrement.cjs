const fs = require('fs');
let content = fs.readFileSync('server/routes/aiosell.js', 'utf8');

const inventoryDecrementCode = `
      await supabase.from('channel_ota_reservations').insert(insertData);
      await logSync(hotelId, 'AIOSELL_RESERVATION_BOOK', 'inbound', 'success', \`Created booking \${bookingId}\`);

      // Decrement inventory
      try {
        const { data: mapping } = await supabase
          .from('channel_rate_mappings')
          .select('room_category_id')
          .eq('hotel_id', hotelId)
          .eq('external_room_code', roomCode)
          .maybeSingle();

        if (mapping && mapping.room_category_id) {
          const datesToUpdate = getDates(checkIn, new Date(new Date(checkOut).getTime() - 86400000).toISOString().split('T')[0]);
          for (const d of datesToUpdate) {
            const { data: restriction } = await supabase
              .from('channel_inventory_restrictions')
              .select('id, availability')
              .eq('hotel_id', hotelId)
              .eq('room_category_id', mapping.room_category_id)
              .eq('date', d)
              .maybeSingle();
            
            if (restriction) {
               await supabase
                .from('channel_inventory_restrictions')
                .update({ availability: Math.max(0, restriction.availability - 1) })
                .eq('id', restriction.id);
            }
          }
        }
      } catch (e) {
        console.error('Error decrementing inventory:', e);
      }
`;

content = content.replace(
  "      await supabase.from('channel_ota_reservations').insert(insertData);\n      await logSync(hotelId, 'AIOSELL_RESERVATION_BOOK', 'inbound', 'success', `Created booking ${bookingId}`);",
  inventoryDecrementCode
);

fs.writeFileSync('server/routes/aiosell.js', content, 'utf8');
