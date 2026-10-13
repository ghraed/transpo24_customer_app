import { AppState, Platform } from "react-native";
import { getApiBaseUrl } from "@/config/backend";
import {
  authenticatedFetch,
  getAccessToken,
  getAuthSessionSnapshot,
  refreshAccessToken,
} from "./auth-token";
import { toFormDataFile } from "@/utils/upload-file";
import {
  isRegistrationExtraction,
  type RegistrationExtraction,
} from "@/types/registration";
import type { LocalPhotoAsset } from "@/types/customer-request";

export type ScanPhase = "queued" | "processing";
type ScanJob = {
  jobId: string;
  status: ScanPhase | "completed" | "failed" | "cancelled" | "expired";
  expiresAt: string;
  result?: RegistrationExtraction;
  error?: { code: string };
};
const failure = (code: string) => Object.assign(new Error(code), { code });

function parseJob(value: unknown): ScanJob {
  if (!value || typeof value !== "object")
    throw failure("REGISTRATION_INVALID_OUTPUT");
  const job = value as ScanJob;
  if (
    typeof job.jobId !== "string" ||
    !/^[0-9a-f-]{36}$/.test(job.jobId) ||
    ![
      "queued",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "expired",
    ].includes(job.status) ||
    typeof job.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(job.expiresAt)) ||
    (job.status === "completed" && !isRegistrationExtraction(job.result))
  )
    throw failure("REGISTRATION_INVALID_OUTPUT");
  return job;
}

// Wait without polling a backgrounded app. Returning to foreground wakes immediately.
function waitForPoll(signal: AbortSignal, delay: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      subscription?.remove();
      signal.removeEventListener("abort", abort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(failure("REGISTRATION_CANCELLED"));
    };
    subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") finish();
    });
    if (!AppState.currentState || AppState.currentState === "active")
      timer = setTimeout(finish, delay);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function extractRegistrationCard(
  photos: LocalPhotoAsset[],
  options: {
    signal: AbortSignal;
    onProgress?: (progress: number) => void;
    onStatus?: (status: ScanPhase) => void;
    onAccepted?: (cancel: () => Promise<void>) => void;
  },
): Promise<RegistrationExtraction> {
  const owner = getAuthSessionSnapshot().user?.id;
  let cancellationToken = getAccessToken();
  const base = `${getApiBaseUrl()}/vehicles/registration-extractions`;
  const controller = new AbortController();
  let jobId: string | undefined;
  let timedOut = false;
  let finished = false;
  const cancelRemote = async () => {
    if (!jobId || !cancellationToken) return;
    const cancel = new AbortController();
    const timeout = setTimeout(() => cancel.abort(), 5000);
    try {
      await fetch(`${base}/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${cancellationToken}` },
        signal: cancel.signal,
      });
    } catch {
      /* Server expiration cleans up when cancellation cannot reach it. */
    } finally {
      clearTimeout(timeout);
    }
  };
  const abort = () => {
    controller.abort();
    if (!finished) void cancelRemote();
  };
  options.signal.addEventListener("abort", abort, { once: true });
  let deadline = Date.now() + 300000;
  let deadlineTimer = setTimeout(() => {
    timedOut = true;
    abort();
  }, 300000);
  const assertOwner = () => {
    if (
      !owner ||
      getAuthSessionSnapshot().user?.id !== owner ||
      options.signal.aborted ||
      controller.signal.aborted
    )
      throw failure(
        timedOut ? "REGISTRATION_TIMEOUT" : "REGISTRATION_CANCELLED",
      );
  };
  const apiError = (status: number, value: unknown) => {
    const code =
      value && typeof value === "object" && "code" in value
        ? String(value.code)
        : "";
    return failure(
      code.startsWith("REGISTRATION_")
        ? code
        : status === 401
          ? "REGISTRATION_AUTH_REQUIRED"
          : status === 413
            ? "REGISTRATION_INVALID_UPLOAD"
            : status === 404
              ? "REGISTRATION_TIMEOUT"
              : "REGISTRATION_UNAVAILABLE",
    );
  };
  const upload = async (): Promise<ScanJob> => {
    assertOwner();
    const form = new FormData();
    for (const [index, photo] of photos.entries()) {
      const file = toFormDataFile(photo, index);
      if (Platform.OS === "web") {
        const response = await fetch(photo.uri, { signal: controller.signal });
        form.append("images", await response.blob(), file.name);
      } else form.append("images", file as unknown as Blob);
    }
    assertOwner();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const stop = () => xhr.abort();
      const cleanup = () =>
        controller.signal.removeEventListener("abort", stop);
      if (__DEV__)
        console.info("[RegistrationScan] Sending scan", {
          apiOrigin: new URL(getApiBaseUrl()).origin,
        });
      xhr.open("POST", base);
      const token = getAccessToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 30000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          options.onProgress?.(event.loaded / event.total);
      };
      xhr.upload.onload = () => options.onProgress?.(1);
      xhr.onload = () => {
        cleanup();
        try {
          let value: unknown;
          try {
            value = JSON.parse(xhr.responseText);
          } catch {
            throw failure("REGISTRATION_INVALID_OUTPUT");
          }
          if (xhr.status !== 202) throw apiError(xhr.status, value);
          const job = parseJob(value);
          jobId = job.jobId;
          // Acceptance can race a user cancellation. Always discard and cancel that job.
          try {
            assertOwner();
          } catch (error) {
            void cancelRemote();
            throw error;
          }
          options.onAccepted?.(cancelRemote);
          resolve(job);
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => {
        cleanup();
        reject(failure("REGISTRATION_UNAVAILABLE"));
      };
      xhr.ontimeout = () => {
        cleanup();
        reject(failure("REGISTRATION_TIMEOUT"));
      };
      xhr.onabort = () => {
        cleanup();
        reject(failure("REGISTRATION_CANCELLED"));
      };
      controller.signal.addEventListener("abort", stop, { once: true });
      if (controller.signal.aborted) {
        cleanup();
        reject(failure("REGISTRATION_CANCELLED"));
        return;
      }
      xhr.send(form);
    });
  };
  try {
    assertOwner();
    let job: ScanJob;
    try {
      job = await upload();
    } catch (error) {
      if ((error as { code?: string }).code !== "REGISTRATION_AUTH_REQUIRED")
        throw error;
      assertOwner();
      if (!(await refreshAccessToken())) throw error;
      assertOwner();
      cancellationToken = getAccessToken();
      job = await upload(); // Only an explicit authentication rejection permits re-upload.
    }
    deadline = Math.min(deadline, Date.parse(job.expiresAt));
    clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(
      () => {
        timedOut = true;
        abort();
      },
      Math.max(1, deadline - Date.now()),
    );
    for (;;) {
      assertOwner();
      if (job.status === "completed") {
        finished = true;
        return job.result!;
      }
      if (job.status === "expired") throw failure("REGISTRATION_TIMEOUT");
      if (job.status === "cancelled") throw failure("REGISTRATION_CANCELLED");
      if (job.status === "failed")
        throw failure(
          job.error?.code?.startsWith("REGISTRATION_")
            ? job.error.code
            : "REGISTRATION_UNAVAILABLE",
        );
      options.onStatus?.(job.status);
      await waitForPoll(controller.signal, 2000);
      assertOwner();
      if (AppState.currentState && AppState.currentState !== "active") continue;
      const request = new AbortController();
      const stop = () => request.abort();
      controller.signal.addEventListener("abort", stop, { once: true });
      const timeout = setTimeout(stop, 10000);
      try {
        const response = await authenticatedFetch(
          `${base}/${encodeURIComponent(jobId!)}`,
          { signal: request.signal },
        );
        assertOwner();
        cancellationToken = getAccessToken();
        const value: unknown = await response.json();
        if (!response.ok) throw apiError(response.status, value);
        job = parseJob(value);
        if (job.jobId !== jobId) throw failure("REGISTRATION_INVALID_OUTPUT");
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", stop);
      }
    }
  } catch (error) {
    if (jobId && !finished) void cancelRemote();
    if (timedOut) throw failure("REGISTRATION_TIMEOUT");
    if (controller.signal.aborted || options.signal.aborted)
      throw failure("REGISTRATION_CANCELLED");
    if (!(error as { code?: string })?.code)
      throw failure("REGISTRATION_UNAVAILABLE");
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
    options.signal.removeEventListener("abort", abort);
  }
}
