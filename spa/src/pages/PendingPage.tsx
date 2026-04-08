import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getOperationsWithDetails, getSucceededTransactions } from "@/db/queries";
import { formatCLP, formatDate, formatDateShort } from "@/lib/utils";
import { succeededTransactionsToCSV, downloadCSV } from "@/lib/csv";
import type { OperationWithDetails, OperationStatus, TransactionStatus } from "@/lib/types";
import { ClipboardList, ChevronDown, ChevronRight, RefreshCw, Download } from "lucide-react";
import { WEBHOOK_SYNC_EVENT } from "@/hooks/useWebhookSync";

const statusVariant: Record<OperationStatus, "default" | "warning" | "success" | "destructive"> = {
  pending: "warning",
  in_progress: "default",
  completed: "success",
  failed: "destructive",
};

const txStatusVariant: Record<TransactionStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  succeeded: "success",
  failed: "destructive",
  rejected: "destructive",
  returned: "secondary",
  return_pending: "warning",
};

export default function PendingPage() {
  const [operations, setOperations] = useState<OperationWithDetails[]>([]);
  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [execResult, setExecResult] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const ops = await getOperationsWithDetails();
      setOperations(ops);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh when webhook sync updates PGlite
  useEffect(() => {
    const handler = () => {
      console.log("[PendingPage] Webhook sync detected, refreshing...");
      loadData();
    };
    window.addEventListener(WEBHOOK_SYNC_EVENT, handler);
    return () => window.removeEventListener(WEBHOOK_SYNC_EVENT, handler);
  }, []);

  function toggleExpand(opId: number) {
    setExpandedOps((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  }

  async function handleRefresh() {
    setRefreshing(true);
    setExecResult(null);
    try {
      await loadData();
    } catch (err) {
      setExecResult(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDownloadCSV() {
    try {
      const rows = await getSucceededTransactions();
      if (rows.length === 0) {
        setExecResult("No succeeded transactions to export.");
        return;
      }
      const csv = succeededTransactionsToCSV(rows);
      const date = new Date().toISOString().split("T")[0];
      downloadCSV(csv, `succeeded-transfers-${date}.csv`);
    } catch (err) {
      setExecResult(err instanceof Error ? err.message : "Failed to export CSV");
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Pending Operations
              </CardTitle>
              <CardDescription>
                View all transfer operations and their associated transactions.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadCSV}
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {execResult && (
            <div className="mb-4 p-3 rounded-md bg-muted text-sm">{execResult}</div>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : operations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No operations yet.</div>
          ) : (
            <div className="space-y-2">
              {operations.map((op) => {
                const isExpanded = expandedOps.has(op.id);
                const pendingCount = op.transactions?.filter((t) => t.status === "pending").length ?? 0;
                return (
                  <div key={op.id} className="border border-border rounded-md">
                    <button
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpand(op.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <div className="font-medium text-sm">
                            #{op.id} — {op.account_name || op.account_id} → {op.counterparty_holder_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatCLP(op.total_amount)} · {formatDate(op.created_at)}
                            {op.comment && ` · ${op.comment}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {pendingCount > 0 && (
                          <span className="text-xs text-muted-foreground">{pendingCount} pending</span>
                        )}
                        <Badge variant={statusVariant[op.status]}>{op.status}</Badge>
                      </div>
                    </button>

                    {isExpanded && op.transactions && op.transactions.length > 0 && (
                      <div className="border-t border-border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-muted-foreground border-b border-border">
                              <th className="text-left p-3 font-medium">TX #</th>
                              <th className="text-left p-3 font-medium">Amount</th>
                              <th className="text-left p-3 font-medium">Scheduled</th>
                              <th className="text-left p-3 font-medium">Status</th>
                              <th className="text-left p-3 font-medium">Fintoc ID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {op.transactions.map((tx) => (
                              <tr key={tx.id} className="border-b border-border last:border-0">
                                <td className="p-3">{tx.id}</td>
                                <td className="p-3">{formatCLP(tx.amount)}</td>
                                <td className="p-3">{formatDateShort(tx.scheduled_date)}</td>
                                <td className="p-3">
                                  <Badge variant={txStatusVariant[tx.status]}>{tx.status}</Badge>
                                </td>
                                <td className="p-3 text-xs text-muted-foreground font-mono">
                                  {tx.fintoc_transfer_id || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
