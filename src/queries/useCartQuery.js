import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";

/**
 * Placeholder for future cart REST hydration (cart is localStorage-first today).
 */
export function useCartSummaryQuery(cartId) {
  return useQuery({
    queryKey: queryKeys.cart.summary(cartId),
    queryFn: async () => ({}),
    enabled: false,
    staleTime: Infinity,
  });
}
