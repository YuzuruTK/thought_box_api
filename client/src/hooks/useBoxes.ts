import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../services/api";

const BOXES_KEY = ["boxes"] as const;

export function useBoxes() {
  return useQuery({
    queryKey: BOXES_KEY,
    queryFn: api.listBoxes,
  });
}

export function useCreateBox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createBox(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BOXES_KEY });
    },
  });
}

export function useDeleteBox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (boxId: number) => api.deleteBox(boxId),
    onSuccess: (_data, boxId) => {
      // Generated documents and thoughts are filtered by this box — drop them.
      void queryClient.invalidateQueries({ queryKey: BOXES_KEY });
      void queryClient.removeQueries({ queryKey: ["thoughts", boxId] });
      void queryClient.removeQueries({ queryKey: ["documents", boxId] });
    },
  });
}
