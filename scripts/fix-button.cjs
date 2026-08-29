const fs = require('fs');
let content = fs.readFileSync('src/screens/channel/ChannelManager.tsx', 'utf8');

const target = `          <button
            onClick={async () => { setSaving(true); await onSave(aiosellRoomCode, aiosellRatePlan); setSaving(false); }}`;

const replacement = `          <button
            onClick={async () => { 
              setSaving(true); 
              let roomName = '';
              let rateName = '';
              if (aiosellMapping?.rooms) {
                roomName = aiosellMapping.rooms.find((r) => r.room_id === aiosellRoomCode)?.room_name || '';
              }
              if (aiosellMapping?.ratePlans) {
                rateName = aiosellMapping.ratePlans.find((rp) => rp.rate_plan_id === aiosellRatePlan)?.rate_plan_name || '';
              }
              await onSave(aiosellRoomCode, aiosellRatePlan, roomName, rateName); 
              setSaving(false); 
            }}`;

content = content.replace(target, replacement);

fs.writeFileSync('src/screens/channel/ChannelManager.tsx', content, 'utf8');
console.log('Successfully replaced content in ChannelManager.tsx');
