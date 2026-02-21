import { spawnSync } from "node:child_process";

export type WindowsDpapiOperation = "protect" | "unprotect";

export type WindowsDpapiRunner = (operation: WindowsDpapiOperation, payloadBase64: string) => string;

export type WindowsDpapiCodec = {
  protectData: (payload: Buffer) => Buffer;
  unprotectData: (payload: Buffer) => Buffer;
};

const DPAPI_ENVIRONMENT_VARIABLE = "BEDCRAFT_DPAPI_INPUT_B64";

const PROTECT_SCRIPT = [
  `Add-Type -AssemblyName System.Security`,
  `$inputBase64 = $env:${DPAPI_ENVIRONMENT_VARIABLE}`,
  `if (-not $inputBase64) { throw "Missing ${DPAPI_ENVIRONMENT_VARIABLE}" }`,
  `$bytes = [Convert]::FromBase64String($inputBase64)`,
  `$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
  `[Console]::Out.Write([Convert]::ToBase64String($protected))`
].join("; ");

const UNPROTECT_SCRIPT = [
  `Add-Type -AssemblyName System.Security`,
  `$inputBase64 = $env:${DPAPI_ENVIRONMENT_VARIABLE}`,
  `if (-not $inputBase64) { throw "Missing ${DPAPI_ENVIRONMENT_VARIABLE}" }`,
  `$bytes = [Convert]::FromBase64String($inputBase64)`,
  `$unprotected = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
  `[Console]::Out.Write([Convert]::ToBase64String($unprotected))`
].join("; ");

const normalizeBase64 = (payload: string): string => payload.replace(/=+$/u, "");

const decodeBase64Strict = (payload: string, operation: WindowsDpapiOperation): Buffer => {
  if (typeof payload !== "string") throw new Error(`Windows DPAPI ${operation} returned non-string payload`);
  if (!payload) throw new Error(`Windows DPAPI ${operation} returned empty payload`);
  if (/\s/u.test(payload)) throw new Error(`Windows DPAPI ${operation} returned payload with unexpected whitespace`);
  const decoded = Buffer.from(payload, "base64");
  if (normalizeBase64(decoded.toString("base64")) !== normalizeBase64(payload)) {
    throw new Error(`Windows DPAPI ${operation} returned invalid base64 payload`);
  }
  return decoded;
};

const runWindowsDpapiCommand = (operation: WindowsDpapiOperation, payloadBase64: string): string => {
  const script = operation === "protect" ? PROTECT_SCRIPT : UNPROTECT_SCRIPT;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, [DPAPI_ENVIRONMENT_VARIABLE]: payloadBase64 }
  });
  if (result.error) throw new Error(`Windows DPAPI ${operation} failed to start PowerShell: ${result.error.message}`);
  if (result.status === 0 && typeof result.stdout === "string") return result.stdout;
  throw new Error(`Windows DPAPI ${operation} failed: ${typeof result.stderr === "string" ? result.stderr.trim() || "unknown error" : "unknown error"}`);
};

export const createWindowsDpapiCodec = (
  runner: WindowsDpapiRunner = runWindowsDpapiCommand
): WindowsDpapiCodec => {
  const runOperation = (operation: WindowsDpapiOperation, payload: Buffer): Buffer => {
    return decodeBase64Strict(runner(operation, payload.toString("base64")), operation);
  };
  return {
    protectData: (payload) => runOperation("protect", payload),
    unprotectData: (payload) => runOperation("unprotect", payload)
  };
};
