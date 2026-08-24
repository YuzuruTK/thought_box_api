import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../services/api";
import type { GeneratedDocument } from "../services/api";

export type DocType = GeneratedDocument["type"];

/** Cached summary + document for a box (either may be absent). */
export function useDocuments(boxId: number | null) {
  return useQuery({
    queryKey: ["documents", boxId],
    queryFn: () => api.listDocuments(boxId as number),
    enabled: boxId !== null,
  });
}

/**
 * Generation mutations for a box. Both are exposed together so the UI can
 * disable both buttons while either request is in flight.
 */
export function useGeneration(boxId: number | null) {
  const queryClient = useQueryClient();

  const onSuccess = () => {
    if (boxId !== null) {
      void queryClient.invalidateQueries({ queryKey: ["documents", boxId] });
    }
  };

  const summary = useMutation({
    mutationFn: () => {
      if (boxId === null) return Promise.reject(new Error("No box selected."));
      return api.generateSummary(boxId);
    },
    onSuccess,
    onSettled: onSuccess,
  });

  const document = useMutation({
    mutationFn: () => {
      if (boxId === null) return Promise.reject(new Error("No box selected."));
      return api.generateDocument(boxId);
    },
    onSuccess,
    onSettled: onSuccess,
  });

  const isGenerating = summary.isPending || document.isPending;

  return { summary, document, isGenerating };
}
