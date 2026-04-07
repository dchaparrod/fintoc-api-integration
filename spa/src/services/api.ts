const API_BASE = "/api";

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

export interface ApiError {
  detail: string;
  status_code: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function executeTransfer(req: TransferRequest): Promise<TransferResponse> {
  const response = await fetch(`${API_BASE}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<TransferResponse>(response);
}

export async function executePendingTransfers(simulate: boolean = false): Promise<{ results: TransferResponse[]; errors: string[] }> {
  const response = await fetch(`${API_BASE}/transfer-pending?simulate=${simulate}`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse(response);
}
