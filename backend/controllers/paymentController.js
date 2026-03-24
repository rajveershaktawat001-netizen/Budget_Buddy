import Stripe from "stripe";

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set in the environment");
  }

  return new Stripe(secretKey);
};

export async function createCheckoutSession(req, res) {
  const { amount, currency = "usd", description = "Wallet top-up" } = req.body;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: "A valid amount is required",
    });
  }

  try {
    const stripe = getStripeClient();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const normalizedAmount = Math.round(Number(amount) * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: req.user?.email,
      metadata: {
        userId: String(req.user?._id || ""),
        description,
      },
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: description,
            },
            unit_amount: normalizedAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/?payment=success`,
      cancel_url: `${frontendUrl}/?payment=cancel`,
    });

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("CreateCheckoutSession Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create checkout session",
    });
  }
}
