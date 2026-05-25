import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query/queryKeys";

/**
 * Stub — wire when customer order polling is centralized.
 */
export function useCustomerOrderQuery(orderId, options = {}) {
  const enabled =
    typeof options.enabled === "boolean"
      ? options.enabled
      : Boolean(orderId);

  return useQuery({
    queryKey: queryKeys.orders.customer(orderId),
    queryFn: async () => null,
    enabled: false,
    staleTime: Infinity,
  });
}
