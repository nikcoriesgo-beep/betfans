import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    try {
      const event = JSON.parse(payload.toString());
      await WebhookHandlers.handleSubscriptionEvent(event);
    } catch (err: any) {
      console.error('App-level webhook processing error (non-fatal):', err.message);
    }
  }

  static async handleSubscriptionEvent(event: any): Promise<void> {
    const type = event.type;

    if (type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const amountPaid = (invoice.amount_paid || 0) / 100;
      const customerId = invoice.customer;
      const user = await storage.getUserByStripeCustomerId(customerId);
      const prizeContribution = amountPaid * 0.5;
      if (prizeContribution > 0) {
        await storage.addPrizePoolContribution(
          prizeContribution,
          'subscription',
          invoice.payment_intent || invoice.id,
          user?.id || null
        );
        console.log(`Prize pool: +$${prizeContribution.toFixed(2)} from ${user?.id || customerId}`);
      }

      if (user) {
        const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map((id: string) => id.trim()).filter(Boolean);
        const founderId = adminIds[0];
        const isFounder = founderId === user.id;

        if (isFounder && amountPaid >= 99) {
          const existingTxs = await storage.getUserTransactions(user.id);
          const alreadyGotBonus = existingTxs.some(
            (tx: any) => tx.type === 'referral_bonus' && tx.description?.includes('Founder instant')
          );
          if (!alreadyGotBonus) {
            await storage.createTransaction({
              userId: user.id,
              type: 'referral_bonus',
              amount: 50,
              description: 'Founder instant referral payout — 50% of first Legend payment',
              status: 'completed',
              stripePaymentId: invoice.payment_intent || invoice.id,
            });
            console.log(`Founder instant referral bonus: $50.00 credited to ${user.id}`);
          }
        }

        const referredBy = user.referredBy;
        if (referredBy && founderId) {
          const referrerId = referredBy === 'NIKCOX' ? founderId : referredBy;
          if (referrerId !== user.id) {
            const referrer = await storage.getUser(referrerId);
            if (referrer) {
              const isReferrerFounder = referrerId === founderId || referredBy === 'NIKCOX';
              const referrerTier = referrer.membershipTier || 'rookie';
              const isLegendReferral = amountPaid >= 99;
              let residualAmount = 1;
              if (isReferrerFounder || referrerTier === 'legend') {
                residualAmount = isLegendReferral ? 50 : 1;
              }
              const existingTxs = await storage.getUserTransactions(referrerId);
              const paymentId = invoice.payment_intent || invoice.id;
              const alreadyPaid = existingTxs.some((tx: any) => tx.stripePaymentId === paymentId && tx.type === 'referral_residual');
              if (!alreadyPaid) {
                await storage.createTransaction({
                  userId: referrerId,
                  type: 'referral_residual',
                  amount: residualAmount,
                  description: `Residual referral income from ${user.firstName || 'member'} — $${residualAmount}/mo`,
                  status: 'completed',
                  stripePaymentId: paymentId,
                });
                console.log(`Residual referral: $${residualAmount} credited to ${referrerId}`);
              }
            }
          }
        }
      }
    }

    if (
      type === 'customer.subscription.created' ||
      type === 'customer.subscription.updated' ||
      type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const status = subscription.status;

      const user = await storage.getUserByStripeCustomerId(customerId);
      if (!user) return;

      if (type === 'customer.subscription.deleted' || status === 'canceled' || status === 'unpaid') {
        await storage.updateUser(user.id, {
          membershipTier: 'free',
          stripeSubscriptionId: null,
        });
        return;
      }

      if (status === 'active' || status === 'trialing') {
        let tier = 'pro';

        try {
          const stripe = await getUncachableStripeClient();
          const items = subscription.items?.data || [];
          if (items.length > 0) {
            const priceId = items[0].price?.id;
            if (priceId) {
              const price = await stripe.prices.retrieve(priceId);
              const product = await stripe.products.retrieve(price.product as string);
              const productName = product.name?.toLowerCase() || '';
              if (productName.includes('legend')) {
                tier = 'legend';
              } else if (productName.includes('rookie')) {
                tier = 'rookie';
              }
            }
          }
        } catch {}

        await storage.updateUser(user.id, {
          membershipTier: tier,
          stripeSubscriptionId: subscription.id,
        });
      }
    }
  }
}
