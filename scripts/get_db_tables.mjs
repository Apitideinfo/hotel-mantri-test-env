import { supabaseServiceRole } from '../server/supabaseClient.js';

async function main() {
  const { data, error } = await supabaseServiceRole.rpc('get_tables');
  if (error) {
    // If no get_tables rpc, try querying postgres tables via direct select or inspect error
    console.log('RPC get_tables error:', error.message);
  } else {
    console.log('Tables:', data);
  }
}
main();
