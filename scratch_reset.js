const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function resetPassword() {
    try {
        const { data: usersData, error: errList } = await supabase.auth.admin.listUsers();
        if (errList) throw errList;

        const targetUser = usersData.users.find(u => u.email === 'miserrano75@gmail.com');
        if (!targetUser) {
            console.log('User not found. Trying to create it...');
            const { data: newUser, error: errCreate } = await supabase.auth.admin.createUser({
                email: 'miserrano75@gmail.com',
                password: 'LamdaPassword2026!',
                email_confirm: true
            });
            if (errCreate) throw errCreate;
            console.log('User created with password: LamdaPassword2026!');
            return;
        }

        const { data, error } = await supabase.auth.admin.updateUserById(targetUser.id, {
            password: 'LamdaPassword2026!'
        });

        if (error) {
            console.error('Error updating password:', error);
        } else {
            console.log('Password successfully reset to: LamdaPassword2026!');
        }
    } catch (e) {
        console.error(e);
    }
}

resetPassword();
