import type { ClaimStreakResponse } from "@social-matching/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import { keys } from "./queries";

/** Today's streak Rolls. Used on the home screen and in Me, which then show the same state. */
export function useClaimStreak() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<ClaimStreakResponse>("/rolls/streak/claim"),
    onSuccess: ({ streak, balance }) => {
      queryClient.setQueryData(keys.streak, streak);
      queryClient.setQueryData(keys.balance, balance);
      void queryClient.invalidateQueries({ queryKey: keys.ledger });
    },
  });
}
