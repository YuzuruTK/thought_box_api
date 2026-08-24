import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../services/api";
import type { Thought } from "../services/api";

/**
 * Thoughts for a box. The API returns them newest-first
 * (`ORDER BY created_at DESC, id DESC`), so optimistic inserts prepend.
 */
export function useThoughts(boxId: number | null) {
  return useQuery({
    queryKey: ["thoughts", boxId],
    queryFn: () => api.listThoughts(boxId as number),
    enabled: boxId !== null,
  });
}

/** Enter-to-create with optimistic append; the input never loses focus. */
export function useCreateThought(boxId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => {
      if (boxId === null) {
        return Promise.reject(new Error("No box selected."));
      }
      return api.createThought(content, [boxId]);
    },
    onMutate: async (content) => {
      if (boxId === null) return { previous: undefined as Thought[] | undefined };
      const key = ["thoughts", boxId] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Thought[]>(key);
      const optimistic: Thought = {
        id: -Date.now(), // temporary id until the server responds
        content,
        aiTitle: null,
        aiSummary: null,
        tags: [],
        boxes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Thought[]>(key, [optimistic, ...(previous ?? [])]);
      return { previous };
    },
    onError: (_error, _content, context) => {
      // Roll back the optimistic insert on failure.
      if (boxId !== null && context?.previous) {
        queryClient.setQueryData(["thoughts", boxId], context.previous);
      }
    },
    onSettled: () => {
      if (boxId !== null) {
        void queryClient.invalidateQueries({ queryKey: ["thoughts", boxId] });
      }
    },
  });
}

export function useDeleteThought(boxId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (thoughtId: number) => api.deleteThought(thoughtId),
    onSuccess: () => {
      if (boxId !== null) {
        void queryClient.invalidateQueries({ queryKey: ["thoughts", boxId] });
      }
    },
  });
}
