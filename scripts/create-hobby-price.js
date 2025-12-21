/**
 * Script to create Stripe Hobby plan price
 * Run with: node scripts/create-hobby-price.js
 * Requires STRIPE_SECRET_KEY environment variable
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

async function createHobbyPrice() {
  try {
    // Update existing FREE product to Hobby
    const productId = 'prod_StUbhCc9Y4aVwP'; // Existing FREE product

    // Update product name
    const product = await stripe.products.update(productId, {
      name: 'Hobby',
      description:
        'Perfect for getting started with AI automation. $10/month with 3-month free trial.',
    });

    console.log('✅ Updated product:', product.id, product.name);

    // Create monthly recurring price: $10/month
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: 1000, // $10.00 in cents
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });

    console.log('✅ Created price:', price.id);
    console.log('📋 Price ID to use:', price.id);
    console.log('📋 Product ID:', productId);
    console.log('\n⚠️  IMPORTANT: Add this to your environment variables:');
    console.log(`STRIPE_PRICE_HOBBY_MONTHLY=${price.id}`);

    return { productId, priceId: price.id };
  } catch (error) {
    console.error('❌ Error creating Hobby price:', error.message);
    throw error;
  }
}

if (require.main === module) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY environment variable is required');
    process.exit(1);
  }

  createHobbyPrice()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = { createHobbyPrice };
