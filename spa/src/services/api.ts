import type { FintocAccount, Institution } from "@/lib/types";

const API_BASE = "/api";

// ── HTTP helpers ─────────────────────────────────────────

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ── Fintoc Data (accounts, institutions) ─────────────────

export async function fetchAccounts(): Promise<FintocAccount[]> {
  const response = await fetch(`${API_BASE}/accounts`);
  return handleResponse<FintocAccount[]>(response);
}

export async function fetchAccount(accountId: string): Promise<FintocAccount> {
  const response = await fetch(`${API_BASE}/accounts/${accountId}`);
  return handleResponse<FintocAccount>(response);
}

export async function fetchInstitutions(): Promise<Institution[]> {
  const response = await fetch(`${API_BASE}/institutions`);
  return handleResponse<Institution[]>(response);
}

// ── Simulate (test mode) ────────────────────────────────

export async function simulateReceiveTransfer(
  accountNumberId: string,
  amount: number,
  currency: string = "CLP"
): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/simulate/receive-transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_number_id: accountNumberId, amount, currency }),
  });
  return handleResponse(response);
}

// ── Transfers ────────────────────────────────────────────

export interface TransferRequest {
  client_id: number;
  account_id: string;
  amount: number;
  currency: string;
  comment: string;
  counterparty: {
    holder_id: string;
    holder_name: string;
    account_number: string;
    account_type: string;
    institution_id: string;
  };
  idempotency_key: string;
  simulate?: boolean;
}

export interface TransferResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  error?: string;
}

export async function executeTransfer(req: TransferRequest): Promise<TransferResponse> {
  const response = await fetch(`${API_BASE}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<TransferResponse>(response);
}

export async function executePendingTransfers(
  payload: object[],
  simulate: boolean = false
): Promise<{ results: TransferResponse[]; errors: string[] }> {
  const response = await fetch(`${API_BASE}/transfer-pending?simulate=${simulate}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse(response);
}
