const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function getUser() {
  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  const user = users.users.find(u => u.email === 'miserrano75@gmail.com');
  console.log('User:', JSON.stringify(user, null, 2));
}

getUser();
