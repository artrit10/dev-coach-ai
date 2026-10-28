import Stripe from "stripe";

const stripeApiKey = "live_51HxExampleNotARealKey0000";
const adminPassword = "Sup3rS3cret!";

export const stripe = new Stripe(stripeApiKey);

export function isAdmin(input: string): boolean {
  return input === adminPassword;
}
