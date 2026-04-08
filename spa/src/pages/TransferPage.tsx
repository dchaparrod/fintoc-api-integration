import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createTransferOperation, listSavedCounterparties } from "@/db/queries";
import { fetchAccounts, fetchExecutionPlan } from "@/services/api";
import type { ExecutionPlanResponse } from "@/services/api";
import { formatCLP } from "@/lib/utils";
import type { FintocAccount, SavedCounterparty } from "@/lib/types";
import { Send, AlertTriangle, CheckCircle, CalendarDays } from "lucide-react";

const DAILY_LIMIT = 7_000_000;

export default function TransferPage() {
  const [accounts, setAccounts] = useState<FintocAccount[]>([]);
  const [counterparties, setCounterparties] = useState<SavedCounterparty[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedCounterpartyIdx, setSelectedCounterpartyIdx] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => {
    async function loadData() {
      setDataLoading(true);
      setDataError(null);
      try {
        const [accs, cps] = await Promise.all([fetchAccounts(), listSavedCounterparties()]);
        setAccounts(accs);
        setCounterparties(cps);
      } catch (err) {
        setDataError(err instanceof Error ? err.message : "Failed to load Fintoc data. Is the backend running?");
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, []);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const selectedCounterparty = selectedCounterpartyIdx !== "" ? counterparties.find(cp => cp.id === Number(selectedCounterpartyIdx)) || null : null;

  const amountNum = Number(amount) || 0;
  const daysNeeded = amountNum > 0 ? Math.ceil(amountNum / DAILY_LIMIT) : 0;
  const needsSplit = daysNeeded > 1;

  async function handlePreview() {
    if (!selectedAccount || !selectedCounterparty || amountNum <= 0) return;
    setPlanLoading(true);
    setExecutionPlan(null);
    setResult(null);
    try {
      const plan = await fetchExecutionPlan({
        total_amount: amountNum,
        counterparty_name: selectedCounterparty.holder_name,
        account_id: selectedAccount.id,
        currency: "CLP",
      });
      setExecutionPlan(plan);
      setShowPlan(true);
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Failed to fetch plan" });
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleConfirm() {
    if (!selectedAccount || !selectedCounterparty || amountNum <= 0) return;

    setLoading(true);
    setResult(null);

    try {
      const { operation, transactions } = await createTransferOperation({
        accountId: selectedAccount.id,
        accountName: selectedAccount.name || selectedAccount.id,
        counterpartyHolderId: selectedCounterparty.holder_id,
        counterpartyHolderName: selectedCounterparty.holder_name,
        counterpartyAccountNumber: selectedCounterparty.account_number,
        counterpartyAccountType: selectedCounterparty.account_type,
        counterpartyInstitutionId: selectedCounterparty.institution_id,
        totalAmount: amountNum,
        comment,
        description,
      });

      const txCount = transactions.length;
      const msg =
        txCount === 1
          ? `Operation #${operation.id} created with 1 transaction (${formatCLP(amountNum)})`
          : `Operation #${operation.id} created — split into ${txCount} transactions over ${txCount} days`;

      setResult({ success: true, message: msg });
      setAmount("");
      setComment("");
      setDescription("");
      setExecutionPlan(null);
      setShowPlan(false);
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsSplit && !showPlan) {
      handlePreview();
    } else {
      handleConfirm();
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            New Transfer
          </CardTitle>
          <CardDescription>
            Create a transfer operation. Amounts exceeding {formatCLP(DAILY_LIMIT)} will be automatically split across multiple days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dataError && (
            <div className="mb-4 p-4 rounded-md bg-red-50 text-red-800 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              {dataError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="account">Account (Origin)</Label>
              <Select
                id="account"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                required
                disabled={dataLoading}
              >
                <option value="">{dataLoading ? "Loading accounts..." : "Select an account..."}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.id} ({a.currency})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="counterparty">Counterparty (Destination)</Label>
              <Select
                id="counterparty"
                value={selectedCounterpartyIdx}
                onChange={(e) => setSelectedCounterpartyIdx(e.target.value)}
                required
                disabled={dataLoading}
              >
                <option value="">{dataLoading ? "Loading counterparties..." : "Select a counterparty..."}</option>
                {counterparties.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.holder_name} — {cp.account_number} ({cp.institution_id})
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (CLP)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 15000000"
                required
              />
              {amountNum > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{formatCLP(amountNum)}</span>
                  {needsSplit ? (
                    <Badge variant="warning" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Will be split into {daysNeeded} daily transactions
                    </Badge>
                  ) : (
                    <Badge variant="success">Single transaction</Badge>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comment (visible to counterparty)</Label>
              <Input
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. Pago de credito 10451"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (internal)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Internal notes for this operation"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || planLoading || !selectedAccount || !selectedCounterparty || amountNum <= 0}
              className="w-full"
            >
              {planLoading
                ? "Loading plan..."
                : loading
                ? "Creating..."
                : needsSplit && !showPlan
                ? "Preview Execution Plan"
                : "Confirm & Create Operation"}
            </Button>

            {showPlan && (
              <Button
                type="button"
                variant="ghost"
                className="w-full mt-2"
                onClick={() => { setShowPlan(false); setExecutionPlan(null); }}
              >
                Cancel
              </Button>
            )}
          </form>

          {executionPlan && showPlan && (
            <div className="mt-6 border border-border rounded-md overflow-hidden">
              <div className="bg-muted px-4 py-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                <span className="font-medium text-sm">
                  Execution Plan — {executionPlan.total_days} day{executionPlan.total_days > 1 ? "s" : ""}, {executionPlan.total_transactions} transaction{executionPlan.total_transactions > 1 ? "s" : ""}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left p-3 font-medium">Day</th>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    <th className="text-right p-3 font-medium">Cumulative</th>
                    <th className="text-right p-3 font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {executionPlan.schedule.map((row) => (
                    <tr key={row.day} className="border-b border-border last:border-0">
                      <td className="p-3 font-medium">{row.day}</td>
                      <td className="p-3 font-mono text-xs">{row.date}</td>
                      <td className="p-3 text-right">{formatCLP(row.amount)}</td>
                      <td className="p-3 text-right text-muted-foreground">{formatCLP(row.cumulative)}</td>
                      <td className="p-3 text-right text-muted-foreground">{formatCLP(row.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-muted px-4 py-2 text-xs text-muted-foreground flex justify-between">
                <span>Daily limit: {formatCLP(executionPlan.daily_limit)}</span>
                <span>Total: {formatCLP(executionPlan.operation.total_amount)}</span>
              </div>
            </div>
          )}

          {result && (
            <div
              className={`mt-4 p-4 rounded-md text-sm flex items-start gap-2 ${
                result.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
              }`}
            >
              {result.success ? <CheckCircle className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
              {result.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
