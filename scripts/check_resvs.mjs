import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  const { data, error } = await supabaseServiceRole.from('reservations').select('*').limit(5);
  console.log('Error:', error);
  console.log('Count:', data?.length);
  if (data?.length) {
    console.log('Keys in reservation row:', Object.keys(data[0]));
    console.log('Sample:', data[0]);
  }
}
main();
