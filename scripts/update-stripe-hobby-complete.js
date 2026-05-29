/* eslint-disable @typescript-eslint/no-var-requires */
const Stripe = require('stripe');
const { neon } = require('@neondatabase/serverless');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ NEON_DATABASE_URL or DATABASE_URL environment variable is required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
});

const sql = neon(DATABASE_URL);

async function updateHobbyPlan() {
  try {
    const productId = process.env.STRIPE_PRODUCT_HOBBY_ID;
    if (!productId) {
      console.error('❌ STRIPE_PRODUCT_HOBBY_ID environment variable is required');
      process.exit(1);
    }

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

    console.log('\n🔄 Step 3: Updating Neon pricing_plans table...');

    const data = await sql`
      update pricing_plans
      set stripe_price_id = ${price.id},
          stripe_product_id = ${productId},
          name = 'Hobby',
          price_cents = 1000,
          updated_at = now()
      where tier = 'hobby'
        and interval = 'month'
      returning *
    `;

    if (data.length === 0) {
      throw new Error('No Hobby monthly pricing_plans row found to update');
    }

    console.log('✅ Updated Neon pricing_plans:', data);

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
