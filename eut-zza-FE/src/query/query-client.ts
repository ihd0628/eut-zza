import { QueryClient } from "@tanstack/react-query";

// React render와 무관하게 한 번만 만들어 Query Cache가 유지되도록 한다.
export const queryClient = new QueryClient();
