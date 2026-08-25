import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../services/api";
import type { GeneratedDocument } from "../services/api";

export type DocType = GeneratedDocument["type"];

/** Cached summary (resume) + document for a box (either may be absent). */
export function useDocuments(boxId: number | null) {
  return useQuery({
    queryKey: ["documents", boxId],
    queryFn: () => api.listDocuments(boxId as number),
    enabled: boxId !== null,
  });
}

/** Single blended synthesis mutation for a box (resume + document). */
export function useSynthesize(boxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (boxId === null) return Promise.reject(new Error("No box selected."));
      return api.generateDocument(boxId);
    },
    onSettled: () => {
      if (boxId !== null) {
        void queryClient.invalidateQueries({ queryKey: ["documents", boxId] });
        // Grid card previews read the summary row, which also just changed.
        void queryClient.invalidateQueries({ queryKey: ["boxes"] });
      }
    },
  });
}
