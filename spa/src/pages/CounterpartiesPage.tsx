import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  fetchCounterparties,
  fetchInstitutions,
  createCounterparty,
  deleteCounterparty,
} from "@/services/api";
import type { FintocCounterparty, Institution } from "@/lib/types";
import { Users, Plus, Trash2, AlertTriangle, CheckCircle } from "lucide-react";

export default function CounterpartiesPage() {
  const [counterparties, setCounterparties] = useState<FintocCounterparty[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [holderId, setHolderId] = useState("");
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("checking_account");
  const [institutionId, setInstitutionId] = useState("");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [cps, insts] = await Promise.all([fetchCounterparties(), fetchInstitutions()]);
      setCounterparties(cps);
      setInstitutions(insts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setHolderId("");
    setHolderName("");
    setAccountNumber("");
    setAccountType("checking_account");
    setInstitutionId("");
    setResult(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!holderId || !holderName || !accountNumber || !institutionId) return;

    setCreating(true);
    setResult(null);
    try {
      const cp = await createCounterparty({
        holder_id: holderId,
        holder_name: holderName,
        account_number: accountNumber,
        account_type: accountType || undefined,
        institution_id: institutionId,
      });
      setResult({
        success: true,
        message: `Counterparty "${cp.holder_name || holderName}" created successfully.`,
      });
      resetForm();
      await loadData();
      setShowForm(false);
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to create counterparty",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(cpId: string, cpName: string | null) {
    if (!confirm(`Delete counterparty "${cpName || cpId}"? This cannot be undone.`)) return;
    try {
      await deleteCounterparty(cpId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete counterparty");
    }
  }

  function institutionName(id: string | null): string {
    if (!id) return "—";
    const inst = institutions.find((i) => i.id === id);
    return inst ? inst.name : id;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Counterparties
              </CardTitle>
              <CardDescription>
                Manage your Fintoc counterparties (transfer destinations).
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowForm(!showForm);
                setResult(null);
              }}
              className="flex items-center gap-1"
            >
              <Plus className="h-4 w-4" />
              New Counterparty
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-800 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : counterparties.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No counterparties yet. Create one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left p-3 font-medium">Name</th>
                    <th className="text-left p-3 font-medium">RUT</th>
                    <th className="text-left p-3 font-medium">Account</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Bank</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {counterparties.map((cp, idx) => (
                    <tr key={cp.id || idx} className="border-b border-border last:border-0">
                      <td className="p-3 font-medium">{cp.holder_name || "—"}</td>
                      <td className="p-3 font-mono text-xs">{cp.holder_id || "—"}</td>
                      <td className="p-3 font-mono text-xs">{cp.account_number || "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary">
                          {cp.account_type === "checking_account" ? "Cta. Corriente" : cp.account_type === "sight_account" ? "Cta. Vista" : cp.account_type || "—"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs">{institutionName(cp.institution_id)}</td>
                      <td className="p-3 text-right">
                        {cp.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(cp.id!, cp.holder_name)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create Counterparty</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="holderName">Name</Label>
                  <Input
                    id="holderName"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    placeholder="e.g. Piped Piper SpA"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="holderId">RUT / Holder ID</Label>
                  <Input
                    id="holderId"
                    value={holderId}
                    onChange={(e) => setHolderId(e.target.value)}
                    placeholder="e.g. 771433855"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. 502955923"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountType">Account Type</Label>
                  <Select
                    id="accountType"
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                  >
                    <option value="checking_account">Cuenta Corriente</option>
                    <option value="sight_account">Cuenta Vista</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="institution">Bank</Label>
                <Select
                  id="institution"
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  required
                >
                  <option value="">Select a bank...</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={creating || !holderId || !holderName || !accountNumber || !institutionId}>
                  {creating ? "Creating..." : "Create Counterparty"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
              </div>
            </form>

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
      )}
    </div>
  );
}
