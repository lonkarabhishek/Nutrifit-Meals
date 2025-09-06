import { createClient } from '@supabase/supabase-js'

// Note: This script is intended to be run from the Supabase Studio or via the Supabase CLI.
// It requires the SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Seeding database...');

  // Clean up existing data
  await supabase.from('deliveries').delete().neq('id', 0);
  await supabase.from('pauses').delete().neq('id', 0);
  await supabase.from('subscriptions').delete().neq('id', 0);
  await supabase.from('addresses').delete().neq('id', 0);
  await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Keep the super admin if any
  // Note: Deleting users is more complex and might require special handling.
  // For this seed script, we assume we can start with a clean profiles table.

  // Create Users and Profiles
  const users = [
    { email: 'admin@nutrifit.com', password: 'password', role: 'admin', full_name: 'Admin User' },
    { email: 'chef@nutrifit.com', password: 'password', role: 'chef', full_name: 'Chef User' },
    { email: 'driver@nutrifit.com', password: 'password', role: 'driver', full_name: 'Driver User' },
    { email: 'client1@example.com', password: 'password', role: 'client', full_name: 'Aarav Sharma' },
    { email: 'client2@example.com', password: 'password', role: 'client', full_name: 'Diya Patel' },
    { email: 'client3@example.com', password: 'password', role: 'client', full_name: 'Rohan Mehta' },
  ];

  const createdUsers = [];
  for (const user of users) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true });
    if (authError) { console.error(`Error creating user ${user.email}:`, authError.message); continue; }
    const { data: profileData, error: profileError } = await supabase.from('profiles').insert({ id: authData.user.id, role: user.role, full_name: user.full_name }).select().single();
    if (profileError) { console.error(`Error creating profile for ${user.email}:`, profileError.message); continue; }
    createdUsers.push(profileData);
    console.log(`Created user: ${user.email}`);
  }

  const clientProfiles = createdUsers.filter(u => u.role === 'client');

  // Create Addresses (Nashik)
  const addresses = [
    { user_id: clientProfiles[0]?.id, line1: '123 Gangapur Road', city: 'Nashik', pincode: '422013', lat: 20.0084, lng: 73.7639 },
    { user_id: clientProfiles[1]?.id, line1: '456 College Road', city: 'Nashik', pincode: '422005', lat: 19.9975, lng: 73.7898 },
    { user_id: clientProfiles[2]?.id, line1: '789 Trimbak Road', city: 'Nashik', pincode: '422002', lat: 19.9949, lng: 73.7534 },
  ];
  await supabase.from('addresses').insert(addresses);
  console.log('Created addresses');

  // Create Recipes
  const recipes = [
    { name: 'Grilled Chicken Salad', kcal: 350, protein_g: 40, carbs_g: 10, fats_g: 18 },
    { name: 'Paneer Tikka Bowl', kcal: 400, protein_g: 25, carbs_g: 20, fats_g: 25 },
    { name: 'Quinoa Pulao', kcal: 320, protein_g: 12, carbs_g: 55, fats_g: 8 },
    { name: 'Egg Curry', kcal: 450, protein_g: 20, carbs_g: 15, fats_g: 35 },
    { name: 'Tofu Stir Fry', kcal: 380, protein_g: 22, carbs_g: 30, fats_g: 18 },
    { name: 'Fish Curry', kcal: 420, protein_g: 35, carbs_g: 10, fats_g: 28 },
    { name: 'Dal Makhani', kcal: 380, protein_g: 15, carbs_g: 45, fats_g: 15 },
    { name: 'Chicken Biryani', kcal: 550, protein_g: 30, carbs_g: 60, fats_g: 20 },
    { name: 'Soya Chaap Masala', kcal: 410, protein_g: 28, carbs_g: 25, fats_g: 22 },
    { name: 'Mushroom Matar', kcal: 300, protein_g: 10, carbs_g: 35, fats_g: 14 },
  ];
  const { data: createdRecipes } = await supabase.from('recipes').insert(recipes).select();
  console.log('Created recipes');

  // Create Menu Templates
  const menuTemplates = [
    // Week 1
    { week_no: 1, dow: 1, recipe_id: createdRecipes[0].id }, // Mon: Grilled Chicken
    { week_no: 1, dow: 2, recipe_id: createdRecipes[1].id }, // Tue: Paneer Tikka
    { week_no: 1, dow: 3, recipe_id: createdRecipes[2].id }, // Wed: Quinoa Pulao
    { week_no: 1, dow: 4, recipe_id: createdRecipes[3].id }, // Thu: Egg Curry
    { week_no: 1, dow: 5, recipe_id: createdRecipes[4].id }, // Fri: Tofu Stir Fry
    { week_no: 1, dow: 6, recipe_id: createdRecipes[5].id }, // Sat: Fish Curry
    // Week 2
    { week_no: 2, dow: 1, recipe_id: createdRecipes[6].id }, // Mon: Dal Makhani
    { week_no: 2, dow: 2, recipe_id: createdRecipes[7].id }, // Tue: Chicken Biryani
    { week_no: 2, dow: 3, recipe_id: createdRecipes[8].id }, // Wed: Soya Chaap
    { week_no: 2, dow: 4, recipe_id: createdRecipes[9].id }, // Thu: Mushroom Matar
    { week_no: 2, dow: 5, recipe_id: createdRecipes[0].id }, // Fri: Grilled Chicken
    { week_no: 2, dow: 6, recipe_id: createdRecipes[1].id }, // Sat: Paneer Tikka
  ];
  await supabase.from('menu_templates').insert(menuTemplates);
  console.log('Created menu templates');

  // Create Subscriptions
  const today = new Date();
  const subscriptions = clientProfiles.map(profile => ({
    user_id: profile.id,
    status: 'active',
    start_date: today.toISOString().split('T')[0],
    next_billing_date: new Date(today.setMonth(today.getMonth() + 1)).toISOString().split('T')[0],
  }));
  await supabase.from('subscriptions').insert(subscriptions);
  console.log('Created subscriptions');

  console.log('Database seeding complete!');
}

main().catch(console.error);
