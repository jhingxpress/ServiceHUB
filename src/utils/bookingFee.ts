/**
 * calcBookingFee
 *
 * Mirrors the `calculate_platform_fee()` SQL function in
 * supabase/migrations/20260705000001_platform_fee_phase1.sql.
 *
 * Given a service price in pesos, returns the TAGA Booking Fee
 * (= provider platform fee) that the customer pays on top of the
 * service price.  Returns 0 for prices below ₱1 (no fee bracket).
 */
export function calcBookingFee(servicePrice: number): number {
  if (servicePrice < 1)      return 0;
  if (servicePrice <= 199)   return 5;
  if (servicePrice <= 500)   return 10;
  if (servicePrice <= 1000)  return 30;
  if (servicePrice <= 3000)  return 50;
  if (servicePrice <= 5000)  return 100;
  if (servicePrice <= 8000)  return 150;
  if (servicePrice <= 12000) return 200;
  if (servicePrice <= 16000) return 250;
  return 300;
}
