import { type DependencyList, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (updater: T | ((prev: T | undefined) => T | undefined)) => void;
}

interface State<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
}

const sameDeps = (a: DependencyList, b: DependencyList) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const toApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "Something went wrong."));

/** Minimal data-loading hook: runs the loader when deps change and ignores stale responses. */
export function useApi<T>(loader: () => Promise<T>, deps: DependencyList): ApiState<T> {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null, loading: true });
  const [trackedDeps, setTrackedDeps] = useState<DependencyList>(deps);
  const generation = useRef(0);
  const loaderRef = useRef(loader);

  useLayoutEffect(() => {
    loaderRef.current = loader;
  });

  // When deps change, flip to loading in the same render instead of after an effect.
  if (!sameDeps(trackedDeps, deps)) {
    setTrackedDeps(deps);
    setState((s) => ({ ...s, loading: true, error: null }));
  }

  const fetchInto = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await loaderRef.current();
      if (current === generation.current) setState({ data: result, error: null, loading: false });
    } catch (e) {
      if (current === generation.current) setState((s) => ({ ...s, error: toApiError(e), loading: false }));
    }
  }, []);

  useEffect(() => {
    void fetchInto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    await fetchInto();
  }, [fetchInto]);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T | undefined)) => {
    setState((s) => ({
      ...s,
      data: typeof updater === "function" ? (updater as (p: T | undefined) => T | undefined)(s.data) : updater,
    }));
  }, []);

  return { ...state, reload, setData };
}
