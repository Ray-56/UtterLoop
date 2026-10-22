import { useCallback, useEffect, useRef, useState } from "react";
import {
  LocalDataChangedError,
  PracticeOwnershipLostError,
  type LocalDataAccess,
} from "../../application/ports/LocalDataAccess";

export type PracticeOwnershipStatus =
  | "inactive"
  | "checking"
  | "owned"
  | "in-use"
  | "lost"
  | "stale"
  | "error";

export interface PracticeOwnershipState {
  status: PracticeOwnershipStatus;
  message: string | null;
}

export function usePracticeOwnership(access: Partial<LocalDataAccess>, active: boolean) {
  const { acquirePracticeOwnership, renewPracticeOwnership, releasePracticeOwnership } = access;
  const [state, setState] = useState<PracticeOwnershipState>({ status: "inactive", message: null });
  const [request, setRequest] = useState(0);
  const takeoverRequested = useRef(false);
  const retry = useCallback(() => {
    takeoverRequested.current = false;
    setRequest((current) => current + 1);
  }, []);
  const takeOver = useCallback(() => {
    takeoverRequested.current = true;
    setRequest((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!active) {
      takeoverRequested.current = false;
      setState({ status: "inactive", message: null });
      return;
    }
    if (!acquirePracticeOwnership || !renewPracticeOwnership || !releasePracticeOwnership) {
      setState({ status: "owned", message: null });
      return;
    }

    let disposed = false;
    let token: string | undefined;
    let renewing = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const shouldTakeOver = takeoverRequested.current;
    takeoverRequested.current = false;
    setState({ status: "checking", message: null });

    function fail(error: unknown) {
      if (disposed) return;
      if (timer) clearInterval(timer);
      setState({
        status: error instanceof LocalDataChangedError ? "stale"
          : error instanceof PracticeOwnershipLostError ? "lost" : "error",
        message: error instanceof Error ? error.message : "Practice ownership could not be checked. Retry before continuing.",
      });
    }

    async function renew() {
      if (!token || disposed || renewing || !renewPracticeOwnership) return;
      renewing = true;
      try {
        await renewPracticeOwnership(token);
      } catch (error) {
        fail(error);
      } finally {
        renewing = false;
      }
    }

    async function claim() {
      try {
        const result = await acquirePracticeOwnership!({ takeOver: shouldTakeOver });
        if (disposed) {
          if (result.status === "owned") await releasePracticeOwnership!(result.token);
          return;
        }
        if (result.status === "in-use") {
          setState({
            status: "in-use",
            message: "Practice is already open in another tab. Return there, retry after closing it, or take over here.",
          });
          return;
        }
        token = result.token;
        setState({ status: "owned", message: null });
        timer = setInterval(() => void renew(), 10_000);
      } catch (error) {
        fail(error);
      }
    }

    void claim();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void renew();
    };
    window.addEventListener("focus", renew);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", renew);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (token) void releasePracticeOwnership(token).catch(() => undefined);
    };
  }, [active, acquirePracticeOwnership, renewPracticeOwnership, releasePracticeOwnership, request]);

  return { ...state, retry, takeOver };
}
