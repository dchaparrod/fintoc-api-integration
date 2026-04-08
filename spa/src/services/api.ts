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

// ── Execution Plan ──────────────────────────────────────

export interface ExecutionPlanScheduleItem {
  day: number;
  date: string;
  amount: number;
  cumulative: number;
  remaining: number;
  idempotency_key: string;
}

export interface ExecutionPlanResponse {
  operation: {
    total_amount: number;
    currency: string;
    counterparty: string;
    account_id: string;
  };
  daily_limit: number;
  total_days: number;
  total_transactions: number;
  schedule: ExecutionPlanScheduleItem[];
}

export async function fetchExecutionPlan(params: {
  total_amount: number;
  counterparty_name?: string;
  account_id?: string;
  currency?: string;
  daily_limit?: number;
  start_date?: string;
}): Promise<ExecutionPlanResponse> {
  const response = await fetch(`${API_BASE}/simulate/execution-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<ExecutionPlanResponse>(response);
}

// ── Celery Tasks ────────────────────────────────────────

export async function enqueuePendingTasks(
  payload: object[],
  simulate: boolean = false
): Promise<{ task_id: string; status: string }> {
  const response = await fetch(`${API_BASE}/tasks/process-pending?simulate=${simulate}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function fetchTaskStatus(taskId: string): Promise<{
  task_id: string;
  status: string;
  result?: Record<string, unknown>;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/status`);
  return handleResponse(response);
}

// ── Webhook Events ──────────────────────────────────────

export interface WebhookEvent {
  id: string;
  event_type: string;
  transfer_id: string;
  status: string;
  timestamp: string;
  raw_payload: Record<string, unknown>;
}

export async function fetchWebhookEvents(
  since?: string,
  limit: number = 50
): Promise<WebhookEvent[]> {
  const params = new URLSearchParams();
  if (since) params.set("since", since);
  params.set("limit", String(limit));
  const response = await fetch(`${API_BASE}/webhook-events?${params}`);
  return handleResponse<WebhookEvent[]>(response);
}
