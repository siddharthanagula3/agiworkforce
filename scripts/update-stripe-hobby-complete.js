const Stripe = require('stripe');

const { createClient } = require('@supabase/supabase-js');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function updateHobbyPlan() {
  try {
    const productId = 'prod_StUbhCc9Y4aVwP';

    console.log('🔄 Step 1: Updating Stripe product...');

    const product = await stripe.products.update(productId, {
      name: 'Hobby',
      description:
        'Perfect for getting started with AI automation. $10/month with 3-month free trial.',
    });
    console.log('✅ Updated product:', product.id, product.name);

    console.log('\n🔄 Step 2: Creating new recurring price...');

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: 1000,
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });
    console.log('✅ Created price:', price.id);
    console.log('📋 Price ID:', price.id);
    console.log('📋 Product ID:', productId);

    console.log('\n🔄 Step 3: Updating Supabase pricing_plans table...');

    const { data, error } = await supabase
      .from('pricing_plans')
      .update({
        stripe_price_id: price.id,
        stripe_product_id: productId,
        name: 'Hobby',
        price_cents: 1000,
        updated_at: new Date().toISOString(),
      })
      .eq('tier', 'hobby')
      .eq('interval', 'month')
      .select();

    if (error) {
      console.error('❌ Error updating Supabase:', error);
      throw error;
    }

    console.log('✅ Updated Supabase pricing_plans:', data);

    console.log('\n✅ COMPLETE! Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Stripe Product ID:', productId);
    console.log('Stripe Price ID:', price.id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  NEXT STEP: Add to Vercel environment variables:');
    console.log(`STRIPE_PRICE_HOBBY_MONTHLY=${price.id}`);
    console.log('\nThen redeploy your Vercel project.');

    return { productId, priceId: price.id };
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

if (require.main === module) {
  updateHobbyPlan()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = { updateHobbyPlan };
